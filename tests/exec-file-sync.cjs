const { execFile, execFileSync } = require("child_process");

// FYI async too but not the point of this script
execFile("ls", ["-l"], (error, stdout, stderr) => {
    if (error) console.error(`Error: ${error.message}`);
    else console.log(`Stdout: ${stdout}`);
});

execFile("ls", ["-l"], { input: "echo foobar2" }, (error, stdout, stderr) => {
    if (error) console.error(`Error: ${error.message}`);
    else console.log(`Stdout: ${stdout}`);
});

// !!! key demo here of execFileSync
const foo = execFileSync("bash", [], { input: "echo foobar" });
// show buffer text:
console.log(foo.toString()); // sync means it will show before async callbacks
