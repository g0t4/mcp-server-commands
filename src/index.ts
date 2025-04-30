#!/usr/bin/env node
import os from "os";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    PromptMessage,
    ListToolsRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runCommand } from "./run-command.js";

import { createRequire } from "module";
import { verbose_log } from "./always_log.js";
const require = createRequire(import.meta.url);
const {
    name: package_name,
    version: package_version,
} = require("../package.json");

// TODO use .promises? in node api
const execAsync = promisify(exec);

const server = new Server(
    {
        name: package_name,
        version: package_version,
        description: "Run commands on this " + os.platform() + " machine",
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
                description:
                    "Run a command on this " + os.platform() + " machine",
                inputSchema: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            description: "Command with args",
                        },
                        workdir: {
                            // previous run_command calls can probe the filesystem and find paths to change to
                            type: "string",
                            description: "Optional, current working directory",
                        },
                        stdin: {
                            type: "string",
                            description:
                                "Optional, text to pipe into the command's STDIN. For example, pass a python script to python3. Or, pass text for a new file to the cat command to create it!",
                        },
                        // args to consider:
                        // - env - obscure cases where command takes a param only via an env var?
                        // - timeout - lets just hard code this for now
                    },
                    required: ["command"],
                },
            },
        ],
    };
});

server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
        verbose_log("INFO: ToolRequest", request);
        switch (request.params.name) {
            case "run_command": {
                return await runCommand(request.params.arguments);
            }
            default:
                throw new Error("Unknown tool");
        }
    }
);

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
                    // if I care to keep the prompt tools then add stdin?
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
    // Is it possible/feasible to pass a path for the workdir when running the command?
    // - currently it uses / (yikez)
    // - IMO makes more sense to have it be based on the Zed workdir of each project
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
