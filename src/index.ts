#!/usr/bin/env node

import os from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createRequire } from "module";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";
import { readFileSync } from "node:fs";

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

const {
    name: packageName,
    version: packageVersion,
} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

const defaultWorkdir = getDefaultWorkdir();

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
registerTools(server, defaultWorkdir);
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
