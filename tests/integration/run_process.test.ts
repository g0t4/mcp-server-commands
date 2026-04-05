import { runProcess } from "../../src/exec-utils.js";
import process from "node:process"
import { exec, spawn } from 'child_process';
import { once } from 'events';
import { promisify } from "util";

// NOTES:
// ? use JSONRPCError if it's not a command's failure?
//   tool failures should be isError as below
//    https://modelcontextprotocol.io/specification/2025-06-18/schema#jsonrpcerror
//    right now I include failure of a command in the result
//      non-zero exit code, STDOUT/STDERR, etc...
//      feels richer way to explain problem with a command

describe("runProcess - validating argument parsing/validation and basic success/failure outputs", () => {

    describe("when shell mode (command_line) is successful and using STDIN", () => {

        test("should NOT set isError + returns EXIT_CODE=0 + STDOUT", async () => {
            const result = await runProcess({
                command_line: "cat",
                stdin: "Hello World",
            });

            // *** tool response format (isError only set if failure)
            expect(result.isError).toBeUndefined();
            //  https://modelcontextprotocol.io/docs/concepts/tools#error-handling-2

            expect(result.content).toEqual([
                {
                    name: "EXIT_CODE",
                    type: "text",
                    text: "0",
                },
                {
                    name: "STDOUT",
                    type: "text",
                    text: "Hello World",
                },
            ]);
        });
    });

    describe("when executable mode (argv) is successful", () => {
        test("should NOT set isError + returns EXIT_CODE=0 + STDOUT", async () => {
            const result = await runProcess({
                argv: ["cat"],
                stdin: "Hello World",
            });

            expect(result.isError).toBeUndefined();

            expect(result.content).toEqual([
                {
                    name: "EXIT_CODE",
                    type: "text",
                    text: "0",
                },
                {
                    name: "STDOUT",
                    type: "text",
                    text: "Hello World",
                },
            ]);
        });
    });

    test("should change working directory based on workdir arg", async () => {
        const pwd = await runProcess({
            command_line: "pwd",
        });
        // console.log(pwd);

        // * ensure default CWD is not /
        // make sure command succeeded so I can make assumption about default directory
        expect(pwd.content).toEqual([
            {
                name: "EXIT_CODE",
                type: "text",
                text: "0",
            },
            {
                name: "STDOUT",
                type: "text",
                // the exact output may vary, but we only need to ensure it is not "/\n"
                text: expect.not.stringContaining("/\n"),
            },
        ]);
        expect(pwd.isError).toBeUndefined();

        // * test setting CWD to /
        const cwd = await runProcess({
            command_line: "pwd",
            cwd: "/",
        });
        // console.log(cwd);
        // ensure setting workdir doesn't fail:
        expect(cwd.content).toEqual([
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
        expect(cwd.isError).toBeUndefined();
    });

    describe("failures set isError and explain why", () => {
        describe("shell_nonexistentcommand (failure in the command position)", () => {
            test("shell mode (command_line)", async () => {
                const result = await runProcess({
                    command_line: "shell_nonexistentcommand",
                });
                // console.log(result);

                // * error is from shell, thus 'close' returns it
                // ON_CLOSE {
                //   stdout: '',
                //   stderr: '/bin/sh: shell_nonexistentcommand: command not found\n',
                //   code: 127,
                //   signal: undefined
                // }

                expect(result.isError).toBe(true);
                // FYI keep EXIT_CODE first, feels appropriate
                //  do not put it after STDOUT/STDERR where it might be missed by me (when I do log reviews)
                //  also I think its best for the model to see it first/early
                expect(result.content).toEqual([
                    // FYI use objectContaining for partial object match (i.e. in this case skip type: "text")
                    expect.objectContaining({
                        name: expect.stringContaining("EXIT_CODE"),
                        text: expect.stringContaining("127"),
                    }),
                    expect.objectContaining({
                        name: expect.stringContaining("STDERR"),
                        // Different shells emit different messages, but all contain
                        // the command name and a “not found” phrase.
                        text: expect.stringMatching(/shell_nonexistentcommand.*not found/i),
                        // i.e. gh actions:
                        //   /bin/sh: 1: shell_nonexistentcommand: not found
                    }),
                ]);
            });

            test("executable mode (argv)", async () => {
                // * error is from spawn (not shell)
                //   thus 'error' event returns this one
                // * not the same as shell mode above
                // ON_ERROR {
                //   stdout: '',
                //   stderr: '',
                //   code: 'ENOENT',
                //   signal: undefined,
                //   message: 'spawn exec_nonexistentcommand ENOENT',
                //   killed: undefined,
                //   cmd: 'exec_nonexistentcommand'
                // }

                const result = await runProcess({
                    argv: ["exec_nonexistentcommand"],
                });
                // console.log(result);

                expect(result.isError).toBe(true);
                expect(result.content).toEqual([
                    {
                        name: "EXIT_CODE",
                        type: "text",
                        text: expect.stringContaining("ENOENT"),
                    },
                    {
                        name: "MESSAGE",
                        type: "text",
                        text: expect.stringContaining("spawn exec_nonexistentcommand ENOENT"),
                    },
                ]);

            });
        });

        describe("valid command, fails", () => {
            test("shell mode (command_line) returning non‑zero exit code", async () => {
                // tests failing command through the 'close' event pathway
                //  yes this couples to implementation, so be it!
                const result = await runProcess({
                    command_line: "exit 42",
                });
                // console.log(result);
                // The process should be reported as an error because the exit code is non‑zero
                expect(result.isError).toBe(true);
                expect(result.content).toEqual([
                    {
                        name: "EXIT_CODE",
                        type: "text",
                        text: expect.stringContaining("42"),
                    },
                ]);
            });
        });

    });

    describe("simple runProcess argument validation failures", () => {
        const scenarios = [
            {
                name: "neither command_line nor argv provided",
                args: {},
                expectedMessage:
                    "Either 'command_line' (string) or 'argv' (array) is required."
            },
            {
                name: "both command_line and argv provided",
                args: { command_line: "echo hi", argv: ["date"] },
                expectedMessage:
                    "Cannot pass both 'command_line' and 'argv'. Use one or the other."
            },
        ];

        test.each(scenarios)("$name", async ({ args, expectedMessage }) => {
            const result = await runProcess(args as any);
            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                {
                    name: "ERROR",
                    type: "text",
                    text: expect.stringContaining(expectedMessage),
                },
            ]);
        });
    });
    // TODO! other params I want to add with new STDIO approach?
});

