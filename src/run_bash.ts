// TODO cleanup exec usages once spawn is ready
import { spawn, SpawnOptions, ChildProcess } from "child_process";
import { ObjectEncodingOptions } from "fs";
import { performance } from "perf_hooks";
import { is_verbose, verbose_log } from "./logging.js";
import { resultFor } from "./messages.js";
import { errorResult } from "./messages.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getBlockingMessage } from "./blocking_commands.js";
import { registerProcess, ProcessHandle, generateToken } from "./process_registry.js";

export type SpawnResult = {
    // this is basically ExecException except I want my own type for it...
    //   b/c I want this to represent all results
    //   ... by the way throws put stdout/stderr on the error "result" object
    //       hence I am replicating that here and in my promise reject calls
    stdout: string;
    stderr: string;

    code?: number;
    signal?: NodeJS.Signals | undefined;
};

export type SpawnFailure = SpawnResult & {
    // ONLY on errors:
    message?: string; // FYI redundant b/c message ~= `Command failed: ${cmd}\n${stderr}\n`
    killed?: boolean;
};

export type SpawnPromise = Promise<CallToolResult> & { pid?: number; token?: string };

/**
 * Raw arguments passed to {@link runBash}. Historically this was a loose
 * {@link Record} but we now expose a typed helper for safer access.
 */
export type RunBashArgs = Record<string, unknown>;

/**
 * Helper class that provides typed getters for the keys accepted by
 * {@link runBash}. It wraps a {@link RunBashArgs} object and casts the
 * values to the expected runtime types.
 */
export class RunBashArgsHelper {
    private readonly raw: RunBashArgs;

    constructor(raw: RunBashArgs) {
        this.raw = raw ?? {};
    }

    /** Working directory – string if supplied, otherwise undefined */
    get cwd(): string | undefined {
        const v = this.raw.cwd;
        return v == null ? undefined : String(v);
    }

    /** Text to write to STDIN – string if supplied, otherwise undefined */
    get stdin_text(): string | undefined {
        const v = this.raw.stdin_text;
        return v == null ? undefined : String(v);
    }

    /** Shell command line – string if supplied, otherwise undefined */
    get commandLine(): string | undefined {
        const v = this.raw.command_line;
        return v == null ? undefined : String(v);
    }

    /** Timeout in seconds – always a number (default 30) */
    get timeoutSeconds(): number {
        const v = this.raw.timeout_seconds;
        const n = Number(v);
        return Number.isNaN(n) ? 30 : n;
    }

    /** True if a shell command line is provided */
    get isShellMode(): boolean {
        return Boolean(this.commandLine);
    }

    /** True if the process should be started in the background (fire-and-forget) */
    get background(): boolean {
        return Boolean(this.raw.background);
    }
}

/**
 * Kills an entire process group (the child plus any descendants). On non-Windows
 * platforms the negative PID targets the whole group; on Windows we kill the child.
 */
function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
    if (process.platform !== "win32") {
        if (child.pid) {
            try { process.kill(-child.pid, signal); } catch (_) { }
        }
    } else {
        child.kill(signal);
    }
}

