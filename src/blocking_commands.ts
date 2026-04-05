/**
 * Determines whether a requested process should be blocked.
 * Currently blocks recursive "ls -R" commands which can scan large
 * directories such as node_modules.
 */
import { RunProcessArgsHelper } from "./run_process.js";

export function getBlockingMessage(args: RunProcessArgsHelper): string | null {
    // Block dangerous commands (e.g., recursive ls that traverses node_modules)
    // The check is intentionally simple: if the command is "ls" and the
    // arguments include "-R", we refuse to run it. This avoids costly scans.
    const isRecursiveLs = (() => {
        // Helper to detect a recursive "ls" command anywhere in the arguments.
        const hasLs = (tokens: string[]) => tokens.includes("ls");
        const hasRecursiveFlag = (tokens: string[]) => tokens.some((p) => p.includes("-R"));

        if (args.isShellMode) {
            const parts = String(args.commandLine).trim().split(/\s+/);
            return hasLs(parts) && hasRecursiveFlag(parts);
        }
        if (args.isExecutableMode) {
            const argv = args.argv ?? [];
            return hasLs(argv) && hasRecursiveFlag(argv);
        }
        return false;
    })();

    if (isRecursiveLs) {
        return "Command blocked: recursive ls is disallowed because it may scan node_modules.";
    }
    return null;
}
