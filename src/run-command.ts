import { exec, ExecOptions } from "node:child_process";
import { promisify } from "node:util";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { execFileWithInput, ExecResult } from "./exec-utils.js";
import { always_log } from "./always_log.js";
import { messagesFor } from "./messages.js";
import { ObjectEncodingOptions } from "node:fs";

const execAsync = promisify(exec);

async function execute(command: string, stdin: string, options: ExecOptions) {
    if (!stdin) {
        return await execAsync(command, options);
    }
    return await execFileWithInput(command, stdin, options);
}

/**
 * Executes a command and returns the result as CallToolResult.
 */
export async function runCommand(
    args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
    const command = args?.command as string;
    if (!command) {
        const message = "Command is required, current value: " + command;
        return {
            isError: true,
            content: [{ type: "text", text: message }],
        };
    }

    const options: ObjectEncodingOptions & ExecOptions = { encoding: "utf8" };
    if (args?.workdir) {
        options.cwd = String(args.workdir);
    }

    const stdin = args?.stdin as string;

    try {
        const result = await execute(command, stdin, options);
        return {
            content: messagesFor(result),
        };
    } catch (error) {
        const response = {
            isError: true,
            content: messagesFor(error as ExecResult),
        };
        always_log("WARN: run_command failed", response);
        return response;
    }
}
