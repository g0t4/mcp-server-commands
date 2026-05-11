#!/usr/bin/env node

import os from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createRequire } from "module";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";
import { readFileSync } from "node:fs";

const {
    name: packageName,
    version: packageVersion,
} = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

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
registerTools(server);
registerPrompts(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
