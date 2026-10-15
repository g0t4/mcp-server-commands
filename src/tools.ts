import os from "os";
import {
    CallToolRequestSchema,
    CallToolResult,
    ListToolsRequestSchema,
    ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { verbose_log } from "./logging.js";
import { runProcess } from "./run_process.js";
import { getProcess, waitForProcess } from "./process_registry.js";
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
                            timeout_ms: {
                                type: "number",
                                description: "Optional timeout in milliseconds, defaults to 30,000ms",
                            },
                            background: {
                                type: "boolean",
                                description: "If true, start the process in the background and return immediately with its PID (in a PID message) instead of blocking until it finishes. Use process_status to poll it, or kill it yourself (e.g. `kill <pid>`).",
                            },
                            notify_on_completion: {
                                type: "boolean",
                                description: "Only applicable with background: true. If true, the server sends a background/done notification when the process finishes, so you don't have to poll or sleep.",
                            },
                        },
                        // FYI no required arg top level and I am not gonna fret about specifiying one or the other, the tool definition is fine with that distinction in the descriptions, plus it is intuitive.
                        //  and back when I had mode=shell/executable required, models would still forget to add it so why bother with a huge complexity in tool definition
                    },
                },
                {
                    name: "process_status",
                    description: "Check the status of a background process started with run_process (background: true). Reports done (true/false) plus STDOUT/STDERR and exit code, same as a foreground run once done. Optionally wait for completion.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            pid: {
                                type: "number",
                                description: "The PID returned by run_process.",
                            },
                            wait: {
                                type: "boolean",
                                description: "If true, block until the process completes (or wait_timeout_ms elapses). Default false.",
                            },
                            wait_timeout_ms: {
                                type: "number",
                                description: "Optional max milliseconds to wait when wait is true. No limit if omitted.",
                            },
                        },
                        required: ["pid"],
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
                    const notifyOnCompletion = Boolean(args.notify_on_completion);
                    const progressToken = request.params._meta?.progressToken;
                    const result = await runProcess(
                        args,
                        extra.signal,
                        defaultCwd,
                        notifyOnCompletion
                            ? (result, pid) => {
                                // Standard out-of-band progress notification when the
                                // client requested a progress token.
                                if (progressToken != null) {
                                    server.notification({
                                        method: "background/status",
                                        params: {
                                            progressToken,
                                            message: `Background process ${pid} completed`,
                                        },
                                    }).catch(() => { });
                                }
                                // Custom notification matching the format used by
                                // the subagents MCP server (background/done), so
                                // the client can correlate it via progressToken and feed the
                                // result back to the agent without polling.
                                const isError = result.isError ?? false;
                                const resultText = result.content
                                    .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
                                    .join("\n");
                                const message = isError
                                    ? `FAILED: Background process ${pid} completed with error\n\nRESULT: ${resultText}`
                                    : `DONE: Background process ${pid} completed\n\nRESULT: ${resultText}`;
                                const notification = {
                                    method: "background/done",
                                    params: {
                                        progressToken,
                                        pid: pid,
                                        isError,
                                        message,
                                        result: resultText,
                                        // optional params so we don't get vim.NIL in lua land
                                        ...(isError ? { error: resultText } : {}),
                                    },
                                };
                                // Send the notification! (was missing - bug)
                                server.notification(notification).catch(() => { });
                            }
                            : undefined,
                    );
                    // FYI logging this response is INVALUABLE! found a problem with my neovim MCP STDIO client!
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                case "process_status": {
                    if (!request.params.arguments) {
                        throw new Error("Missing arguments for process_status");
                    }
                    const pid = Number(request.params.arguments.pid);
                    if (Number.isNaN(pid)) {
                        return errorResult("process_status requires a numeric pid");
                    }

                    const handle = getProcess(pid);
                    if (!handle) {
                        return errorResult(`Process not found (pid: ${pid})`);
                    }

                    const wait = Boolean(request.params.arguments.wait);
                    const waitTimeoutMs = request.params.arguments.wait_timeout_ms == null
                        ? undefined
                        : Number(request.params.arguments.wait_timeout_ms);

                    if (wait) {
                        await waitForProcess(handle, waitTimeoutMs);
                    }

                    const done = handle.status !== "running";
                    const content: CallToolResult["content"] = [
                        { name: "DONE", type: "text", text: String(done) },
                    ];

                    if (done && handle.finalResult) {
                        // Same STDOUT/STDERR + exit code as a foreground run.
                        content.push(...handle.finalResult.content);
                    } else {
                        // Still running: surface whatever output has accumulated so far.
                        if (handle.stdout) {
                            content.push({ name: "STDOUT", type: "text", text: handle.stdout });
                        }
                        if (handle.stderr) {
                            content.push({ name: "STDERR", type: "text", text: handle.stderr });
                        }
                    }

                    const result: CallToolResult = { content };
                    if (done && handle.finalResult?.isError) {
                        result.isError = true;
                    }
                    verbose_log("INFO: ToolResponse", result);
                    return result;
                }
                default:
                    throw new Error("Unknown tool");
            }
        }
    );
}
