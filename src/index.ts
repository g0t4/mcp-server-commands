#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    PromptMessage,
    TextContent,
    ListToolsRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec, ExecOptions } from "node:child_process";
import { ObjectEncodingOptions } from "node:fs";
import { promisify } from "node:util";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { execFileWithInput, ExecResult } from "./exec-utils.js";

import { createRequire } from "module";
import { always_log,  verbose_log } from "./logs.js";

const require = createRequire(import.meta.url);
const { name: package_name, version: package_version } = require("../package.json");

// TODO use .promises? in node api
const execAsync = promisify(exec);

const server = new Server(
    {
        name: package_name,
        version: package_version,
        //description: "Run commands on this " + os.platform() + " machine",
    },
    {
        capabilities: {
            //resources: {},
            tools: {},
            prompts: {},
            //logging: {}, // for logging messages that don't seem to work yet or I am doing them wrong
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    verbose_log("INFO: ListTools");
    return {
        tools: [
            {
                name: "run_command",
                //description: "Run a command on this " + os.platform() + " machine",
                inputSchema: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            description: "Command with args",
                        },
                        cwd: {
                            // previous run_command calls can probe the filesystem and find paths to change to
                            type: "string",
                            description:
                                "Current working directory, leave empty in most cases",
                        },
                        // FYI using child_process.exec runs command in a shell, so you can pass a script here too but I still think separate tools would be helpful?
                        //   FYI gonna use execFile for run_script
                        // - env - obscure cases where command takes a param only via an env var?
                        // args to consider:
                        // - timeout - lets just hard code this for now
                        // - shell - (cmd/args) - for now use run_script for this case, also can just pass "fish -c 'command'" or "sh ..."
                        // - stdin? though this borders on the run_script below
                        // - capture_output (default true) - for now can just redirect to /dev/null - perhaps capture_stdout/capture_stderr
                    },
                    required: ["command"],
                },
            },
            // PRN tool to introspect the environment (i.e. windows vs linux vs mac, maybe default shell, etc?) - for now LLM can run commands and when they fail it can make adjustments accordingly - some cases where knowing this would help avoid dispatching erroneous commands (i.e. using free on linux, vm_stat on mac)
            {
                // TODO is run_script even needed if I were to add STDIN support to run_command above?
                name: "run_script",
                // TODO is it useful to include OS type? I need to test this on a windows machine and see how Claude does w/ and w/o this os hint:
                //description: "Run a script on this " + os.platform() + " machine",
                inputSchema: {
                    type: "object",
                    properties: {
                        interpreter: {
                            // TODO use shebang on *nix?
                            type: "string",
                            description:
                                "Command with arguments. Script will be piped to stdin. Examples: bash, fish, zsh, python, or: bash --norc",
                        },
                        script: {
                            type: "string",
                            description: "Script to run",
                        },
                        cwd: {
                            type: "string",
                            description: "Current working directory",
                        },
                    },
                    required: ["script"],
                },
            },

            {
                name: "write_command_notes",
                description: "Use sparingly to record notes that you would benefit from knowing for future run_command/run_script tool use. For example, if you encounter an error with a command and find a workaround",
                inputSchema: {
                    type: "object",
                    properties: {
                        all_notes: {
                            type: "string",
                            description: "This replaces the entire notes file, it's not just appending"
                        },
                    },
                    required: ["all_notes"],
                },
            },
            {
                name: "read_command_notes",
                description: "Reads all command notes",
            }
        ],
    };
});

server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<{ toolResult: CallToolResult }> => {
        verbose_log("INFO: ToolRequest", request);
        switch (request.params.name) {
            case "write_command_notes": {
                return {
                    toolResult: await writeCommandNotes(request.params.arguments),
                };
            }
            case "read_command_notes": {
                return {
                    toolResult: await readCommandNotes(),
                };
            }
            case "run_command": {
                return {
                    toolResult: await runCommand(request.params.arguments),
                };
            }
            case "run_script": {
                return {
                    toolResult: await runScript(request.params.arguments),
                };
            }
            default:
                throw new Error("Unknown tool");
        }
    }
);

