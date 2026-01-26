import { SpawnFailure, SpawnResult } from "./exec-utils.js";
import { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";

export function resultFor(spawn_result: SpawnResult): CallToolResult {
    const result_obj: CallToolResult = {
        content: messagesFor(spawn_result),
    }
    if (spawn_result.code !== 0) {
        result_obj.isError = true;
    }
    return result_obj
}

/**
 * Converts an SpawnResult into an array of TextContent messages.
 */
export function messagesFor(result: SpawnFailure | SpawnResult): TextContent[] {
    const messages: TextContent[] = [];

    if (result.code !== undefined) {
        // FYI include EXIT_CODE always, to make EXPLICIT when it is NOT a FAILURE!
        //   will double underscore when a comman fails vs not stating if it was a failure
        //   some commands give no other indication of success!
        messages.push({
            name: "EXIT_CODE",
            type: "text",
            text: `${result.code}`,
        });
    }

    // TODO add .cmd and/or .message on failures? or always?
    // maybe on errors I should? to make sure the command was as intended 
    //   much like "explain" but always shown on errors?
    //
    // at least need error.message from spawn errors
    if ("message" in result && result.message) {
        messages.push({
            name: "MESSAGE",
            type: "text",
            text: result.message,
        });
    }

    // TODO! use a test to add signal/killed indicators
    //  TODO only show when killed, do not mark not killed and/or no signal, right?
    //  definitely could be useful to know if a command was killed
    //  make sure signal is not null, which is what's used when no signal killed the process
    // if (result.signal) {
    //     messages.push({
    //         name: "SIGNAL",
    //         type: "text",
    //         text: `Signal: ${result.signal}`,
    //     });
    // } 
    // if (!!result.killed) {
    //     // killed == true is the only time to include this
    //     messages.push({
    //         name: "KILLED",
    //         type: "text",
    //         text: "Process was killed",
    //     });
    // }

    if (result.stdout) {
        messages.push({
            name: "STDOUT",
            type: "text",
            text: result.stdout,
        });
    }
    if (result.stderr) {
        messages.push({
            name: "STDERR",
            type: "text",
            text: result.stderr,
        });
    }
    return messages;
}

export function errorResult(message: string): CallToolResult {
    return {
        isError: true,
        content: [{
            name: "ERROR",
            type: "text",
            text: message,
        }],
    };
}

