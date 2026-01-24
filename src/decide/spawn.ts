import {spawn} from 'node:child_process';
import {once} from 'node:events';
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
