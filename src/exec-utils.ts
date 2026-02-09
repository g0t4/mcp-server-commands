// TODO cleanup exec usages once spawn is ready
import { spawn, SpawnOptions } from "child_process";
import { ObjectEncodingOptions } from "fs";

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
    cmd?: string; // FYI redundant
};

export async function spawn_wrapped(
    command: string,
    args: string[],
    stdin_input: string | undefined,
    options: SpawnOptions
): Promise<SpawnResult | SpawnFailure> {
    return new Promise((resolve, reject) => {
        if (!stdin_input) {
            // FYI default is all 'pipe' (works when stdin_input is provided)
            // 'ignore' attaches /dev/null
            // order: [STDIN, STDOUT, STDERR]
            options.stdio = ['ignore', 'pipe', 'pipe'];
            // ? I wonder if this was related to fishWorkaround issue w/ STDIN (see commit history)... I was using base64 encoding to pass STDIN
        }
        const child = spawn(command, args, options);
        // PRN return pid to callers?
        console.log(`child.pid: ${child.pid}`);

        let stdout = ""
        let stderr = ""

        if (child.stdin && stdin_input) {
            child.stdin.write(stdin_input);
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

        let errored = false;
        child.on("error", (err: Error) => {
            // ChildProcess 'error' docs: https://nodejs.org/api/child_process.html#event-error
            // error running process
            // IIUC not just b/c of command failed w/ non-zero exit code
            const result: SpawnFailure = {
                stdout: stdout,
                stderr: stderr,
                //
                code: (err as any).code,
                signal: (err as any).signal,
                //
                message: err.message,
                // killed: (err as any).killed,
                cmd: command, // TODO does error have .cmd on it? is it the composite result of processing in spawn too? (or same as I passed)
            };
            // console.log("ON_ERROR", result);
            errored = true;
            reject(result);
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
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
                stdout: stdout,
                stderr: stderr,
                code: code ?? undefined,
                signal: signal ?? undefined,
            };
            // console.log("ON_CLOSE", result);
            resolve(result);
        });
    });
}
