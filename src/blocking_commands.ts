/**
 * Determines whether a requested process should be blocked.
 * Currently blocks recursive "ls -R" commands which can scan large
 * directories such as node_modules.
 */
import { RunBashArgsHelper } from "./run_bash.js";

export function getBlockingMessage(args: RunBashArgsHelper): string | null {
    // TODO need a command parser so I am not blocking anything that has "\sls\s" and "\s-R\s" basically

    const isRecursiveLs = (() => {

        // const hasLs = (tokens: string[]) => tokens.includes("ls");
        // const hasRecursiveFlag = (tokens: string[]) => tokens.some((p) => p.includes("-R"));

        if (args.isShellMode) {
            // strip whitespace so that `ls   -R` is blocked just like `ls -R`
            const parts = String(args.commandLine).trim().split(/\s+/);
            const joined = parts.join(" ");
            return joined == "ls -R" || joined == "bash -lc ls -R";
        }
        return false;
    })();

    if (isRecursiveLs) {
        return "Command blocked: recursive ls is disallowed because it may scan node_modules.";
    }
    return null;
}
