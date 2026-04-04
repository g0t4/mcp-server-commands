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
            // ? I wonder if this was related to fishWorkaround issue w/ STDIN (see commit history)... I was using base64 encoding to pass STDIN
        }

        // TODO consider detached process group 
        //   TODO + my own timeout management
        //   AND thus stop using spawn options timeout 
        //   OR is there a fix with spawn options timeout for my case?
        //   basically I only see an issue with `git -c core.editor=vim commit --amend` test case... 
        //   - clearly starting multiple child proceses of the child... 
        //   - then, timeout isn't fully propagating to all of the children processes (before jest test level timeout, maybe never too)
        //   - this is why I never saw "close" event b/c that comes after streams closed
        //   - AND this is why "exit" appeared to be what I neeeded (for SIGTERM case only)... b/c it is a very early way to detect timeout... 
        //     however, I need to not use "exit" for timeout signaling... and instead go back to just "close"
        //     and make sure the timeout SIGTERM fully propagates after which "close" will fire and all will be well!
        //     I do not want to leave zombies/leaked processes so this is worth getting right
        //  - IIUC I should
        //    - use detached (process group)
        //    - stop using spawn_options.timeout (remove value from it)
        //    - detect timeout myself
        //    - kill PGID on timeout
        //    - add tests to make sure close fires on complex process group examples (i.e. git+vim)
        // TODO read a bit more and confirm this is what you want
        //   FYI for now what you have works, issue is you might have some lingering processes until you address a real timeout mechanism (above)
        //     but at least for now these cases won't result in indefinite hanging of tool call! (half way "fix")
        // options.detached = true; // separate process group, can kill easier (must manage myself)

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

        // child.on("disconnect", () => logWithTime("DISCONNECT")); // subprocess.disconnect() called by either parent/child process  
        child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            // child process streams MAY still be open when EXIT is emitted (use close if need to ensure they're closed)
            // in my testing, CLOSE is not called after EXIT when a timeout occurs (due to spawn options timeout_ms)
            // FYI IIUC from docs, if CLOSE is emitted, it is always after EXIT... but IIUC EXIT alone might be emitted and never a CLOSE
            // PRN util.convertProcessSignalToExitCode() to go from signal => code
            logWithTime("EXIT", { code, signal });

            // OK I am going out on a limb here, I think I only care to react here on EXIT... if signal is set (due to termination)
            // if process exits normally then CLOSE should always be called.. which is the safe time to get stdout/stderr
            // but if terminated due to timeout, IIUC in my testing, CLOSE is never called then (or not in all cases)

            const not_terminated = signal === null;
            if (not_terminated) {
                // TODO also check code is null/undefined?
                // can I have both signal and code set? I don't think so... IIAC code wins if process already exited when smth tries to terminate it (signal) 
                return;
            }
            const result: SpawnFailure = {
                stdout,
                stderr,
                code: code ?? undefined, // s/b always undefined here
                signal: signal ?? undefined,
            };
            logWithTime("SIGNAL_EXIT", result);
            reject(result);
        });
        // child.on("message", (message: Serializable, sendHandle: SendHandle) => {
        //     // when child uses process.send() => not applicable in my use case
        //     logWithTime("MESSAGE", { message, sendHandle });
        // });
        child.on("spawn", () => {
            // emitted after child process starts successfully
            // if child doesn't start, error emitted instead
            // emitted BEFORE any data received via stdout/stderr
            logWithTime("SPAWN")
        });

        let errored = false;
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
            errored = true;
            reject(result);
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
            logWithTime("CLOSE");
            // ChildProcess 'close' docs: https://nodejs.org/api/child_process.html#event-close
            //   'close' is after child process ends AND stdio streams are closed
            //   - after 'exit' or 'error'
            //
            // * do not resolve if 'error' already called (promise is already resolved)
            if (errored) return;

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
            // TODO should code => resolve() and signal => reject()
            //  instead of right now I always resolve?
            //  FYI might not matter much given any output that indicates a failure, the model would still see it
            //   and reject vs resolve mostly maps to setting isError=true ... IIRC that's it so this isn't a big deal probably
            resolve(result);
        });
    });
}
