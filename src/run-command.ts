import { exec, ExecOptions } from "node:child_process";
import { promisify } from "node:util";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ExecResult } from "./exec-utils.js";
import { always_log } from "./always_log.js";
import { messagesFor } from "./messages.js";

const execAsync = promisify(exec);

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

    const options: ExecOptions = {};
    if (args?.workdir) {
        options.cwd = String(args.workdir);
    }

    try {
        const result = await execAsync(command, options);
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

// const options: ObjectEncodingOptions & ExecOptions = { encoding: "utf8" };
// if (args?.workdir) {
//     options.cwd = String(args.workdir);
// }
//
// const stdinText = args?.stdinText as string;
//
// try {
//     const result = await execFileWithInput(interpreter, stdinText, options);
//
