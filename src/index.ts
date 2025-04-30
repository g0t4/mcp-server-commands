#!/usr/bin/env node

import os from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runCommand } from "./run-command.js";

import { createRequire } from "module";
import { verbose_log } from "./always_log.js";
import { registerPrompts } from "./prompts.js";
const require = createRequire(import.meta.url);
const {
    name: package_name,
    version: package_version,
} = require("../package.json");

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

registerPrompts(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
