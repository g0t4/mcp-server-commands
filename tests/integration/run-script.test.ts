import { runScript } from "../../src/run-script.js";
import {
    CallToolResult,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";

describe("runScript", () => {
    // TODO rework runScript
    //  fold it into runCommand? with STDIN?
    //  add instructions to suggest:
    //    use `cat` to create files
    //    use `python` to run python script?
    //  if I keep run_script
    //    rename interpreter to command?
    //
    // TODO how to handle blocking and/or background jobs?
    //   OR maybe just warn not to start stuff that is blocking :)
    //   AND say its ok to start non-blocking daemons, but to clean them up when done
    //   this applies to more than just run_script, probably moreso to run command
    //   I might need to create system messages/prompt boilerplate PER model that I want to use
    //   I noticed llama4 was not nearly as creative as Claude at using run_script with cat to create a file...
    //     that said my param names don't suggest that
    //     BUT, Claude figured it out just fine (that was my lightbulb moment)
    //   OR I need more capable tool model than llama, i.e. Qwen?
    //   TODO try other groq models for tool use?

    // FYI! these are integration tests only (test the glue)
    //   put all execution validations into lower level exec functions
    //   this is just to provide assertions that runScript wires things together correctly

    // FYI any uses of always_log will trigger warnings if using console.error!
    //    that's fine and to be expected... tests still pass...
    //    can I shut that off for a test?

    // TODO test passing args w/ command (not just command)

    describe("when script is successful", () => {
        const request = runScript({
            interpreter: "cat",
            script: "Hello World",
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
        const defaultResult = await runScript({
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
        const result = await runScript({
            command: "pwd",
            workdir: "/",
        });
        // ensure setting workdir doesn't fail:
        expect(result.isError).toBeUndefined();
        expect(getStdoutText(result)).toBe("/");
    });

    test("should return isError and STDERR on a failure (nonexistentcommand)", async () => {
        const result = await runScript({
            command: "nonexistentcommand",
        });

        expect(result.isError).toBe(true);

        const stderr = getStderrText(result);
        // Verify error message contains the command name
        expect(stderr).toContain("nonexistentcommand");
    });

    test("should handle missing command parameter", async () => {
        // This test verifies how the function handles a missing command parameter
        const result = await runScript({});

        expect(result.isError).toBe(true);

        const stderr = getStderrText(result);
        // Verify error message indicates undefined command
        expect(stderr).toContain("undefined: command not found");
    });
});