export function runBash(
    runBashArgs: RunBashArgs,
    signal?: AbortSignal,
    defaultCwd?: string,
    token?: string,
    onComplete?: (result: CallToolResult, token: string) => void,
): SpawnPromise {
    const startTime = performance.now();
    // The token is the process's identity for `process_status`/`process_stop`.
    // If the client didn't supply a progressToken we synthesize one and echo
    // it back so the agent can still reference the process.
    const resolvedToken = token ?? generateToken();

    const args = new RunBashArgsHelper(runBashArgs);
    if (!args.isShellMode) {
        return Promise.resolve(errorResult("'command_line' (string) is required."));
    }

    // Block dangerous commands via dedicated module
    const blockMsg = getBlockingMessage(args);
    if (blockMsg) {
        return Promise.resolve(errorResult(blockMsg));
    }

    const options: ObjectEncodingOptions & SpawnOptions = {
        // spawn options: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
        encoding: "utf8"
    };
    // Prefer the per-call cwd, then the server's --workdir default, then
    // fall back to the process's own CWD (spawn's default).
    const cwd = args.cwd ?? defaultCwd;
    if (cwd) {
        options.cwd = cwd;
    }

    (options as any).shell = true;
    const spawnCommand = String(args.commandLine);
    const spawnArgs: string[] = [];

    const logWithElapsedTime = (msg: string, ...rest: any[]) => {
        if (!is_verbose) return;

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
        verbose_log(`[${elapsed}s] ${msg}`, ...rest, spawnCommand, spawnArgs);
    };

    let child_pid;
    const promise: SpawnPromise = new Promise<CallToolResult>((resolve, reject) => {
        if (!args.stdin_text) {
            // PRN windowsHide on Windows, signal, killSignal
            // FYI spawn_options.stdio => default is perfect ['pipe', 'pipe', 'pipe']
            //     order: [STDIN, STDOUT, STDERR]
            //     https://nodejs.org/api/child_process.html#optionsstdio
            //     'ignore' attaches /dev/null
            //     do not set 'inherit' (causes ripgrep to see STDIN socket and search it, thus hanging)
            options.stdio = ['ignore', 'pipe', 'pipe'];
        }

        // remove timeout on spawn options (if set) so the built‑in spawn timeout does not interfere
        delete (options as any).timeout;

        // Use a detached child so we can kill the entire process group.
        options.detached = true;

        const child = spawn(spawnCommand, spawnArgs, options);
        logWithElapsedTime(`START SPAWN child.pid: ${child.pid}`);
        child_pid = child.pid;

        // Background processes are registered so `process_status` can poll them.
        const handle: ProcessHandle | undefined =
            args.background && child.pid ? registerProcess(resolvedToken, child) : undefined;

        let stdout = "";
        let stderr = "";

        if (child.stdin && args.stdin_text) {
            child.stdin.write(args.stdin_text);
            child.stdin.end();
        }

        if (child.stdout) {
            child.stdout.on("data", (chunk: Buffer | string) => {
                const text = chunk.toString();
                stdout += text;
                if (handle) handle.stdout += text;
            });
        }

        if (child.stderr) {
            child.stderr.on("data", (chunk: Buffer | string) => {
                const text = chunk.toString();
                stderr += text;
                if (handle) handle.stderr += text;
            });
        }

        child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            // child process streams MAY still be open when EXIT is emitted (use close if need to ensure they're closed)
            // "close" will come after "exit" once process is terminated + streams are closed
            // so for now use "close" to determine if process was terminated too, that way you can access STDOUT/STDERR reliably for returning full output to agent
            logWithElapsedTime("EXIT", { code, signal });
        });
        child.on("spawn", () => {
            // emitted after child process starts successfully
            // if child doesn't start, error emitted instead
            // emitted BEFORE any data received via stdout/stderr
            logWithElapsedTime("SPAWN")
        });

        // Guard against 'error' and 'close' both firing for the same process.
        let processSettled = false;

        // Build the result and settle the process. In non-background mode this
        // also resolves the outer promise; in background mode it only records
        // the result in the handle so `process_status` can read it later.
        const onProcessSettled = (result: SpawnResult, isError: boolean) => {
            if (processSettled) return;
            processSettled = true;
            const finalResult = resultFor(result);
            if (handle) {
                handle.status = isError ? "error" : "exited";
                handle.finalResult = finalResult;
                handle.child = undefined;
                handle.resolveSettled();
                if (handle) {
                    onComplete?.(finalResult, resolvedToken);
                }
            }
            if (!args.background) {
                if (timer) clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                resolve(finalResult);
            }
        };

        child.on("error", (err: Error) => {
            logWithElapsedTime("ERROR");
            // ChildProcess 'error' docs: https://nodejs.org/api/child_process.html#event-error
            // error running process
            // IIUC not just b/c of command failed w/ non-zero exit code
            const result: SpawnFailure = {
                stdout,
                stderr,
                //
                // one of these will always be non-null
                code: (err as any).code, // set if process exited, else null
                signal: (err as any).signal, // set if process was terminated by signal, else null
                //
                message: err.message,
                // ? killed: (err as any).killed
            };
            logWithElapsedTime("ERROR_RESULT", result);
            onProcessSettled(result, true);
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
            logWithElapsedTime("CLOSE");
            // ChildProcess 'close' docs: https://nodejs.org/api/child_process.html#event-close
            //   'close' is after child process ends AND stdio streams are closed
            //   - after 'exit' or 'error'

            //   either code is set, or signal, but NOT BOTH
            //   signal if process killed
            // FYI close does not mean code==0
            const result: SpawnResult = {
                stdout,
                stderr,
                //
                code: code ?? undefined,
                signal: signal ?? undefined,
                //
            };
            logWithElapsedTime("CLOSE_RESULT", result);
            onProcessSettled(result, false);
        });

        // Background mode: return immediately with the TOKEN so the agent can
        // poll via `process_status` or stop it via `process_stop`. No timeout
        // is applied here – the agent is responsible for stopping it.
        if (args.background) {
            const startedResult: CallToolResult = {
                content: [
                    { name: "TOKEN", type: "text", text: resolvedToken },
                    { name: "DONE", type: "text", text: "false" },
                ],
            };
            resolve(startedResult);
            return;
        }

        // Non-background timeout handling – kill the whole process group after
        // the supplied timeout.
        let timer: NodeJS.Timeout | null = null;

        // Kill the whole process group, escalating to SIGKILL if the child lingers.
        const killGroup = (sig: NodeJS.Signals) => {
            killProcessGroup(child, sig);
            const killTimeout = setTimeout(() => {
                killProcessGroup(child, "SIGKILL");
            }, 2000);
            const clearKill = () => clearTimeout(killTimeout);
            child.once("exit", clearKill);
            child.once("close", clearKill);
        };

        timer = setTimeout(() => killGroup("SIGTERM"), args.timeoutSeconds * 1000);

        // MCP cancellation – the SDK aborts the request's signal when a
        // notifications/cancelled message arrives for this request id.
        const onAbort = () => {
            if (processSettled) return;
            killGroup("SIGTERM");
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
    // FYI later (when needed) I can map this onto the promise that comes back from runBash too (and tie into that unit test I have that needs pid to terminate it)
    // Keep the underlying pid internally (tests still use it to terminate), but
    // the agent-facing identity is the token.
    promise.pid = child_pid;
    promise.token = resolvedToken;
    return promise
}
