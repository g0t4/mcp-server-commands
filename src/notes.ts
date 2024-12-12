import { promises as fs } from "node:fs";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { always_log, verbose_log } from "./logs.js";

// TODO could I just inform Claude to store notes in a file on disk and let Claude handle that itself using run_command and run_script tools :)
// somehow having two tools to read/write feels like overkill and I am wanting another for appending instead of rewriting entire file... ugh just use two for now and can optimize later
//const FILE_NAME = "notes.txt";
// TODO if notes prove useful, then add a path arg to the CLI args for this server
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FILE_NAME = __dirname + "/notes.txt";
verbose_log("INFO: reminders file", FILE_NAME);

export async function writeCommandNotes(
    args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
    const message = args?.message as string;
    if (!message) {
        throw new Error("message is required");
    }

    verbose_log("INFO: add_reminder", message);

    try {
        await fs.writeFile(FILE_NAME, message);
        return {
            isError: false,
            content: [],
        };
    } catch (error) {
        // TODO test w/ lock file on macOS and try writing to it, it will fail
        //           "text": "Error writing notes: Error: EPERM: operation not permitted, open 'notes.txt'",
        return notesFailure("Writing reminders failed: " + error);
    }
}

export async function readCommandNotes(): Promise<CallToolResult> {
    verbose_log("INFO: get_reminders");

    // if the file doesn't exist, treat that as NO notes
    const file_exists = await fs
        .access(FILE_NAME, fs.constants.F_OK)
        .then(() => true) // if does exist, set to true
        .catch(() => false); // error callback only invoked if does not exist
    if (!file_exists) {
        // TODO write test case for this
        always_log(
            "INFO: get_reminders no file found " + FILE_NAME,
            file_exists
        );
        // IOTW NO FILE is not a FAILURE, it's simply EMPTY
        return notesResult("");
    }

    try {
        const reminders = (await fs.readFile(FILE_NAME, "utf8")) ?? "";
        return notesResult(reminders);
    } catch (error) {
        return notesFailure("Reading reminders failed: " + error);
    }
}

function notesResult(notes: string): CallToolResult {
    return {
        isError: false,
        content: [
            {
                type: "text",
                text: notes,
                name: "REMINDERS",
            },
        ],
    };
}

function notesFailure(message: string): CallToolResult {
    const response: CallToolResult = {
        isError: true,
        content: [
            {
                type: "text",
                text: message,
                name: "ERROR",
            },
        ],
    };
    always_log("WARN:", response);
    return response;
}