async function runCommand(
    args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
    const command = String(args?.command);
    if (!command) {
        throw new Error("Command is required");
    }

    const options: ExecOptions = {};
    if (args?.cwd) {
        options.cwd = String(args.cwd);
        // ENOENT is thrown if the cwd doesn't exist, and I think LLMs can understand that?
    }

    try {
        const result = await execAsync(command, options);
        return {
            isError: false,
            content: messagesFor(result),
        };
    } catch (error) {
        // TODO catch for other errors, not just ExecException
        // FYI failure may not always be a bad thing if for example checking for a file to exist so just keep that in mind in terms of logging?
        const response = {
            isError: true,
            content: messagesFor(error as ExecResult),
        };
        always_log("WARN: run_command failed", response);
        return response;
    }
}

async function runScript(
    args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
    const interpreter = String(args?.interpreter);
    if (!interpreter) {
        throw new Error("Interpreter is required");
    }

    const options: ObjectEncodingOptions & ExecOptions = {
        //const options = {
        // constrains typescript too, to string based overload
        encoding: "utf8",
    };
    if (args?.cwd) {
        options.cwd = String(args.cwd);
        // ENOENT is thrown if the cwd doesn't exist, and I think LLMs can understand that?
    }

    const script = String(args?.script);
    if (!script) {
        throw new Error("Script is required");
    }

    try {
        const result = await execFileWithInput(interpreter, script, options);
        return {
            isError: false,
            content: messagesFor(result),
        };
    } catch (error) {
        const response = {
            isError: true,
            content: messagesFor(error as ExecResult),
        };
        always_log("WARN: run_script failed", response);
        return response;
    }
}

function messagesFor(result: ExecResult): TextContent[] {
    const messages: TextContent[] = [];
    if (result.message) {
        messages.push({
            // most of the time this is gonna match stderr, TODO do I want/need both error and stderr?
            type: "text",
            text: result.message,
            name: "ERROR",
        });
    }
    if (result.stdout) {
        messages.push({
            type: "text",
            text: result.stdout,
            name: "STDOUT",
        });
    }
    if (result.stderr) {
        messages.push({
            type: "text",
            text: result.stderr,
            name: "STDERR",
        });
    }
    return messages;
}

server.setRequestHandler(ListPromptsRequestSchema, async () => {
    verbose_log("INFO: ListPrompts");
    return {
        prompts: [
            {
                name: "run_command",
                description:
                    "Include command output in the prompt. Instead of a tool call, the user decides what commands are relevant.",
                arguments: [
                    {
                        name: "command",
                        required: true,
                    },
                ],
            },
        ],
    };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "run_command") {
        throw new Error("Unknown prompt");
    }
    verbose_log("INFO: PromptRequest", request);

    const command = String(request.params.arguments?.command);
    if (!command) {
        throw new Error("Command is required");
    }
    // Is it possible/feasible to pass a path for the CWD when running the command?
    // - currently it uses / (yikez)
    // - IMO makes more sense to have it be based on the Zed CWD of each project
    // - Fallback could be to configure on server level (i.e. home dir of current user) - perhaps CLI arg? (thinking of zed's context_servers config section)

    const { stdout, stderr } = await execAsync(command);
    // TODO gracefully handle errors and turn them into a prompt message that can be used by LLM to troubleshoot the issue, currently errors result in nothing inserted into the prompt and instead it shows the Zed's chat panel as a failure

    const messages: PromptMessage[] = [
        {
            role: "user",
            content: {
                type: "text",
                text:
                    "I ran the following command, if there is any output it will be shown below:\n" +
                    command,
            },
        },
    ];
    if (stdout) {
        messages.push({
            role: "user",
            content: {
                type: "text",
                text: "STDOUT:\n" + stdout,
            },
        });
    }
    if (stderr) {
        messages.push({
            role: "user",
            content: {
                type: "text",
                text: "STDERR:\n" + stderr,
            },
        });
    }
    verbose_log("INFO: PromptResponse", messages);
    return { messages };
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
