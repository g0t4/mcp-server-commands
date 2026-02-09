import { spawn, SpawnOptions } from "node:child_process";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { spawn_wrapped, SpawnResult, SpawnFailure } from "./exec-utils.js";
import { always_log } from "./always_log.js";
import { errorResult, messagesFor, resultFor } from "./messages.js";
import { ObjectEncodingOptions } from "node:fs";

/**
 * Executes a command and returns the result as CallToolResult.
 */
export type RunProcessArgs = Record<string, unknown> | undefined;
export async function runProcess(args: RunProcessArgs): Promise<CallToolResult> {

    const command_line = args?.command_line as string;
    const argv = args?.argv as string;

    const mode = String(args?.mode);
    if (!mode) {
        return errorResult("Mode is required");
    }

    const isShell = mode === "shell";
    const isExecutable = mode === "executable";

    if (!isShell && !isExecutable) {
        return errorResult(
            `Invalid mode '${mode}'. Allowed values are 'shell' or 'executable'.`
        );
    }

    // * shared args
    const spawn_options: ObjectEncodingOptions & SpawnOptions = {
        // spawn options: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
        encoding: "utf8"
    };
    if (args?.cwd) {
        spawn_options.cwd = String(args.cwd);
    }
    // PRN args.env
    if (args?.timeout_ms) {
        spawn_options.timeout = Number(args.timeout_ms);
    } else {
        // default timeout after 30s
        spawn_options.timeout = 30000;
    }
    // PRN windowsHide on Windows, signal, killSignal
    // FYI spawn_options.stdio => default is perfect ['pipe', 'pipe', 'pipe'] https://nodejs.org/api/child_process.html#optionsstdio 
    //   do not set inherit (this is what causes ripgrep to see STDIN socket and search it, thus hanging)
    const stdin = args?.stdin ? String(args.stdin) : undefined; // TODO
    const dryRun = Boolean(args?.dry_run);

    try {
        if (dryRun) {
            // Build a descriptive plan without executing anything
            let plan = '';
            if (isShell) {
                const cmd = String(args?.command_line);
                const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
                plan = `Shell mode: will execute command_line via ${shell}: ${cmd}`;
            } else if (isExecutable) {
                const argv = args?.argv as string[];
                plan = `Executable mode: will spawn '${argv[0]}' with arguments ${JSON.stringify(argv.slice(1))}`;
            }
            return { content: [{ name: "PLAN", type: "text", text: plan }] } as any;
        }
        if (isShell) {
            if (!args?.command_line) {
                return errorResult(
                    "Mode 'shell' requires a non‑empty 'command_line' parameter."
                );
            }
            if (args?.argv) {
                return errorResult(
                    "Mode 'shell' does not accept an 'argv' parameter."
                );
            }

            spawn_options.shell = true

            const command_line = String(args?.command_line)
            const result = await spawn_wrapped(command_line, [], stdin, spawn_options);
            return resultFor(result);
        }
        if (isExecutable) {
            const argv = args?.argv;
            if (!Array.isArray(argv) || argv.length === 0) {
                return errorResult(
                    "Mode 'executable' requires a non‑empty 'argv' array."
                );
            }
            if (args?.command_line) {
                return errorResult(
                    "Mode 'executable' does not accept a 'command_line' parameter."
                );
            }

            spawn_options.shell = false

            const command = argv[0]
            const commandArgs = argv.slice(1);

            const result = await spawn_wrapped(command, commandArgs, stdin, spawn_options);
            return resultFor(result);
        }

        // TODO... fish shell workaround (see exec-utils.ts) - ADD or FIX via a TEST FIRST

        return errorResult("Unexpected execution path in runProcess, should not be possible");
    } catch (error) {
        // TODO check if not SpawnFailure => i.e. test aborting/killing
        const response = {
            isError: true,
            content: messagesFor(error as SpawnFailure),
        };
        always_log("WARN: run_process failed", error);
        return response;
    }

}
