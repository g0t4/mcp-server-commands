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

export function reisterTools(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
        verbose_log("INFO: ListTools");
        return {
            // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool // tool definition
            // https://modelcontextprotocol.io/docs/learn/architecture#understanding-the-tool-execution-request // tool request/response
            // typescript SDK docs:
            //   servers: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
            tools: [
                {
                    // TODO RUN_PROCESS MIGRATION! provide examples in system message, that way it is very clear how to use these!
                    name: "run_process",
                    description: "Run a process on this " + os.platform() + " machine",
                    inputSchema: {
                        type: "object",
                        properties: {
                            // ListToolsResult => Tool type (in protocol) => https://modelcontextprotocol.io/specification/2025-06-18/schema#tool
                            // * appears I can do w/e I want to describe properties (as long as give a string key (name)) => hence enum below
                            mode: {
                                enum: ["shell", "executable"], // * I made this up
                                description: "What are you running, two choices: 'shell' or 'executable' (required, no default)",
                                // FYI only use default system shell, if the model wants a different shell, can explicitly run it with command_line/argv
                                //   DO NOT duplicate the mechanism of specifying what runs by adding yet another executable field!
                                //   spawn's options.shell is bool/string... string is command_name/path... that duplicates and complicates needlessly!
                            },
                            command_line: {
                                type: "string",
                                description: "Shell command line. Required when mode='shell'. Forbidden when mode='executable'."
                            },
                            argv: {
                                minItems: 1, // * made up too
                                type: "array",
                                items: { type: "string" },
                                description: "Executable and arguments. argv[0] is the executable. Required when mode='executable'. Forbidden when mode='shell'."
                            },
                            cwd: {
                                // or "workdir" like before? => eval model behavior w/ each name?
                                type: "string",
                                description: "Optional to set working directory",
                            },
                            input: {
                                // execFileSync uses "input" and tool calls are sync by nature (in current incarnation, w.r.t. to the model its sync)
                                // PRN or name it "stdin"?
                                //   "stdin" is somewhat vague b/c it can be a toggle / config knob to specify pipe/inherit/overlapped/ignore/etc ...
                                type: "string",
                                description: "Optional text written to STDIN (written fully, then closed). Useful for heredoc-style input or file contents."
                            },
                            timeout_ms: {
                                type: "number",
                                description: "Optional timeout in milliseconds, defaults to 1000 milliseconds.",
                            },
                            dry_run: {
                                type: "boolean",
                                description: "Optional explain what would run, defaults to False."
                                // FYI this can help avoid the need for logging this information, I can call this as a user too!
                                // TODO, dump info about shell (if applicable) and program versions!
                                //  - explain the node calls too, i.e. spawn('echo foo')
                                //  - show paths of resolved resources (i.e. shell)
                                //  - i.e. could run command --version to see its version (attempt various flags until one works, and/or have a lookup of common tools to know how to find their version)
                            }
                            // MAYBEs:
                            // - env - obscure cases where command takes a param only via an env var?
                        },
                        required: ["mode"],
                        // PRN add proprietary constraints explanation? only if model seems to struggle and there isn't a better fix...
                        // oneOf: [
                        //     {
                        //         properties: { mode: { const: "shell" } },
                        //         required: ["command_line"],
                        //         not: { required: ["argv"] }
                        //     },
                        //     {
                        //         properties: { mode: { const: "executable" } },
                        //         required: ["argv"],
                        //         not: { required: ["command_line"] }
                        //     }
                        // ]
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
                    return await runProcess(request.params.arguments);
                }
                default:
                    throw new Error("Unknown tool");
            }
        }
    );
}