describe('timeout', () => {

    const has_SIGTERM = expect.objectContaining({
        name: "SIGNAL",
        type: "text",
        text: expect.stringMatching(/SIGTERM/i),
    });

    describe('hang due to `sleep` command', () => {
        test('should set isError and include SIGNAL when aborted by timeout', async () => {
            const result = await runProcess({
                argv: ["sleep", "10"], // long enough to be killed by the timeout
                timeout_ms: 300,      // sleep command is fast so a short timeout to get the test over with is fine actually... 300ms is fast enough and will avoid random failures for slow launch of sleep (if it happens)!
            });

            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                has_SIGTERM
            ]);
        });
    });

    test("`read foo` DOES NOT HANG, thus no timeout... instead read detects a lack of STDIN and returns a non-zero exit code", async () => {
        const result = await runProcess({
            command_line: "read foo",
        });

        // The builtin should exit with a non‑zero code and be marked as an error.
        expect(result.isError).toBe(true);
        expect(result.content).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: "EXIT_CODE",
                type: "text",
                text: expect.stringContaining("1"),
            }),
        ]));

    });

    describe('hang due to `vim` command', () => {
        // with new detached process group + custom timeout... behavior now matches across ubuntu+macOS 
        //   so let's keep this as yet another timeout example, doesn't hurt!
        //   also helps identify vim timeout issues in case they are confused with the git-commit+vim scenario below
        test('should set isError and include SIGNAL when aborted by timeout', async () => {
            const result = await runProcess({
                command_line: "vim",
                timeout_ms: 1000,      // 0.1 s timeout forces abort w/ minimal delay
            });

            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                has_SIGTERM,
                expect.objectContaining({
                    name: "STDOUT",
                    text: expect.stringContaining("Caught deadly signal TERM"),
                }),
                expect.objectContaining({
                    name: "STDERR",
                    text: expect.stringContaining("Vim: Warning: Output is not to a terminal"),
                })
            ]);
        });
    });


    describe('spawn options timeout_ms is effectively ignored for this "hung" process', () => {
        jest.setTimeout(2_500); // need a gap b/w 1_000 timeout_ms value and the test level timeout so no flaky/janky test failures
        test('should be killed and not be a test level timeout', async () => {

            // * here are the messages that indicate test level timeout:
            //
            //     thrown: "Exceeded timeout of 5000 ms for a test.
            //     Add a timeout value to this test to increase the timeout, if this is a long-running test. See https://jestjs.io/docs/api#testname-fn-timeout."
            //
            //       311 |     describe('spawn options timeout_ms is effectively ignored for this "hung?" process', () => {
            //     > 312 |         test.only('should be killed and not be a test level timeout', async () => {
            //           |              ^
            //       313 |             const result = await runProcess({
            //
            // A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.
            //

            const result = await runProcess({
                // candidates:
                //  git commit --amend ... this works across mac/arch/ubuntu! and if the test is going to timeout then the commit is never actually modified (unless the test fails to fail ;)... and succeeds in amending somehow)
                //  git commit --edit # edit message in editor
                // set git config:
                //   miminal config to commit: user.{name,email}
                //   editor that hangs: vim (PRN nvim might work if issues with vim)
                //   vim appears to work on arch/mac/ubuntu so let's run with it for now!
                command_line: "git -c core.editor=vim -c user.email='wes@wes.com' -c user.name='wes' commit --amend",
                timeout_ms: 1_000, // force abort after 1 second... give the git command and editor time to launch (at least 100ms, but lets just do 1,000ms) else you will get random failures
            });

            // console.log(result)

            expect(result.isError).toBe(true);

            // [1.025s] SIGNAL_EXIT {
            //   stdout: '',
            //   stderr: 'Vim: Warning: Output is not to a terminal\n' +
            //     'Vim: Warning: Input is not from a terminal\n',
            //   code: undefined,
            //   signal: 'SIGTERM'
            // }

            const requiredVimWarnings = expect.objectContaining({
                name: "STDERR",
                // FYI \s == whitespace (including \n)
                //     \S == not whitespace (everything else)
                //     * means basically any lines in between (or none)
                text: expect.stringMatching(
                    /Vim: Warning: Output is not to a terminal[\s\S]*Vim: Warning: Input is not from a terminal/
                ),
            });

            expect(result.content).toEqual(
                expect.arrayContaining([has_SIGTERM, requiredVimWarnings])
            );

        });
    });



});

describe("runProcess - signal handling", () => {

    describe('runProcess kill handling', () => {

        test('should report killed when the child process is terminated externally', async () => {
            // start a long‑running process (sleep 10 seconds)
            //  FYI test will timeout at 5 seconds (before process finishes at 10 seconds)
            const runPromise = runProcess({
                // PRN also test for shell mode?
                // command_line: "sleep 10.5",

                argv: ['sleep', '10.5'],
                // FYI 10.5 is "odd" number so it's less likely to kill smth important :)
                // PRN I could find this otherwise to avoid killing smth else  
                //   like check parent processes, or if multiple matches then fail this test
            });

            expect(runPromise.pid!).toBeGreaterThan(0);

            process.kill(runPromise.pid!, 9);

            // FYI interesting that killing the process doesn't result in "error" event?
            const result = await runPromise;
            // console.log(result);
            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                {
                    name: "SIGNAL",
                    type: "text",
                    text: "SIGKILL",
                },
            ]);
        });

    });

    // TODO abort controller? if I add cooperative cancellation or smth like it
});
