import { runProcess } from "../../src/run-process.js";

describe("runCommand", () => {
    // FYI! these are integration tests only (test the glue)
    //   put all execution validations into lower level exec functions
    //   this is just to provide assertions that runCommand wires things together correctly

    // FYI any uses of always_log will trigger warnings if using console.error!
    //    that's fine and to be expected... tests still pass...
    //    TODO setup a way to bypass the error output for tests, unless troubleshooting the test

    describe("when command is successful", () => {
        const request = runProcess({
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
            // console.log(result);

            expect(result.content).toHaveLength(1);
            const stdout = result.content[0];
            expect(stdout.text).toBe("Hello World");
            expect(stdout.name).toBe("STDOUT");
        });
    });

    test("should change working directory based on workdir arg", async () => {
        const defaultResult = await runProcess({
            command: "pwd",
        });
        // console.log(defaultResult);

        // * ensure default dir is not /
        // make sure command succeeded so I can make assumption about default directory
        expect(defaultResult.content).toHaveLength(1);
        expect(defaultResult.isError).toBeUndefined();
        const defaultStdout = defaultResult.content[0];
        expect(defaultStdout.text).not.toBe("/\n");
        expect(defaultStdout.name).toBe("STDOUT");
        // fail the test if the default is the same as /
        // that way I don't have to hardcode the PWD expectation
        // and still trigger a failure if its ambiguous whether pwd was used below

        // * test setting workdir
        const result = await runProcess({
            command: "pwd",
            workdir: "/",
        });
        // console.log(result);
        expect(result.content).toHaveLength(1);
        // ensure setting workdir doesn't fail:
        expect(result.isError).toBeUndefined();
        const resultStdout = result.content[0];
        expect(resultStdout.text).toBe("/\n");
        expect(resultStdout.name).toBe("STDOUT");
    });

    test("should return isError and STDERR on a failure (nonexistentcommand)", async () => {
        const result = await runProcess({
            command: "nonexistentcommand",
        });
        // console.log(result);

        expect(result.isError).toBe(true);

        expect(result.content).toHaveLength(2);

        // FYI keep EXIT_CODE first, feels appropriate
        //  do not put it after STDOUT/STDERR where it might be missed by me (when I do log reviews)
        //  also I think its best for the model to see it first/early
        const exit_code = result.content[0];
        expect(exit_code.text).toContain("127");
        expect(exit_code.name).toContain("EXIT_CODE");

        const stderr = result.content[1];
        // Verify error message contains the command name
        expect(stderr.text).toMatch(/nonexistentcommand.*not found/i);
        // gh actions:
        //   /bin/sh: 1: nonexistentcommand: not found

        expect(stderr.name).toContain("STDERR");
    });

    test("should handle missing command parameter", async () => {
        // This test verifies how the function handles a missing command parameter
        const result = await runProcess({});
        // console.log(result);

        expect(result.isError).toBe(true);

        const firstMessage = result.content[0];
        // Verify error message indicates undefined command
        expect(firstMessage.text).toContain("Command is required, current value: undefined");
    });

    test("reproduce hang rg - TODO then what to do about it?", async () => {
        // FYI rg --debug  // shows what it searches
        //  also, if rg hangs, either setup timeout OR kill process to see initial --debug output
        //  i.e. to see its search heuristic decision
        //
        const request = runProcess({

            // * issue:
            // currently, exec inherits STDIN (all STIO actually) of parent process
            // - parent is MCP _server_ process 
            // - thus, STDIN is a socket (server socket)
            // - so rg tries to search it, and nothing ever arrives, let alone EOF
            // - therefore rg hangs indefinitely
            command: "rg --debug foo"
            // * --debug output, key part:
            //   > for heuristic stdin detection on Unix, found that is_file=false, is_fifo=false and is_socket=true, 
            //   > and thus concluded that is_stdin_readable=true\nrg: DEBUG|rg::flags::hiargs


            // TODO! fix for rg socket detection, DO NOT INHERIT STDIO AT ALL
            //   that means I cannot use child_process.exec()
            //   tentative looks like I want to switch to `child_process.spawn()`
        });

        // TODO cleanup assertions once settled on solution 
        const result = await request;
        // expect(result.isError).toBeUndefined();
        const stdout = result.content[0];
        expect(result.content).toBe([]); // just to compare (log basically)
        expect(stdout.name).toBe("STDOUT");
        expect(stdout.text).toBe("Hello World");
    });

    // TODO! add integration tests of all the common commands you will use
    //   AND common scenarios of each that materially are affected by how STDIO and process are setup
    // i.e. grep, sed, fd, ls, pwd, git (status,...?), ...

    // TODO add tests of timeout parameter and implement it

    // TODO other params I want to add with new STDIO approach?
    // * shell - or at least show default shell (path/PATH) and run it to get its version and name info and add that to tool instructions?

    describe("when stdin passed and command succeeds", () => {
        const request = runProcess({
            command: "cat",
            stdin: "Hello World",
        });

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();
        });

        test("should include STDOUT from command", async () => {
            const result = await request;

            expect(result.content).toHaveLength(1);
            const stdout = result.content[0];
            expect(stdout.text).toBe("Hello World");
            expect(stdout.name).toBe("STDOUT");
        });
    });
});
