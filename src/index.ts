#!/usr/bin/env node

import os from "os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runCommand } from "./run-command.js";

import { createRequire } from "module";
import { verbose_log } from "./always_log.js";
import { registerPrompts } from "./prompts.js";
import { reisterTools } from "./tools.js";
const require = createRequire(import.meta.url);
const {
    name: package_name,
    version: package_version,
} = require("../package.json");

const server = new Server(
    {
        name: package_name,
        version: package_version,
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

reisterTools(server);

registerPrompts(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
