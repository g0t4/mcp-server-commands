import { exec, ExecOptions } from "child_process";
import { ObjectEncodingOptions } from "fs";

type ExecResult = {
    // this is basically ExecException except I want my own type for it...
    //   b/c I want this to represent all results
    //   ... by the way throws put stdout/stderr on the error "result" object
    //       hence I am replicating that here and in my promise reject calls
    stdout: string;
    stderr: string;

    // ONLY on errors:
    message?: string; // FYI redundant b/c message ~= `Command failed: ${cmd}\n${stderr}\n`
    code?: number;
    killed?: boolean;
    signal?: NodeJS.Signals | undefined;
    cmd?: string; // FYI redundant
};

/**
 * Executes a file with the given arguments, piping input to stdin.
 * @param {string} interpreter - The file to execute.
 * @param {string} stdin - The string to pipe to stdin.
 * @returns {Promise<ExecResult>}
 */
function execFileWithInput(
    interpreter: string,
    stdin: string,
    options: ObjectEncodingOptions & ExecOptions
): Promise<ExecResult> {
    // FYI for now, using `exec()` so the interpreter can have cmd+args AIO
    //  could switch to `execFile()` to pass args array separately
    // TODO starts with fish too? "fish -..." PRN use a library to parse the command and determine this?
    if (interpreter.split(" ")[0] === "fish") {
        // PRN also check error from fish and add possible clarification to error message though there are legit ways to trigger that same error message! i.e. `fish .` which is not the same issue!
        return fishWorkaround(interpreter, stdin, options);
    }

    return new Promise((resolve, reject) => {
        const child = exec(interpreter, options, (error, stdout, stderr) => {
            if (error) {
                // console.log("execFileWithInput ERROR:", error);
                // mirror ExecException used by throws
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
            } else {
                // I assume RC==0 else would trigger error?
                resolve({ stdout, stderr });
            }
        });

        if (stdin) {
            if (child.stdin === null) {
                reject(new Error("Unexpected failure: child.stdin is null"));
                return;
            }
            child.stdin.write(stdin);
            child.stdin.end();
        }
    });
}

async function fishWorkaround(
    interpreter: string,
    stdin: string,
    options: ObjectEncodingOptions & ExecOptions
): Promise<ExecResult> {
    // fish right now chokes on piped input (STDIN) + node's exec/spawn/etc, so lets use a workaround to echo the input
    // base64 encode thee input, then decode in pipeline
    const base64stdin = Buffer.from(stdin).toString("base64");

    const command = `${interpreter} -c "echo ${base64stdin} | base64 -d | fish"`;

    return new Promise((resolve, reject) => {
        // const child = ... // careful with refactoring not to return that unused child
        exec(command, options, (error, stdout, stderr) => {
            // I like this style of error vs success handling! it's beautiful-est (prommises are underrated)
            if (error) {
                // console.log("fishWorkaround ERROR:", error);
                // mirror ExecException used by throws
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

export { execFileWithInput, ExecResult };
