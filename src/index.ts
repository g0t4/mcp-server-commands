#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
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
            //prompts: {},
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
server.setRequestHandler(CallToolRequestSchema, async (request) : Promise<{ toolResult: CallToolResult }> => {
    switch (request.params.name) {
        case "run_command": {
            const command = String(request.params.arguments?.command);
            if (!command) {
                throw new Error("Command is required");
            }
            const { stdout, stderr } = await execAsync(command);
            return {
                toolResult: {
                    content: [
                        {
                            type: "text",
                            text: stdout,
                        },
                        {
                            type: "text",
                            text: stderr,
                        },
                    ],
                },
            };
        }
        default:
            throw new Error("Unknown tool");
    }
});

///**
// * Handler that lists available prompts.
// * Exposes a single "summarize_notes" prompt that summarizes all notes.
// */
//server.setRequestHandler(ListPromptsRequestSchema, async () => {
//  return {
//    prompts: [
//      {
//        name: "summarize_notes",
//        description: "Summarize all notes",
//      }
//    ]
//  };
//});

///**
// * Handler for the summarize_notes prompt.
// * Returns a prompt that requests summarization of all notes, with the notes' contents embedded as resources.
// */
//server.setRequestHandler(GetPromptRequestSchema, async (request) => {
//  if (request.params.name !== "summarize_notes") {
//    throw new Error("Unknown prompt");
//  }
//
//  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
//    type: "resource" as const,
//    resource: {
//      uri: `note:///${id}`,
//      mimeType: "text/plain",
//      text: note.content
//    }
//  }));
//
//  return {
//    messages: [
//      {
//        role: "user",
//        content: {
//          type: "text",
//          text: "Please summarize the following notes:"
//        }
//      },
//      ...embeddedNotes.map(note => ({
//        role: "user" as const,
//        content: note
//      })),
//      {
//        role: "user",
//        content: {
//          type: "text",
//          text: "Provide a concise summary of all the notes above."
//        }
//      }
//    ]
//  };
//});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
