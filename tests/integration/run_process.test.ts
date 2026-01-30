import { runProcess } from "../../src/run_process.js";
jest.setTimeout(15000);
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
            mode: "shell",
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
            mode: "shell",
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

describe("runProcess - signal handling", () => {

    test("should set isError and include SIGNAL when aborted by timeout", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["sleep", "10"], // long enough to be killed by the timeout
            timeout_ms: 100,      // 0.1 s timeout forces abort w/ minimal delay
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

    test("should timeout with default timeout when running a long sleep", async () => {
        const result = await runProcess({
            mode: "executable",
            argv: ["sleep", "7"],
            // no timeout_ms provided, should use default (5 s) and abort
            //  FYI if you change hardcoded default of 5s then this test has to be updated
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
