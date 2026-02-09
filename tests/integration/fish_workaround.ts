
//
// * 2026-02-09 after porting to run_process
//   * SO FAR I can only repro this on GH actions ubuntu-latest runner
//   not happening on arch, macOS
//   so for now I don't care as ubuntu is not my target env
//   and until I can repro it outside of GH actions, I can't fix this in a sane fashion
//
//

// * old notes:
// WEIRD FISH SHELL FAILURE, look into later, actually referenced in fish source code:
//   re: "Unable to read input file: Is a directory"
//   has smth to do with stdin for script
//   what is strange is if I do `fish -c "echo foobar"` that works fine via exec but I cannot exec/execFile and pass string to stdin and have it work with just fish shell
//   appears to be open bug in fish shell:
//    FISH literally bails if it thinks the fd of the script (in non-interactive mode) is a directory (and the fd is not STDIN's default of 0)
//    * https://github.com/fish-shell/fish-shell/blob/master/src/reader.rs#L678-L681
//      // XXX: This can be triggered spuriously, so we'll not do that for stdin.
//      // This can be seen e.g. with node's "spawn" api.

// PRN better workaround? create a temporary file and modify the fish command?
// PRN catch errors and check for this error in message and warn when it happens (not proactively wasting tokens, also not attempting to modify the fish command)
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

export { fishWorkaround };
