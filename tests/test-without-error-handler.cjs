const util = require("node:util");
const exec = util.promisify(require("node:child_process").exec);

async function main() {
    const { argv } = process;
    const { stdout, stderr } = await exec(argv[2]);
    console.log("stdout:", stdout);
    console.error("stderr:", stderr);
}

main();
