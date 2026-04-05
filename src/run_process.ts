import { SpawnOptions } from "node:child_process";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { spawn_wrapped, SpawnFailure, SpawnPromise } from "./exec-utils.js";
import { always_log } from "./logging.js";
import { errorResult, messagesFor } from "./messages.js";
import { ObjectEncodingOptions } from "node:fs";

/**
 * Executes a command and returns the result as CallToolResult.
 */
export type RunProcessArgs = Record<string, unknown> | undefined;
export function runProcess(args: RunProcessArgs): SpawnPromise {

    // shell mode (command_line) vs executable mode (argv) — inferred from which parameter is provided
    const isShellMode = Boolean(args?.command_line);
    const isExecutableMode = Array.isArray(args?.argv) && (args?.argv as unknown[]).length > 0;

    const bothProvided = isShellMode && isExecutableMode;
    if (bothProvided) {
        // FYI I am intentionally not using Promise.reject (this is an expected error and the result indicates that, so it is resolved not rejected)
        return Promise.resolve(errorResult("Cannot pass both 'command_line' and 'argv'. Use one or the other."));
    }
    const noneProvided = !isShellMode && !isExecutableMode;
    if (noneProvided) {
        return Promise.resolve(errorResult("Either 'command_line' (string) or 'argv' (array) is required."));
    }

    // * shared args
    const spawn_options: ObjectEncodingOptions & SpawnOptions = {
        // spawn options: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
        encoding: "utf8"
    };
    if (args?.cwd) {
        spawn_options.cwd = String(args.cwd);
    }
    if (args?.timeout_ms) {
        spawn_options.timeout = Number(args.timeout_ms);
    } else {
        // default timeout after 30s
        spawn_options.timeout = 30000;
    }

    const stdin = args?.stdin ? String(args.stdin) : undefined;

    try {

        if (isShellMode) {
            // * shell mode — command_line is interpreted by the system shell
            spawn_options.shell = true
            const command_line = String(args?.command_line)
            return spawn_wrapped(command_line, [], stdin, spawn_options);
        }

        // * executable mode — argv[0] is spawned directly, no shell interpretation
        spawn_options.shell = false
        const argv = args?.argv as string[];
        const command = argv[0]
        const commandArgs = argv.slice(1);
        return spawn_wrapped(command, commandArgs, stdin, spawn_options);

    } catch (error) {
        // TODO check if not SpawnFailure => i.e. test aborting/killing
        const response = {
            isError: true,
            content: messagesFor(error as SpawnFailure),
        };
        // TODO try catch inside always_log so log fail doesn't block returning error response?
        always_log("WARN: run_process failed", error);
        return Promise.resolve(response);
    }
}
