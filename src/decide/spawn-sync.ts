import { isAscii } from 'node:buffer';
import { spawnSync, SpawnSyncOptionsWithBufferEncoding, StdioOptions } from 'node:child_process';
import { setDefaultResultOrder } from 'node:dns';

// NOTES:
// - blocks event loop in exchange for convenience

function runSyncWithStdio(stdioValue: StdioOptions) {

    console.log("\n\n" + "=".repeat(20) + " run " + "=".repeat(20) + "\n");

    const options: SpawnSyncOptionsWithBufferEncoding = {
        stdio: stdioValue,
    };

    console.log("options", options);

    const command = "ls";
    const args = ["-lh", "/usr"];
    const result = spawnSync(command, args, options);

    import chalk from 'chalk';

    console.log(chalk.green("\n## spawnSync COMPLETE\n"));

    console.log("\n## spawnSync COMPLETE\n");
    console.log("result", result);

    if (result.stdout) {
        console.log("stdout:", result.stdout);
    }
    if (result.stderr) {
        console.log("stderr:", result.stderr);
    }

    return result;
}

// *** KEY setting => DO NOT USE "inherit" type behavior w/ MCP server 
//   b/c then it is writing to the STDOUT/ERR and reading from STDIN that are intended for client to server JSON based comms only!
//
runSyncWithStdio("inherit") // ls output is BEFORE result returned (b/c inherit means use parent process STDIN/OUT/ERR... so it writes immediately to STDOUT!

// buffer STDOUT/ERR
runSyncWithStdio("pipe") // ls output is obtained after result returned (b/c piped to buffer)
