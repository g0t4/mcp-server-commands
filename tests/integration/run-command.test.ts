import { runCommand } from "../../src/run-command.js";
import { getFirstText, getStderrText, getStdoutText } from "./helpers.js";

describe("runCommand", () => {
    // FYI! these are integration tests only (test the glue)
    //   put all execution validations into lower level exec functions
    //   this is just to provide assertions that runCommand wires things together correctly

    // FYI any uses of always_log will trigger warnings if using console.error!
    //    that's fine and to be expected... tests still pass...
    //    TODO setup a way to bypass the error output for tests, unless troubleshooting the test

    describe("when command is successful", () => {
        const request = runCommand({
            command: "cat",
            stdin: "Hello World",
        });

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();

            // *** tool response format  (isError only set if failure)
            //  https://modelcontextprotocol.io/docs/concepts/tools#error-handling-2
            //  FYI for a while I used isError: false for success and it never caused issues with Claude
            //  but, seeing isError could be confusing
            //  and, why waste tokens!
        });

        test("should include STDOUT from command", async () => {
            const result = await request;

            const stdout = getStdoutText(result);
            expect(stdout).toBe("Hello World");
        });
    });

    test("should change working directory based on workdir arg", async () => {
        const defaultResult = await runCommand({
            command: "pwd",
        });

        // * ensure default dir is not /
        // make sure command succeeded so I can make assumption about default directory
        expect(defaultResult.isError).toBeUndefined();
        const defaultDirectory = getStdoutText(defaultResult);
        // fail the test if the default is the same as /
        // that way I don't have to hardcode the PWD expectation
        // and still trigger a failure if its ambiguous whether pwd was used below
        expect(defaultDirectory).not.toBe("/");

        // * test setting workdir
        const result = await runCommand({
            command: "pwd",
            workdir: "/",
        });
        // ensure setting workdir doesn't fail:
        expect(result.isError).toBeUndefined();
        expect(getStdoutText(result)).toBe("/");
    });

    test("should return isError and STDERR on a failure (nonexistentcommand)", async () => {
        const result = await runCommand({
            command: "nonexistentcommand",
        });

        expect(result.isError).toBe(true);

        const stderr = getStderrText(result);
        // Verify error message contains the command name
        expect(stderr).toContain("nonexistentcommand");
    });

    test("should handle missing command parameter", async () => {
        // This test verifies how the function handles a missing command parameter
        const result = await runCommand({});

        expect(result.isError).toBe(true);

        const firstMessage = getFirstText(result);
        // Verify error message indicates undefined command
        expect(firstMessage).toContain(
            "Command is required, current value: undefined",
        );
    });

    describe("when stdin passed and command succeeds", () => {
        const request = runCommand({
            command: "cat",
            stdin: "Hello World",
        });

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();
        });

        test("should include STDOUT from command", async () => {
            const result = await request;

            const stdout = getStdoutText(result);
            expect(stdout).toBe("Hello World");
        });
    });
});
