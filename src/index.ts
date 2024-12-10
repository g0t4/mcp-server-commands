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

// TODO use .promises? in node api
const execAsync = promisify(exec);

let verbose = false;
// check CLI args:
if (process.argv.includes("--verbose")) {
    verbose = true;
}

const server = new Server(
    {
        name: "mcp-server-commands",
        version: "0.3.0",
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

function always_log(message: string) {
    console.error(message);
}

if (verbose) {
    always_log("INFO: verbose logging enabled");
} else {
    always_log("INFO: verbose logging disabled, enable it with --verbose");
}

function verbose_log(message: string) {
    // https://modelcontextprotocol.io/docs/tools/debugging - mentions various ways to debug/troubleshoot (including dev tools)
    //
    // remember STDIO transport means can't log over STDOUT (client expects JSON messages per the spec)
    // https://modelcontextprotocol.io/docs/tools/debugging#implementing-logging
    //   mentions STDERR is captured by the host app (i.e. Claude Desktop app)
    //   server.sendLoggingMessage is captured by MCP client (not Claude Desktop app)
    //   SO, IIUC use STDERR for logging into Claude Desktop app logs in:
    //      '~/Library/Logs/Claude/mcp.log'
    if (verbose) {
        console.error(message);
    }
    // inspector, catches these logs and shows them on left hand side of screen (sidebar)

    // TODO add verbose parameter (CLI arg?)

    // IF I wanted to log via MCP client logs (not sure what those are/do):
    //  I do not see inspector catching these logs :(, there is a server notifications section and it remains empty
    //server.sendLoggingMessage({
    //    level: "info",
    //    data: message,
    //});
    // which results in something like:
    //server.notification({
    //    method: "notifications/message",
    //    params: {
    //        level: "warning",
    //        logger: "mcp-server-commands",
    //        data: "ListToolsRequest2",
    //    },
    //});
    //
    // FYI client should also requets a log level from the server, so that needs to be here at some point too
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    verbose_log("INFO: ListToolsRequest");
    return {
        tools: [
            {
                name: "run_command",
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
        ],
    };
});

server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<{ toolResult: CallToolResult }> => {
        verbose_log("INFO: CallToolRequest: " + JSON.stringify(request));
        switch (request.params.name) {
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
        verbose_log("ERROR: run_command failed: " + JSON.stringify(error));
        return {
            isError: true,
            content: messagesFor(error as ExecResult),
            //content: [{ type: "text", text: JSON.stringify(error) }],
        };
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
        verbose_log("ERROR: run_script failed: " + JSON.stringify(error));
        return {
            isError: true,
            content: messagesFor(error as ExecResult),
        };
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
