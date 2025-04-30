import { ObjectEncodingOptions } from "node:fs";
import { ExecOptions } from "node:child_process";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { execFileWithInput, ExecResult } from "./exec-utils.js";
import { messagesFor } from "./messages.js";
import { always_log } from "./always_log.js";

/**
 * Executes a script via interpreter and returns the result as CallToolResult.
 */
export async function runScript(
    args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
    const interpreter = args?.interpreter as string;
    if (!interpreter) {
        const message = "Interpreter is missing, passed value: " + interpreter;
        return {
            isError: true,
            content: [{ type: "text", text: message }],
        };
    }

    const options: ObjectEncodingOptions & ExecOptions = { encoding: "utf8" };
    if (args?.workdir) {
        options.cwd = String(args.workdir);
    }

    const stdinText = args?.stdinText as string;

    try {
        const result = await execFileWithInput(interpreter, stdinText, options);
        return {
            content: messagesFor(result),
        };
    } catch (error) {
        const response = {
            isError: true,
            content: messagesFor(error as ExecResult),
        };
        always_log("WARN: run_script failed", response);
        return response;
    }
}
