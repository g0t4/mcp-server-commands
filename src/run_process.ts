// TODO cleanup exec usages once spawn is ready
import { spawn, SpawnOptions } from "child_process";
import { ObjectEncodingOptions } from "fs";
import { performance } from "perf_hooks";
import { is_verbose, verbose_log } from "./logging.js";
import { resultFor } from "./messages.js";
import { errorResult } from "./messages.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getBlockingMessage } from "./blocking_commands.js";

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

export type SpawnPromise = Promise<CallToolResult> & { pid?: number };

/**
 * Raw arguments passed to {@link runProcess}. Historically this was a loose
 * {@link Record} but we now expose a typed helper for safer access.
 */
export type RunProcessArgs = Record<string, unknown>;

/**
 * Helper class that provides typed getters for the keys accepted by
 * {@link runProcess}. It wraps a {@link RunProcessArgs} object and casts the
 * values to the expected runtime types.
 */
export class RunProcessArgsHelper {
    private readonly raw: RunProcessArgs;

    constructor(raw: RunProcessArgs) {
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

    /** Executable argv – array of strings if supplied, otherwise undefined */
    get argv(): string[] | undefined {
        const v = this.raw.argv;
        if (!Array.isArray(v)) return undefined;
        return v.map((item) => String(item));
    }

    /** Timeout in milliseconds – number if supplied, otherwise undefined */
    /** Timeout in milliseconds – always a number (default 30_000) */
    get timeoutMs(): number {
        const v = this.raw.timeout_ms;
        const n = Number(v);
        return Number.isNaN(n) ? 30_000 : n;
    }

    /** True if a shell command line is provided */
    get isShellMode(): boolean {
        return Boolean(this.commandLine);
    }

    /** True if an argv array with at least one element is provided */
    get isExecutableMode(): boolean {
        return Array.isArray(this.raw.argv) && (this.argv?.length ?? 0) > 0;
    }
}

export function runProcess(
    runProcessArgs: RunProcessArgs,
): SpawnPromise {
    const startTime = performance.now();

    const args = new RunProcessArgsHelper(runProcessArgs);
    if (args.isShellMode && args.isExecutableMode) {
        return Promise.resolve(errorResult("Cannot pass both 'command_line' and 'argv'. Use one or the other."));
    }
    if (!args.isShellMode && !args.isExecutableMode) {
        return Promise.resolve(errorResult("Either 'command_line' (string) or 'argv' (array) is required."));
    }

    // // Block dangerous commands via dedicated module
    // const blockMsg = getBlockingMessage(args);
    // if (blockMsg) {
    //     return Promise.resolve(errorResult(blockMsg));
    // }

    const options: ObjectEncodingOptions & SpawnOptions = {
        // spawn options: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
        encoding: "utf8"
    };
    if (args.cwd) {
        options.cwd = args.cwd;
    }

    let spawnCommand = "";
    let spawnArgs: string[] = [];
    if (args.isShellMode) {
        (options as any).shell = true;
        spawnCommand = String(args.commandLine);
        spawnArgs = [];
    } else {
        (options as any).shell = false;
        const argv = args.argv as string[];
        spawnCommand = argv[0];
        spawnArgs = argv.slice(1);
    }

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

        let settled = false;
        const settle = (result: SpawnResult, isError: boolean) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (isError) {
                resolve(resultFor(result));
            } else {
                resolve(resultFor(result));
            }
        };

        const child = spawn(spawnCommand, spawnArgs, options);
        logWithElapsedTime(`START SPAWN child.pid: ${child.pid}`);
        child_pid = child.pid;

        let stdout = "";
        let stderr = "";

        if (child.stdin && args.stdin_text) {
            child.stdin.write(args.stdin_text);
            child.stdin.end();
        }

        if (child.stdout) {
            child.stdout.on("data", (chunk: Buffer | string) => {
                stdout += chunk.toString();
            });
        }

        if (child.stderr) {
            child.stderr.on("data", (chunk: Buffer | string) => {
                stderr += chunk.toString();
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

        // Timeout handling – kill the whole process group after the supplied timeout.
        let timer: NodeJS.Timeout | null = null;

        timer = setTimeout(() => {
            if (process.platform !== "win32") {
                if (child.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch (_) {} }
            } else {
                child.kill("SIGTERM");
            }
            const killTimeout = setTimeout(() => {
                if (process.platform !== "win32") {
                    if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch (_) {} }
                } else {
                    child.kill("SIGKILL");
                }
            }, 2000);
            const clearKill = () => clearTimeout(killTimeout);
            child.once("exit", clearKill);
            child.once("close", clearKill);
        }, args.timeoutMs);

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
            settle(result, true);
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
            settle(result, false);
        });
    });
    // FYI later (when needed) I can map this onto the promise that comes back from runProcess too (and tie into that unit test I have that needs pid to terminate it)
    // Resolve the underlying spawn result, then map to CallToolResult including PID.
    promise.pid = child_pid;
    return promise
}
