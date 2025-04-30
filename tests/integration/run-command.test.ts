import { runCommand } from "../../src/run-command.js";
import {
    CallToolResult,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";

describe("runCommand", () => {
    // FYI! these are integration tests only (test the glue)
    //   put all execution validations into lower level exec functions
    //   this is just to provide assertions that runCommand wires things together correctly

    // FYI any uses of always_log will trigger warnings if using console.error!
    //    that's fine and to be expected... tests still pass...
    //    can I shut that off for a test?

    describe("when command is successful", () => {
        // This test verifies that a successful command execution returns stdout
        const request = runCommand({
            command: "echo 'Hello World'",
        });

        // TODO any issues using describe to setup scenario?
        //  I wanted to make explicit both conditions (not set isError and get STDOUT)

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();

            // *** tool response format  (isError only set if failure)
            //  https://modelcontextprotocol.io/docs/concepts/tools#error-handling-2
            //  FYI for a while I used isError: false for success and it never caused issues with Claude
            //  but I don't wanna waste tokens AND seeing isError could be confusing
        });

        test("should include STDOUT from command", async () => {
            const result = await request;

            // Look for output message with name STDOUT
            const stdout = result.content.find(
                (msg) => msg.name === "STDOUT"
            ) as TextContent;

            // Verify the output contains the expected string
            expect(stdout).toBeTruthy();
            expect((stdout.text as string).trim()).toBe("Hello World");
        });
    });

    function getStdoutText(result: CallToolResult) {
        const stdout = result.content.find(
            (content) => content.name === "STDOUT"
        ) as TextContent;
        return (stdout.text as string).trim();
    }

    function getStderrText(result: CallToolResult) {
        const stderr = result.content.find(
            (content) => content.name === "STDERR"
        ) as TextContent;
        return (stderr.text as string).trim();
    }

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

    test("should handle command execution errors", async () => {
        // This test verifies that errors are properly handled
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

        const stderr = getStderrText(result);
        // Verify error message indicates undefined command
        expect(stderr).toContain("undefined: command not found");
    });
});
