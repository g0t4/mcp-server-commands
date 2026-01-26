import { runProcess } from "../../src/run_process.js";
import { exec, spawn } from 'child_process';
import { once } from 'events';
import { promisify } from "util";

// NOTES:
// ?? use JSONRPCError on errors? or some of them?
//    https://modelcontextprotocol.io/specification/2025-06-18/schema#jsonrpcerror
//    right now I include failure of a command in the result
//      non-zero exit code, STDOUT/STDERR, etc...
//      feels richer way to explain problem with a command

describe("runProcess - validating argument parsing/validation and basic success/failure outputs", () => {
    // FYI always_log uses console.error (ignore it, or use test.only... do not remove the logging)

    describe("when mode=shell+command_line is successful and using STDIN", () => {
        const request = runProcess({
            mode: "shell",
            command_line: "cat",
            input: "Hello World",
        });

        test("should NOT set isError", async () => {
            const result = await request;

            // *** tool response format  (isError only set if failure)
            expect(result.isError).toBeUndefined();
            //  https://modelcontextprotocol.io/docs/concepts/tools#error-handling-2
        });

        test("should include STDOUT from command (from STDIN)", async () => {
            const result = await request;
            // console.log(result); // left these around as a convenience/reminder
            //  console.log looks really nice with jest logging

            expect(result.content).toHaveLength(2);
            const first = result.content[0];
            expect(first.name).toBe("EXIT_CODE");
            expect(first.text).toBe("0");

            const stdout = result.content[1];
            expect(stdout.name).toBe("STDOUT");
            expect(stdout.text).toBe("Hello World");
        });
    });

    describe("when mode=executable+argv is successful", () => {
        const request = runProcess({
            mode: "executable",
            argv: ["cat"],
            input: "Hello World",
        });

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();
        });

        test("should include STDOUT from command", async () => {
            const result = await request;
            // console.log(result);

            expect(result.content).toHaveLength(2);
            const first = result.content[0];
            expect(first.name).toBe("EXIT_CODE");
            expect(first.text).toBe("0");

            const stdout = result.content[1];
            expect(stdout.name).toBe("STDOUT");
            expect(stdout.text).toBe("Hello World");
        });
    });

    test("should change working directory based on workdir arg", async () => {
        const pwd = await runProcess({
            mode: "shell",
            command_line: "pwd",
        });
        // console.log(pwd);

        // * ensure default CWD is not /
        // make sure command succeeded so I can make assumption about default directory
        expect(pwd.content).toHaveLength(2);
        expect(pwd.isError).toBeUndefined();
        expect(pwd.content[1].name).toBe("STDOUT");
        expect(pwd.content[1].text).not.toBe("/\n");
        // fail the test if the default is the same as /
        // that way I don't have to hardcode the PWD expectation
        // and still trigger a failure if its ambiguous whether pwd was used below

        // * test setting CWD to /
        const cwd = await runProcess({
            mode: "shell",
            command_line: "pwd",
            cwd: "/",
        });
        // console.log(cwd);
        // ensure setting workdir doesn't fail:
        expect(cwd.content).toHaveLength(2);
        expect(cwd.content[0].name).toBe("EXIT_CODE");
        expect(cwd.content[0].text).toBe("0");
        expect(cwd.isError).toBeUndefined();
        expect(cwd.content[1].name).toBe("STDOUT");
        expect(cwd.content[1].text).toBe("/\n");
    });

    describe("failures set isError and explain why", () => {
        describe("nonexistentcommand (failure in the command position)", () => {
            test("shell+command_line", async () => {
                const result = await runProcess({
                    mode: "shell",
                    command_line: "nonexistentcommand",
                });
                // console.log(result);

                // * error is from shell, thus 'close' returns it
                // ON_CLOSE {
                //   stdout: '',
                //   stderr: '/bin/sh: nonexistentcommand: command not found\n',
                //   code: 127,
                //   signal: undefined
                // }

                expect(result.isError).toBe(true);
                expect(result.content).toHaveLength(2);

                // FYI keep EXIT_CODE first, feels appropriate
                //  do not put it after STDOUT/STDERR where it might be missed by me (when I do log reviews)
                //  also I think its best for the model to see it first/early
                const exit_code = result.content[0];
                expect(exit_code.name).toContain("EXIT_CODE");
                expect(exit_code.text).toContain("127");

                // * verify error explains (contains) nonexistentcommand
                const stderr = result.content[1];
                expect(stderr.name).toContain("STDERR");
                // FYI different shells will have different messages 
                // - might need shell/os specific test case if that causes issues
                expect(stderr.text).toMatch(/nonexistentcommand.*not found/i);
                // gh actions:
                //   /bin/sh: 1: nonexistentcommand: not found

            });

            test("executable+argv", async () => {
                // * error is from spawn (not shell)
                //   thus 'error' event returns this one 
                // * not the same as with shell+command_line above
                // ON_ERROR {
                //   stdout: '',
                //   stderr: '',
                //   code: 'ENOENT',
                //   signal: undefined,
                //   message: 'spawn nonexistentcommand ENOENT',
                //   killed: undefined,
                //   cmd: 'nonexistentcommand'
                // }

                const result = await runProcess({
                    mode: "executable",
                    argv: ["nonexistentcommand"],
                });
                // console.log(result);

                expect(result.isError).toBe(true);
                expect(result.content).toHaveLength(2);
                const exit_code = result.content[0];
                expect(exit_code.name).toContain("EXIT_CODE");
                expect(exit_code.text).toContain("ENOENT");
                //
                //  this error is raised by spawn, not my spawn_wrapped
                //  therefore it has different fields, including message
                const message = result.content[1];
                expect(message.name).toContain("MESSAGE");
                expect(message.text).toContain("spawn nonexistentcommand ENOENT");
            });
        });

        describe("valid command, fails", () => {
            test("shell+command_line returning non‑zero exit code", async () => {
                // tests failing command through the 'close' event pathway
                //  yes this couples to implementation, so be it!
                const result = await runProcess({
                    mode: "shell",
                    command_line: "exit 42",
                });
                // console.log(result);
                // The process should be reported as an error because the exit code is non‑zero
                expect(result.isError).toBe(true);
                expect(result.content).toHaveLength(1);
                const exit_code = result.content[0];
                expect(exit_code.name).toContain("EXIT_CODE");
                expect(exit_code.text).toContain("42");
            });
        });

    });

    describe("simple runProcess argument validation failures", () => {
        const scenarios = [
            {
                name: "missing mode",
                args: {},
                expectedMessage:
                    "Invalid mode 'undefined'. Allowed values are 'shell' or 'executable'."
            },
            {
                name: "invalid mode",
                args: { mode: "unknown" },
                expectedMessage:
                    "Invalid mode 'unknown'. Allowed values are 'shell' or 'executable'."
            },
            {
                name: "shell mode without command_line",
                args: { mode: "shell" },
                expectedMessage:
                    "Mode 'shell' requires a non‑empty 'command_line' parameter."
            },
            {
                name: "shell mode with argv (forbidden)",
                args: { mode: "shell", argv: ["date"], command_line: "echo hi" },
                expectedMessage:
                    "Mode 'shell' does not accept an 'argv' parameter."
            },
            {
                name: "executable mode without argv",
                args: { mode: "executable" },
                expectedMessage:
                    "Mode 'executable' requires a non‑empty 'argv' array."
            },
            {
                name: "executable mode with command_line (forbidden)",
                args: { mode: "executable", argv: ["date"], command_line: "echo hi" },
                expectedMessage:
                    "Mode 'executable' does not accept a 'command_line' parameter."
            }
        ];

        test.each(scenarios)("$name", async ({ args, expectedMessage }) => {
            const result = await runProcess(args as any);

            // Verify the result is an error with the expected message
            expect(result.isError).toBe(true);
            expect(result.content).toHaveLength(1);
            const first = result.content[0];
            expect(first.name).toBe("ERROR");
            expect(first.text).toContain(expectedMessage);
        });
    });

    // TODO! add tests of timeout parameter and implement it
    // TODO! other params I want to add with new STDIO approach?
});

