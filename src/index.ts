#!/usr/bin/env node

import os from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createRequire } from "module";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Parse the optional `--workdir PATH` CLI argument so a client can point the
 * server at a default working directory for tool calls that don't specify one.
 * Supports both `--workdir PATH` and `--workdir=PATH`.
 */
function getDefaultWorkdir(): string | undefined {
    const argv = process.argv;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--workdir") {
            return argv[i + 1];
        }
        if (arg.startsWith("--workdir=")) {
            return arg.slice("--workdir=".length);
        }
    }
    return undefined;
}

/**
 * Resolve the bash interpreter to use for `run_bash`. Precedence:
 * `--bash PATH` CLI arg, then `MCP_SERVER_COMMANDS_BASH` env var, then `bash`
 * on PATH. Returns undefined if the resolved bash isn't usable.
 */
function resolveBashPath(): string | undefined {
    const argv = process.argv;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--bash") {
            return argv[i + 1];
        }
        if (argv[i].startsWith("--bash=")) {
            return argv[i].slice("--bash=".length);
        }
    }
    return process.env.MCP_SERVER_COMMANDS_BASH ?? "bash";
}

/** Returns an error message if bash can't be run, else null. */
function bashError(bashPath: string): string | null {
    try {
        const result = spawnSync(bashPath, ["--version"], { stdio: "ignore" });
        if (result.status === 0) return null;
        return `bash exited with status ${result.status}`;
    } catch (error) {
        return `could not run bash: ${String(error)}`;
    }
}

const {
    name: packageName,
    version: packageVersion,
} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

const defaultWorkdir = getDefaultWorkdir();
const bashPath = resolveBashPath();

if (bashPath) {
    const problem = bashError(bashPath);
    if (problem) {
        console.error(
            `run_bash requires bash, but "${bashPath}" is not usable (${problem}).\n` +
            `Provide the path to bash via the --bash PATH argument or the MCP_SERVER_COMMANDS_BASH env var, then restart the server.`
        );
        process.exit(1);
    }
} else {
    console.error("run_bash requires bash, but no bash path was configured.");
    process.exit(1);
}

const server = new Server(
    {
        name: packageName,
        version: packageVersion,
        description: "Run commands on this " + os.platform() + " machine",
    },
    {
        capabilities: {
            //resources: {},
            tools: {},
            prompts: {},
            //logging: {}, // for logging messages that don't seem to work yet or I am doing them wrong
        },
    }
);
registerTools(server, defaultWorkdir, bashPath);
registerPrompts(server);
import { verbose_log } from "./logging.js";

verbose_log("INFO: workdir=" + (defaultWorkdir ?? process.cwd()));

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
