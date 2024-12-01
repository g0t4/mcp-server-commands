#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    PromptMessage,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const execAsync = promisify(exec);

const server = new Server(
    {
        name: "mcp-server-commands",
        version: "0.1.0",
    },
    {
        capabilities: {
            //resources: {},
            tools: {},
            prompts: {},
        },
    }
);

///**
// * Handler for listing available notes as resources.
// * Each note is exposed as a resource with:
// * - A note:// URI scheme
// * - Plain text MIME type
// * - Human readable name and description (now including the note title)
// */
//server.setRequestHandler(ListResourcesRequestSchema, async () => {
//  return {
//    resources: Object.entries(notes).map(([id, note]) => ({
//      uri: `note:///${id}`,
//      mimeType: "text/plain",
//      name: note.title,
//      description: `A text note: ${note.title}`
//    }))
//  };
//});

///**
// * Handler for reading the contents of a specific note.
// * Takes a note:// URI and returns the note content as plain text.
// */
//server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
//  const url = new URL(request.params.uri);
//  const id = url.pathname.replace(/^\//, '');
//  const note = notes[id];
//
//  if (!note) {
//    throw new Error(`Note ${id} not found`);
//  }
//
//  return {
//    contents: [{
//      uri: request.params.uri,
//      mimeType: "text/plain",
//      text: note.content
//    }]
//  };
//});

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "run_command",
                inputSchema: {
                    type: "object",
                    properties: {
                        command: {
                            type: "string",
                            description: "Command to run",
                        },
                    },
                    required: ["command"],
                },
            },
        ],
    };
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<{ toolResult: CallToolResult }> => {
        switch (request.params.name) {
            case "run_command": {
                const command = String(request.params.arguments?.command);
                if (!command) {
                    throw new Error("Command is required");
                }

                try {
                    const { stdout, stderr } = await execAsync(command);
                    return {
                        toolResult: {
                            isError: false,
                            content: [
                                {
                                    type: "text",
                                    text: stdout,
                                    name: "STDOUT",
                                },
                                {
                                    type: "text",
                                    text: stderr,
                                    name: "STDERR",
                                },
                            ],
                        },
                    };
                } catch (error) {
                    const { message, stdout, stderr } = error as {
                        // todo is there a builtin type I can use instead? ALSO is stdout/stderr ? nullable?
                        message: string;
                        stdout?: string;
                        stderr?: string;
                    };
                    return {
                        toolResult: {
                            isError: true,
                            content: [
                                {
                                    // most of the time this is gonna match stderr, TODO do I want/need both error and stderr?
                                    type: "text",
                                    text: message,
                                    name: "ERROR",
                                },
                                {
                                    type: "text",
                                    text: stderr || "",
                                    name: "STDERR",
                                },
                                {
                                    // keep STDOUT b/c there might be some useful output before the failure
                                    type: "text",
                                    text: stdout || "",
                                    name: "STDOUT",
                                },
                            ],
                        },
                    };
                }
            }
            default:
                throw new Error("Unknown tool");
        }
    }
);

server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: [
            {
                name: "include_command_output",
                description:
                    "Run the command and inline its output into the prompt, essentially allows user to decide what commands to run instead of the AI deciding, the mirror of a tool.",
                arguments: [
                    {
                        name: "command",
                        required: true,
                    },
                ],
            },
        ],
    };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "include_command_output") {
        throw new Error("Unknown prompt");
    }

    const command = String(request.params.arguments?.command);
    if (!command) {
        throw new Error("Command is required");
    }

    const { stdout, stderr } = await execAsync(command);
    // let error bubble up, errors look good in zed /prompts (i.e. command not found)

    const messages: PromptMessage[] = [
        {
            role: "user",
            content: {
                type: "text",
                text:
                    "I ran the following command, if there is any output it will be shown below:\n" +
                    command,
            },
        },
    ];
    if (stdout && stdout.length > 0) {
        messages.push({
            role: "user",
            content: {
                type: "text",
                text: "STDOUT:\n" + stdout,
            },
        });
    }
    if (stderr && stderr.length > 0) {
        messages.push({
            role: "user",
            content: {
                type: "text",
                text: "STDERR:\n" + stderr,
            },
        });
    }
    return { messages };
});

async function main() {
    console.log("Starting server...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
