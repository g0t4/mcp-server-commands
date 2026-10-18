import os from "os";
import { randomUUID } from "crypto";
import {
    CallToolRequestSchema,
    CallToolResult,
    ListToolsRequestSchema,
    ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { always_log, verbose_log } from "./logging.js";
import { runProcess } from "./run_process.js";
import { getProcess, drainStdout, drainStderr, killProcess } from "./process_registry.js";
import { errorResult } from "./messages.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function registerTools(server: Server, defaultCwd?: string) {
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
                            stdin_text: {
                                type: "string",
                                description: "Optional text written to STDIN (written fully, then closed). Useful for heredoc-style input or file contents."
                            },
                            timeout_seconds: {
                                type: "number",
                                description: "Default: 30 seconds.",
                            },
                            background: {
                                type: "boolean",
                                description: "If true, start in the background and return immediately with a TOKEN. Use process_status to poll it, process_stop to stop it.",
                            },
                        },
                        // FYI no required arg top level and I am not gonna fret about specifiying one or the other, the tool definition is fine with that distinction in the descriptions, plus it is intuitive.
                        //  and back when I had mode=shell/executable required, models would still forget to add it so why bother with a huge complexity in tool definition
                    },
                },
                {
                    name: "process_status",
                    description: "Check the status of a background process by token. Reports done (true/false) plus STDOUT/STDERR and exit code.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            token: {
                                type: "string",
                                description: "The token returned by run_process (background: true).",
                            },
                        },
                        required: ["token"],
                    },
                },
                {
                    name: "process_stop",
                    description: "Stop a background process by token.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            token: {
                                type: "string",
                                description: "The token returned by run_process (background: true).",
                            },
                        },
                        required: ["token"],
                    },
                },
            ],
        };
    });

    server.setRequestHandler(
        CallToolRequestSchema,
        async (request, extra): Promise<CallToolResult> => {
            verbose_log("INFO: ToolRequest", request);
            switch (request.params.name) {
                case "run_process": {
                    if (!request.params.arguments) {
                        throw new Error("Missing arguments for run_process");
                    }
                    // extra.signal is aborted by the SDK when the client sends a
                    // notifications/cancelled message for this request id.
                    const args = request.params.arguments;
                    const progressToken = request.params._meta?.progressToken;
                    const token = progressToken != null ? String(progressToken) : randomUUID();
                    function sendBackgroundDoneNotification(result: CallToolResult, token: string) {
                        // Custom notification (background/done), so
                        // the client can correlate it via progressToken and feed the
                        // result back to the agent without polling.
                        const isError = result.isError ?? false;
                        const resultText = result.content
                            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
                            .join("\n");
                        const message = isError
                            ? `FAILED: Background process ${token} failed\n\nRESULT: ${resultText}`
                            : `DONE: Background process ${token} completed\n\nRESULT: ${resultText}`;
                        const notification = {
                            method: "background/done",
                            params: {
                                progressToken,
                                token,
                                isError,
                                message,
                                result: resultText,
                                // optional params so we don't get vim.NIL in lua land
                                ...(isError ? { error: resultText } : {}),
                            },
                        };
                        // Send the notification! (was missing - bug)
                        server.notification(notification).catch((error) => {
                            always_log("ERROR: Failed to send background/done notification", error);
                        });
                    }
                    const result = await runProcess(
                        args,
                        extra.signal,
                        defaultCwd,
                        token,
                        sendBackgroundDoneNotification,
                    );
                    // FYI logging this response is INVALUABLE! found a problem with my neovim MCP STDIO client!
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                case "process_status": {
                    if (!request.params.arguments) {
                        throw new Error("Missing arguments for process_status");
                    }
                    const token = String(request.params.arguments.token ?? "");
                    if (!token) {
                        return errorResult("process_status requires a token");
                    }

                    const handle = getProcess(token);
                    if (!handle) {
                        return errorResult(`Process not found (token: ${token})`);
                    }

                    const done = handle.status !== "running";
                    const content: CallToolResult["content"] = [
                        { name: "DONE", type: "text", text: String(done) },
                    ];

                    if (done && handle.finalResult) {
                        // Same STDOUT/STDERR + exit code as a foreground run.
                        content.push(...handle.finalResult.content);
                    } else {
                        // Still running: surface whatever output has accumulated so far,
                        // then DRAIN the buffers so subsequent polls only see new output.
                        const drainedStdout = drainStdout(handle);
                        if (drainedStdout) {
                            content.push({ name: "STDOUT", type: "text", text: drainedStdout });
                        }
                        const drainedStderr = drainStderr(handle);
                        if (drainedStderr) {
                            content.push({ name: "STDERR", type: "text", text: drainedStderr });
                        }
                    }

                    const result: CallToolResult = { content };
                    if (done && handle.finalResult?.isError) {
                        result.isError = true;
                    }
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                case "process_stop": {
                    if (!request.params.arguments) {
                        throw new Error("Missing arguments for process_stop");
                    }
                    const token = String(request.params.arguments.token ?? "");
                    if (!token) {
                        return errorResult("process_stop requires a token");
                    }

                    const handle = getProcess(token);
                    if (!handle) {
                        return errorResult(`Process not found (token: ${token})`);
                    }

                    killProcess(handle, "SIGTERM");
                    const killTimeout = setTimeout(() => killProcess(handle, "SIGKILL"), 2000);
                    handle.child?.once("exit", () => clearTimeout(killTimeout));

                    const result: CallToolResult = {
                        content: [{ name: "STOPPED", type: "text", text: token }],
                    };
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                default:
                    throw new Error("Unknown tool");
            }
        }
    );
}
