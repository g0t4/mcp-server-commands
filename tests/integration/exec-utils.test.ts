import { runProcess } from "../../src/run_process.js";

// FYI old impl before changes: 
//    git show 394b8a9 src/exec-utils.ts
//
describe("test explicit shell use", () => {

    test("should execute a simple bash command over STDIN", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["bash"],
            input: 'echo "Hello World"', // STDIN
        });

        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: "Hello World\n",
            }
        ]);
    });

    test("should handle command errors properly in bash", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["bash"],
            input: "nonexistentcommand",
        });

        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "127",
            },
            {
                name: "STDERR",
                type: "text",
                text: "bash: line 1: nonexistentcommand: command not found\n",
            },
        ]);

    });

    test("should handle fish shell command", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["fish"],
            input: 'echo "Hello from Fish"',
        });
        // console.log(result);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: "Hello from Fish\n",
            },
        ]);
    });

    // TODO make sure to cover the fish workaround logic, in all its edge cases and then can leave those tests when I remove that or just nuke them
    test("should handle command errors properly in fish", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["fish"],
            input: "totallynonexistentcommand",
        });

        expect(result.isError).toBeTruthy();
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "127",
            },
            {
                name: "STDERR",
                type: "text",
                text: expect.stringContaining(
                    "fish: Unknown command: totallynonexistentcommand\nfish: \ntotallynonexistentcommand\n^~~~~~~~~~~~~~~~~~~~~~~~^"
                ),
            },
        ]);
    });

    test("should execute zsh command", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["zsh"],
            input: 'echo "Hello from Zsh"',
        });
        // console.log(result);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: "Hello from Zsh\n",
            },
        ]);
    });

    test("should handle command errors properly in zsh", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["zsh"],
            input: "completelynonexistentcommand",
        });

        expect(result.isError).toBeTruthy();
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "127",
            },
            {
                name: "STDERR",
                type: "text",
                text: expect.stringContaining("zsh: command not found: completelynonexistentcommand"),
            },
        ]);
    });

    test("should handle multiline scripts in zsh", async () => {
        const stdin = `
      echo "Line 1 from Zsh"
      for i in 1 2 3; do
        echo "Number $i"
      done
    `;
        const result = await runProcess({
            mode: "executable",
            argv: ["zsh"],
            input: stdin,
        });
        // console.log(result);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: expect.stringContaining(
                    `Line 1 from Zsh
Number 1
Number 2
Number 3
`
                ),
            },
        ]);
    });

    test("should respect working directory option", async () => {
        // FYI best to pick a path that is common on both macOS and Linux
        //  unfortunately, on macOS /tmp is a symlink to /private/tmp so that can cause issues
        // TODO make sure cwd is not already / in the test?
        // PRN use multiple paths would be another way around checking cwd of test runner
        const result = await runProcess({
            mode: "executable",
            argv: ["bash"],
            input: "pwd",
            cwd: "/",
        });
        // console.log(result);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: "/\n",
            },
        ]);
    });

    test("should handle bash multiline scripts", async () => {
        const stdin = `
      echo "Line 1"
      echo "Line 2"
      echo "Line 3"
    `;
        const result = await runProcess({
            mode: "executable",
            argv: ["bash"],
            input: stdin,
        });
        // validate all of output:
        // console.log(result);
        expect(result.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                text: expect.stringContaining(`Line 1
Line 2
Line 3`),
            },
        ]);
    });



});

// TODO add testing of try/catch in runScript block
//   just make sure I cover failure cases through the catch blocks
//   maybe, push the try/catch into a new, interim seam
//   keep this testing separate of the lower level seam around execWithInput
//   don't need a ton of tests, just an integration "glue" test of the try/catch impl (so if it changes I can validate it)
//

// TODO add tests for logging on failures?
