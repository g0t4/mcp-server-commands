import { promises as fs } from "node:fs";
import { always_log, verbose_log } from "./logs.js";

// TODO add configurable path to this file (will fix pathing issues too)
// FYI pathing is to workaround no support for a cwd in claude_desktop_config.json (yet?)
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FILE_NAME = __dirname + "/reminders.txt";
verbose_log("INFO: reminders file", FILE_NAME);

export async function readReminders(): Promise<String> {
    // if the file doesn't exist, treat that as NO reminders
    const file_exists = await fs
        .access(FILE_NAME, fs.constants.F_OK)
        .then(() => true) // if does exist, set to true
        .catch(() => false); // error callback only invoked if does not exist
    if (!file_exists) {
        // dont wanna log failures when the file is just not there
        return "";
    }

    try {
        return (await fs.readFile(FILE_NAME, "utf8")) ?? "";
    } catch (error) {
        always_log("WARN: reading reminders failed", error);
        return "";
    }
}
