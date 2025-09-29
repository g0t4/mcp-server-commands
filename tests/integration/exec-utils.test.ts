import { execFileWithInput } from "../../src/exec-utils.js";

// FYI these tests are largely to make sure I understand how exec works
// + my changes to exec (i.e. reject promise on failure in STDIN path)

describe("execFileWithInput integration tests", () => {

    test("should execute a simple bash command", async () => {
        const result = await execFileWithInput(
            "bash",
            'echo "Hello World"',
            {}
        );
        // console.log(result);
        expect(result.stdout).toBe("Hello World\n");
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });

    test("should handle command errors properly in bash", async () => {
        try {
            await execFileWithInput("bash", "nonexistentcommand", {});
            fail("Should have thrown an error");
        } catch (result: any) {
            // FYI catch is so you can run assertions on the failed result, given the promise is rejected, it's then thrown here
            // console.log(result);
            const expected_stderr = "bash: line 1: nonexistentcommand: command not found";
            expect(result.stderr).toContain(expected_stderr);
            const expected_message = "Command failed: bash\n" + expected_stderr + "\n";
            expect(result.message).toContain(expected_message);
            expect(result.code).toBe(127);
        }
    });

    test("should handle fish shell command", async () => {
        const result = await execFileWithInput(
            "fish",
            'echo "Hello from Fish"',
            {}
        );
        // console.log(result);
        expect(result.stdout).toBe("Hello from Fish\n");
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });

    // TODO make sure to cover the fish workaround logic, in all its edge cases and then can leave those tests when I remove that or just nuke them
    test("should handle command errors properly in fish", async () => {
        try {
            await execFileWithInput("fish", "totallynonexistentcommand", {});
            fail("Should have thrown an error");
        } catch (result: any) {
            // console.log(result);

            const expected_stderr = "fish: Unknown command: totallynonexistentcommand\nfish: \ntotallynonexistentcommand\n^~~~~~~~~~~~~~~~~~~~~~~~^";
            expect(result.stderr).toContain(expected_stderr);
            // TODO! this is why I don't think I should return error.message... or at least not in many cases
            //    OR strip off the stderr overlap?
            const expected_message = 'Command failed: fish -c "echo dG90YWxseW5vbmV4aXN0ZW50Y29tbWFuZA== | base64 -d | fish"' +
                "\n" + expected_stderr;
            expect(result.message).toContain(expected_message);
            expect(result.code).toBe(127);
            expect(result.killed).toBe(false);
            expect(result.signal).toBeNull();
        }
    });

    test("should execute zsh command", async () => {
        const result = await execFileWithInput(
            "zsh",
            'echo "Hello from Zsh"',
            {}
        );
        // console.log(result);
        expect(result.stdout).toBe("Hello from Zsh\n");
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });

    test("should handle command errors properly in zsh", async () => {
        try {
            await execFileWithInput("zsh", "completelynonexistentcommand", {});
            fail("Should have thrown an error");
        } catch (result: any) {
            // console.log(result);
            const expected_stderr = "zsh: command not found: completelynonexistentcommand";
            expect(result.stderr).toContain(expected_stderr);
            const expected_message = "Command failed: zsh\n" + expected_stderr + "\n";
            expect(result.message).toBe(expected_message);
            expect(result.code).toBe(127);
            expect(result.killed).toBe(false);
            expect(result.signal).toBeNull();
        }
    });

    test("should handle multiline scripts in zsh", async () => {
        const stdin = `
      echo "Line 1 from Zsh"
      for i in 1 2 3; do
        echo "Number $i"
      done
    `;
        const result = await execFileWithInput("zsh", stdin, {});
        // console.log(result);
        expect(result.stdout).toContain(`Line 1 from Zsh
Number 1
Number 2
Number 3
`);
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });

    test("should respect working directory option", async () => {
        // FYI best to pick a path that is common on both macOS and Linux
        //  unfortunately, on macOS /tmp is a symlink to /private/tmp so that can cause issues
        // TODO make sure cwd is not already / in the test?
        // PRN use multiple paths would be another way around checking cwd of test runner
        const result = await execFileWithInput("bash", "pwd", { cwd: "/" });
        // console.log(result);
        expect(result.stdout).toBe("/\n");
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });

    test("should handle bash multiline scripts", async () => {
        const stdin = `
      echo "Line 1"
      echo "Line 2"
      echo "Line 3"
    `;
        const result = await execFileWithInput("bash", stdin, {});
        // validate all of output:
        // console.log(result);
        expect(result.stdout).toContain(`Line 1
Line 2
Line 3`);
        expect(result.stderr).toBe("");
        expect(result.code).toBeUndefined();
    });
});

// TODO add testing of try/catch in runScript block
//   just make sure I cover failure cases through the catch blocks
//   maybe, push the try/catch into a new, interim seam
//   keep this testing separate of the lower level seam around execWithInput
//   don't need a ton of tests, just an integration "glue" test of the try/catch impl (so if it changes I can validate it)
//

// TODO add tests for logging on failures?
