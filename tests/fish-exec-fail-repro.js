import { exec, execSync } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function test_callback() {
    exec("fish", (error, stdout, stderr) => {
        console.log("stdout", stdout);
        console.log("stderr", stderr);
    });
}

async function main() {
    //const { stdout, stderr } = await execAsync('fish -c "echo hello"'); // works
    const { stdout, stderr } = await execAsync("fish --no-config --no-execute"); // fails, smth to do with interactive vs not?
    //const { stdout, stderr } = await execAsync("cat"); // fails, smth to do with interactive vs not?

    console.log("stdout", stdout);
    console.log("stderr", stderr);
}

//test_callback();
//main();
//

import { execFileWithInput } from "../build/exec-utils.js";

async function main2() {
    const { stdout, stderr } = await execFileWithInput(
        "fish -i ",
        "echo hello",
        {}
    );

    console.log("stdout", stdout);
    console.log("stderr", stderr);
}

//main2();
//

// WEIRD FISH SHELL FAILURE, look into later, actually referenced in fish source code:
//   re: "Unable to read input file: Is a directory" 
//   has smth to do with stdin for script
//   what is strange is if I do `fish -c "echo foobar"` that works fine via exec but I cannot exec/execFile and pass string to stdin and have it work with just fish shell
//   appears to be open bug in fish shell: 
//     https://github.com/fish-shell/fish-shell/issues/1002
//       // XXX: This can be triggered spuriously, so we'll not do that for stdin.
//       // This can be seen e.g. with node's "spawn" api.

async function main_execSyncTest() {
    const { stdout, stderr } = execSync("fish --no-config -i ", {
        encoding: "utf8",
        input: "echo hello",
    });

    console.log("stdout", stdout);
    console.log("stderr", stderr);
}

main_execSyncTest();
