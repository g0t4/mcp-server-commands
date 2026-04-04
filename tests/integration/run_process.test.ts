import { runProcess } from "../../src/run_process.js";
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
        const request = runProcess({
            command_line: "cat",
            stdin: "Hello World",
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
        const request = runProcess({
            argv: ["cat"],
            stdin: "Hello World",
        });

        test("should not set isError", async () => {
            const result = await request;

            expect(result.isError).toBeUndefined();
        });

        test("should include STDOUT from command", async () => {
            const result = await request;
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
        describe("nonexistentcommand (failure in the command position)", () => {
            test("shell mode (command_line)", async () => {
                const result = await runProcess({
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
                        text: expect.stringMatching(/nonexistentcommand.*not found/i),
                        // i.e. gh actions:
                        //   /bin/sh: 1: nonexistentcommand: not found
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
                //   message: 'spawn nonexistentcommand ENOENT',
                //   killed: undefined,
                //   cmd: 'nonexistentcommand'
                // }

                const result = await runProcess({
                    argv: ["nonexistentcommand"],
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
                        text: expect.stringContaining("spawn nonexistentcommand ENOENT"),
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

    describe('hang due to `sleep` command', () => {
        test('should set isError and include SIGNAL when aborted by timeout', async () => {
            const result = await runProcess({
                argv: ["sleep", "10"], // long enough to be killed by the timeout
                timeout_ms: 300,      // sleep command is fast so a short timeout to get the test over with is fine actually... 300ms is fast enough and will avoid random failures for slow launch of sleep (if it happens)!
            });

            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                {
                    name: "SIGNAL",
                    type: "text",
                    text: expect.stringMatching(/SIGTERM/i),
                },
            ]);
        });
    });

    // FYI `read foo` does not hang because STDIN is not a TTY and therefore read fails with RC=1 immediately
    //   IOTW it is not a good test of hanging/timeout!
    //   proof: `read foo </dev/null` and it will return RC=1
    //   same thing happens when STDIN == "ignore" which is what is set in spawn options when not passing STDIN arg

    // describe('hang due to `vim` command', () => {
    //     // FYI this could be a brittle test (i.e. diff STDOUT/ERR messages based on OS/vim version/etc... so you can loosen the criteria... really only need to check for SIGNAL in result 
    //     // yup... on ubuntu only this test times out overall (seemingly ignores spawn options timeout_ms)... whereas on mac and arch, vim is timed out by my spawn options timeout_ms
    //     test.only('should set isError and include SIGNAL when aborted by timeout', async () => {
    //         const result = await runProcess({
    //             command_line: "vim",
    //             timeout_ms: 1000,      // 0.1 s timeout forces abort w/ minimal delay
    //         });
    //
    //         expect(result.isError).toBe(true);
    //         expect(result.content).toEqual([
    //             expect.objectContaining({
    //                 name: "SIGNAL",
    //                 text: expect.stringMatching(/SIGTERM/i),
    //             }),
    //             expect.objectContaining({
    //                 name: "STDOUT",
    //                 text: expect.stringContaining("Caught deadly signal TERM"),
    //             }),
    //             expect.objectContaining({
    //                 name: "STDERR",
    //                 text: expect.stringContaining("Vim: Warning: Output is not to a terminal"),
    //             })
    //         ]);
    //     });
    // });
    //

    describe('spawn options timeout_ms is effectively ignored for this "hung" process', () => {
        jest.setTimeout(2_500); // need a gap b/w 1_000 timeout_ms value and the test level timeout so no flaky/janky test failures
        test.only('should be killed and not be a test level timeout', async () => {

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

            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                expect.objectContaining({
                    name: "SIGNAL",
                    text: expect.stringMatching(/SIGTERM/i),
                }),
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

            console.log("post: initial runProcess");

            // * pgrep for the process
            const { stdout } = await promisify(exec)('pgrep -f "sleep 10.5" | head -1');
            const pid = Number(stdout.trim());
            // FYI if you have issues w/ PID and kill here... consider passing child.pid out of spawn_wrapped
            console.log(`pid ${pid}`);
            expect(pid).toBeGreaterThan(0);
            expect(pid).not.toBeNaN();

            console.log("pre: kill");

            process.kill(pid, 9);

            console.log("post: kill");

            // FYI interesting that killing the process doesn't result in "error" event?
            const result = await runPromise;
            console.log("post: await runPromise");
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
