import { SpawnOptions } from "node:child_process";
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

    // shell mode (command_line) vs executable mode (argv) — inferred from which parameter is provided
    const isShellMode = Boolean(args?.command_line);
    const isExecutableMode = Array.isArray(args?.argv) && (args?.argv as unknown[]).length > 0;

    if (isShellMode && isExecutableMode) {
        return errorResult("Cannot pass both 'command_line' and 'argv'. Use one or the other.");
    }
    if (!isShellMode && !isExecutableMode) {
        return errorResult("Either 'command_line' (string) or 'argv' (array) is required.");
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
            if (isShellMode) {
                const cmd = String(args?.command_line);
                const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
                plan = `Shell mode: will execute command_line via ${shell}: ${cmd}`;
            } else {
                const argv = args?.argv as string[];
                plan = `Executable mode: will spawn '${argv[0]}' with arguments ${JSON.stringify(argv.slice(1))}`;
            }
            return { content: [{ name: "PLAN", type: "text", text: plan }] } as any;
        }
        // shell mode — command_line is interpreted by the system shell
        if (isShellMode) {
            spawn_options.shell = true

            const command_line = String(args?.command_line)
            const result = await spawn_wrapped(command_line, [], stdin, spawn_options);
            return resultFor(result);
        }
        // executable mode — argv[0] is spawned directly, no shell interpretation
        if (isExecutableMode) {
            spawn_options.shell = false

            const argv = args?.argv as string[];
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
        // TODO try catch inside always_log so log fail doesn't block returning error response
        always_log("WARN: run_process failed", error);
        return response;
    }

}
