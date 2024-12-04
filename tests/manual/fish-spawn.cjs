const { spawn } = require('child_process');

const script = `
echo "Hello from Fish shell!"
set greeting "Hello, Node.js!"
echo $greeting
`;

const child = spawn('fish', [], {
    stdio: ['pipe', 'inherit', 'inherit'] // Use 'pipe' for stdin, 'inherit' to show output in the console
});

// Write the script to stdin
child.stdin.write(script);

// Close stdin to signal end of input
child.stdin.end();

child.on('close', (code) => {
    console.log(`Fish shell exited with code ${code}`);
});
