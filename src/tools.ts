import os from "os";
import {
    CallToolRequestSchema,
    CallToolResult,
    ListToolsRequestSchema,
    ListToolsResult
} from "@modelcontextprotocol/sdk/types.js";
import { verbose_log } from "./always_log.js";
import { runProcess } from "./run_process.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function registerTools(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
        verbose_log("INFO: ListTools");
        return {
            // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool // tool definition
            // https://modelcontextprotocol.io/docs/learn/architecture#understanding-the-tool-execution-request // tool request/response
            // typescript SDK docs:
            //   servers: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
            //   TODO upgrade to newer version AND check if STDIO delimiter style has changed to include content-length "header" before responses? 
            //     OR is there an opt-in for this style vs what I get with my simple nvim uv.spawn nvim client... where \n terminates/delimits each message
            tools: [
                {
                    // TODO RUN_PROCESS MIGRATION! provide examples in system message, that way it is very clear how to use these!
                    name: "run_process",
                    description: "Run a process on this " + os.platform() + " machine",
                    inputSchema: {
                        type: "object",
                        properties: {
                            // ListToolsResult => Tool type (in protocol) => https://modelcontextprotocol.io/specification/2025-06-18/schema#tool
                            command_line: {
                                type: "string",
                                description: "Shell mode: a shell command line executed via the system's default shell. Supports pipes, redirects, globbing. Cannot be combined with 'argv'."
                            },
                            argv: {
                                minItems: 1, // * made up too
                                type: "array",
                                items: { type: "string" },
                                description: "Executable mode: directly spawn a process. argv[0] is the executable, followed by arguments passed verbatim (no shell interpretation). Cannot be combined with 'command_line'."
                            },
                            cwd: {
                                // or "workdir" like before? => eval model behavior w/ each name?
                                type: "string",
                                description: "Optional to set working directory",
                            },
                            stdin: {
                                type: "string",
                                description: "Optional text written to STDIN (written fully, then closed). Useful for heredoc-style input or file contents."
                            },
                            timeout_ms: {
                                type: "number",
                                description: "Optional timeout in milliseconds, defaults to 30,000ms",
                            }
                        },
                        // FYI no required arg top level and I am not gonna fret about specifiying one or the other, the tool definition is fine with that distinction in the descriptions, plus it is intuitive.
                        //  and back when I had mode=shell/executable required, models would still forget to add it so why bother with a huge complexity in tool definition
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
                case "run_process": {
                    const result = await runProcess(request.params.arguments);
                    // FYI logging this response is INVALUABLE! found a problem with my neovim MCP STDIO client!
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                default:
                    throw new Error("Unknown tool");
            }
        }
    );
}
