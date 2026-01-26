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

export function messagesFor(result: SpawnFailure | SpawnResult): TextContent[] {
    const messages: TextContent[] = [];

    if (result.code !== undefined) {
        // FYI include EXIT_CODE always, to make EXPLICIT when it is NOT a FAILURE!
        //   will double underscore when a comman fails vs not stating if it was a failure
        //   some commands give no other indication of success!
        messages.push({
            name: "EXIT_CODE",
            type: "text",
            text: String(result.code),
        });
    }

    // // PRN map COMMAND for failures so model can adjust what it passes vs what actually ran?
    // if ("cmd" in result && result.cmd) {
    //     messages.push({
    //         name: "COMMAND",
    //         type: "text",
    //         text: result.cmd,
    //     });
    // }

    if ("message" in result && result.message) {
        // at least need error.message from spawn errors
        messages.push({
            name: "MESSAGE",
            type: "text",
            text: result.message,
        });
    }

    if (result.signal) {
        messages.push({
            name: "SIGNAL",
            type: "text",
            text: result.signal,
        });
    }

    // // when is this set? what conditions? I tried `kill -9` and didn't trigger "error" event
    // if ("killed" in result && result.killed) {
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

