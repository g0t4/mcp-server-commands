import os from "os";
import {
    CallToolRequestSchema,
    CallToolResult,
    ListToolsRequestSchema,
    ListToolsResult
} from "@modelcontextprotocol/sdk/types.js";
import { verbose_log } from "./always_log.js";
import { runCommand } from "./run-command.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function reisterTools(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
        verbose_log("INFO: ListTools");
        return {
            tools: [
                // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool // tool definition
                //   ts schema: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-11-25/schema.ts
                // https://modelcontextprotocol.io/docs/learn/architecture#understanding-the-tool-execution-request // tool request/response
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
                                description:
                                    "Optional, current working directory",
                            },
                            stdin: {
                                type: "string",
                                description:
                                    "Optional, text to pipe into the command's STDIN. For example, pass a python script to python3. Or, pass text for a new file to the cat command to create it!",
                            },
                            timeout: {
                                type: "number",
                                description: "Optional, timeout in milliseconds, defaults to 1000 milliseconds.",
                            },
                            // args to consider:
                            // - env - obscure cases where command takes a param only via an env var?
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
}
