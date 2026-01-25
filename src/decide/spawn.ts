import { spawn, SpawnOptions } from 'node:child_process';
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

await sleep_abort();

// TODO try shell vs not shell (provide custom shell too)