describe("runProcess - signal handling", () => {

    test("should set isError and include SIGNAL when aborted by timeout", async () => {

        const result = await runProcess({
            mode: "executable",
            argv: ["sleep", "10"], // long enough to be killed by the timeout
            timeout_ms: 100,      // 0.1 s timeout forces abort w/ minimal delay
        });

        expect(result.isError).toBe(true);

        expect(result.content).toHaveLength(1);
        // At least EXIT_CODE and SIGNAL should be present
        const signal = result.content[0];
        expect(signal?.name).toBe("SIGNAL");
        expect(signal?.text).toMatch(/SIG(TERM|KILL)/i);
    });


    describe('runProcess kill handling', () => {
        it('should report killed when the child process is terminated externally', async () => {
            // start a long‑running process (sleep 10 seconds)
            //  FYI test will timeout at 5 seconds (before process finishes at 10 seconds)
            const runPromise = runProcess({

                // PRN also test for shell mode?
                // mode: "shell"
                // command_line: "sleep 10.5",

                mode: 'executable',
                argv: ['sleep', '10.5'],
                // FYI 10.5 is "odd" number so it's less likely to kill smth important :)
                // PRN I could find this otherwise to avoid killing smth else  
                //   like check parent processes, or if multiple matches then fail this test

                dry_run: false,
            });

            // * pgrep for the process
            const { stdout } = await promisify(exec)('pgrep -f "sleep 10.5"');
            const pid = Number(stdout.trim());
            // console.log(pid);

            await exec(`kill -9 ${pid}`);

            // FYI interesting that killing the process doesn't result in "error" event?
            const result = await runPromise;
            // console.log(result);
            expect(result.isError).toBe(true);
            expect(result.content).toHaveLength(1);
            const failure = result.content[0];
            // expect(failure.killed).toBe(true);
            expect(failure.name).toBe("SIGNAL");
            expect(failure.text).toBe("SIGKILL");
        });
    });


    // TODO abort controller? if I add cooperative cancellation or smth like it
});

