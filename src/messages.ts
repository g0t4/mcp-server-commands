import { ExecResult } from "./exec-utils.js";
import { TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Converts an ExecResult into an array of TextContent messages.
 */
export function messagesFor(result: ExecResult): TextContent[] {
    const messages: TextContent[] = [];

    if (result.code !== undefined) {
        messages.push({
            type: "text",
            text: `${result.code}`,
            name: "EXIT_CODE",
        });
    }

    // PRN any situation where I want to pass .message and/or .cmd?
    // maybe on errors I should? that way there's a chance to make sure the command was as intended
    // and maybe include message when it doesn't contain stderr?
    // FYI if I put these back, start with tests first

    // PRN use a test to add these, sleep 10s maybe and then kill that process?
    //  definitely could be useful to know if a command was killed
    //  make sure signal is not null, which is what's used when no signal killed the process
    // if (result.signal) {
    //     messages.push({
    //         type: "text",
    //         text: `Signal: ${result.signal}`,
    //         name: "SIGNAL",
    //     });
    // } 
    // if (!!result.killed) {
    //     // killed == true is the only time to include this
    //     messages.push({
    //         type: "text",
    //         text: "Process was killed",
    //         name: "KILLED",
    //     });
    // }

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
