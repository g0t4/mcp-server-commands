import { ExecResult } from "./exec-utils.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Converts an ExecResult into an array of TextContent messages.
 */
export function messagesFor(result: ExecResult): TextContent[] {
    // TODO! RETURN CODE!!! add as RETURN_CODE and number type
    const messages: TextContent[] = [];
    if (result.message) {
        messages.push({
            type: "text",
            text: result.message,
            name: "ERROR",
        });
    }
    if (result.stdout) {
        messages.push({
            type: "text",
            text: result.stdout,
            name: "STDOUT",
        });
    }
    if (result.stderr) {
        messages.push({
            type: "text",
            text: result.stderr,
            name: "STDERR",
        });
    }
    return messages;
}