describe("validate common commands work", () => {

    // TODO! add integration tests of all the common commands you will use
    //   AND common scenarios of each that materially are affected by how STDIO and process are setup
    // i.e. grep, sed, fd, ls, pwd, git (status,...?), ...

    // TODO! MOVE exec-utils.test.ts here... just do all these as integration tests!
    // * that way I can easily test commands a model sense (i.e. rg issue) 
    // * and I can easily assert the model sees what I think it sees!

    describe("ripgrep", () => {
        test("ripgrep shouldn't hang on searching STDIN when there's no STDIN", async () => {
            // previously using `child_process.exec()` resulted in `rg` hanging
            //   b/c rg sees STDIN==socket => sets is_stdin_readable
            //   => IIUC STDIN never closes => thus rg hangs until timeout
            //
            // * `spawn` allows controlling STDIO (unlike `exec`)
            //   spawn defaults to `pipe` which rg also sees as socket/searchable
            //   * setting STDIN to `ignore` attaches /dev/null
            //   => ripgrep doesn't hang now (and is_stdin_readable=false)

            // * --debug output, key output 
            //   > for heuristic stdin detection on Unix, found that is_file=false, is_fifo=false and is_socket=true, 
            //   > and thus concluded that is_stdin_readable=true\nrg: DEBUG|rg::flags::hiargs
            const request = runProcess({
                mode: "executable",
                argv: ["rg", "--debug", "foo"],
                timeout_ms: 10, // FYI set timeout_ms so you get result object below
                // if you let test itself timeout, you won't get result object to assert below
            });

            const result = await request;
            // console.log(result);
            const stderr = result.content.find(c => c.name === "STDERR");
            expect(stderr).toBeDefined();
            expect(stderr!.text).not.toContain(
                "concluded that is_stdin_readable=true"
            );
        });
        test("ripgrep can search over STDIN when STDIN is provided", async () => {
            const result = await runProcess({
                mode: "executable",
                argv: ["rg", "bar"],
                input: "foo\nbar\nbaz",
                timeout_ms: 5000,
            });
            console.log(result);
            expect(result.content).toEqual(
                expect.arrayContaining([{
                    name: "STDOUT",
                    type: "text",
                    text: "2:1:bar\n",
                }])
            );

        });
    });

});
