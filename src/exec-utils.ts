import { execFile, ExecFileOptionsWithStringEncoding } from "child_process";

type ExecResult = {
    // FYI leave this type for now as a declaration of the expected shape of the result for BOTH success and failure (errors)
    //   do not switch to using ExecException b/c that only applies to failures
    stdout: string;
    stderr: string;

    // message is the error message from the child process, not sure I like this naming
    // - perhaps worth pushing the error logic out of messagesFor back into catch block above
    message?: string;
};

/**
 * Executes a file with the given arguments, piping input to stdin.
 * @param {string} file - The file to execute.
 * @param {string[]} args - Array of arguments for the file.
 * @param {string} stdin_text - The string to pipe to stdin.
 * @returns {Promise<ExecResult>} A promise that resolves with the stdout and stderr of the command. `message` is provided on a failure to explain the error.
 */
function execFileWithInput(
    file: string,
    args: [],
    stdin_text: string,
    options: ExecFileOptionsWithStringEncoding
): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        const child = execFile(file, args, options, (error, stdout, stderr) => {
            if (error) {
                reject({ message: error.message, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });

        if (stdin_text) {
            if (child.stdin === null) {
                reject(new Error("Unexpected failure: child.stdin is null"));
                return;
            }
            child.stdin.write(stdin_text);
            child.stdin.end();
        }
    });
}

export { execFileWithInput, ExecResult };
