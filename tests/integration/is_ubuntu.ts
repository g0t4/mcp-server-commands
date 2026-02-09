import { readFileSync } from "node:fs";

//
// TODO change to isUbuntuGHActionsRunner

function isUbuntu() {
    try {
        const osRelease = readFileSync("/etc/os-release", "utf8");
        return /(^|\n)ID=ubuntu(\n|$)/.test(osRelease);
    } catch {
        return false;
    }
}

const IS_UBUNTU = isUbuntu();

export { IS_UBUNTU };
