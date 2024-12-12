import { promises as fs } from "node:fs";
import { always_log, verbose_log } from "./logs.js";

// TODO add configurable path to this file (will fix pathing issues too)
// FYI pathing is to workaround no support for a cwd in claude_desktop_config.json (yet?)
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let reminders_file_path = __dirname + "/reminders.txt";

const requestedReminders = process.argv.includes("--reminders");
// check for --reminders PATH in CLI args
if (requestedReminders) {
    // TODO add CLI arg parser instead of this hack
    const flag_index = process.argv.indexOf("--reminders");
    if (flag_index + 1 >= process.argv.length) {
        always_log("ERROR: reminders file path not specified");
        process.exit(1);
    }
    reminders_file_path = process.argv[flag_index + 1];
    // need absolute path:
    reminders_file_path = resolve(process.cwd(), reminders_file_path);
}
verbose_log("INFO: reminders file path", reminders_file_path);

export async function readReminders(): Promise<String> {
    // TODO only pass back reminders file if requested?
    let file_reminder =
        "Here is the reminders file if you want to add to it: " +
        reminders_file_path;
    // if the file doesn't exist, treat that as NO reminders
    const file_exists = await fs
        .access(reminders_file_path, fs.constants.F_OK)
        .then(() => true) // if does exist, set to true
        .catch(() => false); // error callback only invoked if does not exist
    if (!file_exists) {
        // dont wanna log failures when the file is just not there
        return file_reminder;
    }

    try {
        const reminders =
            (await fs.readFile(reminders_file_path, "utf8")) ?? "";
        return reminders + "\n" + file_reminder;
    } catch (error) {
        always_log("WARN: reading reminders failed", error);
        return file_reminder;
    }
}
