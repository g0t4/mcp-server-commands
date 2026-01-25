import { ChildProcess, spawn, SpawnOptions } from 'node:child_process';
import { once } from 'node:events';


async function ls() {
    const ls = spawn('ls', ['-lh', '/usr']);

    // NOTES:
    // - spawn/spawnSync are the foundation of all other methods
    // - async, non-blocking (event loop)

    ls.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    ls.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    const [code] = await once(ls, 'close');
    console.log(`child process exited with code ${code}`);
}
// await ls();


async function cat_hello() {
    const cat = spawn('cat');

    cat.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    cat.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    cat.stdin.write("HEY FUCKTURD");
    cat.stdin.end();
    const [code] = await once(cat, 'close');
    console.log(`child process exited with code ${code}`);
}
// await cat_hello();

async function sleep_abort() {
    const aborter = new AbortController();
    const options: SpawnOptions = {};
    // options.shell = ""
    options.signal = aborter.signal;
    const cat = spawn('sleep', ["5"], options);

    if (cat.stdout) {
        cat.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });
    }

    if (cat.stderr) {
        cat.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    }

    cat.on('error', (err) => {
        console.log("ERR", err);
    });
    aborter.abort();

    const [code] = await once(cat, 'close');
    console.log(`child process exited with code ${code}`);
}
// await sleep_abort();

async function shells(child_process: ChildProcess) {

    if (child_process.stdout) {
        child_process.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });
    }

    if (child_process.stderr) {
        child_process.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    }

    child_process.on('error', (err) => {
        console.log("ERR", err);
    });

    const [code] = await once(child_process, 'close');
    console.log(`child process exited with code ${code}`);
}


await shells(spawn('echo', ["5"], { shell: false })); // works
// await shells(spawn('echo 55', { shell: false })); // fails
// *** pass only command arg w/ cmd+args and shell=true
await shells(spawn('echo 66', { shell: true })); // works
await shells(spawn('echo $fish_pid', { shell: true })); // no fish_pid (not fish shell) 
await shells(spawn('echo $fish_pid', { shell: "fish" })); // works! fish shell!
// await shells(spawn('echo', ["5"], { shell: true })); // works but w/ warning about args are just concatenated (not sanitized)

// default shell info
await shells(spawn("echo", ['$PATH'], { shell: false }));  // verbatim prints "$PATH" b/c no shell
await shells(spawn("echo", ['$PATH'], { shell: true })); // shows PATH variable value // warning too (first call w/ cmd,args array)
await shells(spawn("echo", ['$$'], { shell: false })); // verbatim $$ printed (no shell) 
await shells(spawn("echo", ['$$'], { shell: true }));  // prints PID of default shell
// await shells(spawn("set", { shell: true }));  // prints PID of default shell
await shells(spawn("set -x; echo $0; echo $PATH; echo $BASH_VERSION", { shell: true }));  // /bin/sh => bash in POSIX mode
// $0 = /bin/sh (on mac/linux)
// $BASH_VERSION
await shells(spawn("declare", { shell: true }));  //  dump default shell variables
// await shells(spawn("ps", { shell: false })); // default shell info

console.log("HERE:")
await shells(spawn("echo", ['$PATH']));  // default is shell=false

