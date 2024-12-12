import { promises as fs } from "node:fs";
import { always_log, verbose_log } from "./logs.js";

// TODO add configurable path to this file (will fix pathing issues too)
// FYI pathing is to workaround no support for a cwd in claude_desktop_config.json (yet?)
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let reminders_file_path = __dirname + "/reminders.txt";

// check for --reminders PATH in CLI args
if (process.argv.includes("--reminders")) {
    // TODO add CLI arg parser instead of this hack
    const flag_index = process.argv.indexOf("--reminders");
    if (flag_index + 1 >= process.argv.length) {
        always_log("ERROR: reminders file path not specified");
        process.exit(1);
    }
    reminders_file_path = process.argv[flag_index + 1];
}
verbose_log("INFO: reminders file path", reminders_file_path);

export async function readReminders(): Promise<String> {
    // if the file doesn't exist, treat that as NO reminders
    const file_exists = await fs
        .access(reminders_file_path, fs.constants.F_OK)
        .then(() => true) // if does exist, set to true
        .catch(() => false); // error callback only invoked if does not exist
    if (!file_exists) {
        // dont wanna log failures when the file is just not there
        return "";
    }

    try {
        return (await fs.readFile(reminders_file_path, "utf8")) ?? "";
    } catch (error) {
        always_log("WARN: reading reminders failed", error);
        return "";
    }
}
