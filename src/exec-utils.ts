// TODO cleanup exec usages once spawn is ready
import { SendHandle, Serializable, spawn, SpawnOptions } from "child_process";
import { ObjectEncodingOptions } from "fs";
import { performance } from "perf_hooks";

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

export async function spawn_wrapped(
    command: string,
    args: string[],
    stdin: string | undefined,
    options: SpawnOptions
): Promise<SpawnResult | SpawnFailure> {
    // Record the start time of the spawn wrapper to report relative timings
    const startTime = performance.now();

    // Simple logger that prefixes each message with the elapsed time in seconds
    const logWithTime = (msg: string, ...rest: any[]) => {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
        console.log(`[${elapsed}s] ${msg}`, ...rest);
    };

    return new Promise((resolve, reject) => {
        if (!stdin) {
            // FYI default is all 'pipe' (works when stdin is provided)
            // 'ignore' attaches /dev/null
            // order: [STDIN, STDOUT, STDERR]
            options.stdio = ['ignore', 'pipe', 'pipe'];
        }

        // -----------------------------------------------------------------
        // Custom timeout handling and detached process group
        // -----------------------------------------------------------------
        // Extract any timeout passed via spawn options (set by runProcess) and
        // remove it so the built‑in spawn timeout does not interfere.
        const timeoutMs: number | undefined = (options as any).timeout;
        delete (options as any).timeout;

        // Use a detached child so we can kill the entire process group.
        options.detached = true;

        const child = spawn(command, args, options);
        // PRN return pid to callers?
        logWithTime(`START SPAWN child.pid: ${child.pid}`);

        let stdout = ""
        let stderr = ""

        if (child.stdin && stdin) {
            child.stdin.write(stdin);
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
            logWithTime("EXIT", { code, signal });
        });
        child.on("spawn", () => {
            // emitted after child process starts successfully
            // if child doesn't start, error emitted instead
            // emitted BEFORE any data received via stdout/stderr
            logWithTime("SPAWN")
        });

        // Custom settlement logic – resolve or reject only once and clear timeout.
        let settled = false;
        const settle = (result: any, isError: boolean) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (isError) {
                reject(result);
            } else {
                resolve(result);
            }
        };

        // Timeout handling – kill the whole process group after the supplied timeout.
        let timer: NodeJS.Timeout | null = null;
        if (timeoutMs !== undefined) {
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
            }, timeoutMs);
        }

        child.on("error", (err: Error) => {
            logWithTime("ERROR");
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
            logWithTime("ERROR_RESULT", result);
            settle(result, true);
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
            logWithTime("CLOSE");
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
            logWithTime("CLOSE_RESULT", result);
            settle(result, false);
        });
    });
}
