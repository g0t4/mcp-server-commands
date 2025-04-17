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
  const command = String(args?.command);
  if (!command) {
    throw new Error("Command is required");
  }

  const options: ExecOptions = {};
  if (args?.workdir) {
    options.cwd = String(args.workdir);
  }

  try {
    const result = await execAsync(command, options);
    return {
      isError: false,
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

