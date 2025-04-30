import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    GetPromptRequestSchema,
    ListPromptsRequestSchema,
    PromptMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { verbose_log } from "./always_log.js";

import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
// TODO use .promises? in node api

export function registerPrompts(server: Server) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
        verbose_log("INFO: ListPrompts");
        return {
            prompts: [
                // TODO! add prompts for various LLMs that tailor instructions to make them optimize use of run_command tool
                //  idea is, users could insert those manually, or perhaps automatically if necessary, depending on context
                //  that way you don't need one prompt for everything and certain models won't need any help (i.e. Claude) vs
                //  llama4 which struggled with old run_script tool (now just stdin on run_command) so it might need some
                //  special instructions and yeah... I think that's a use case for these prompts
                //  /prompt llama4 ?
                {
                    name: "examples",
                    description:
                        "Novel examples of run_command tool use to nudge models to the possibilities. " +
                        "Based on assumption that most models understand shell commands/scripts very well.",
                },
                {
                    name: "run_command",
                    description:
                        "Include command output in the prompt. " +
                        "This is effectively a user tool call.",
                    arguments: [
                        {
                            name: "command",
                            required: true,
                        },
                        // if I care to keep the prompt tools then add stdin?
                    ],
                },
            ],
        };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        if (request.params.name !== "run_command") {
            throw new Error("Unknown prompt");
        }
        verbose_log("INFO: PromptRequest", request);

        const command = String(request.params.arguments?.command);
        if (!command) {
            throw new Error("Command is required");
        }
        // Is it possible/feasible to pass a path for the workdir when running the command?
        // - currently it uses / (yikez)
        // - IMO makes more sense to have it be based on the Zed workdir of each project
        // - Fallback could be to configure on server level (i.e. home dir of current user) - perhaps CLI arg? (thinking of zed's context_servers config section)

        const { stdout, stderr } = await execAsync(command);
        // TODO gracefully handle errors and turn them into a prompt message that can be used by LLM to troubleshoot the issue, currently errors result in nothing inserted into the prompt and instead it shows the Zed's chat panel as a failure

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
        if (stdout) {
            messages.push({
                role: "user",
                content: {
                    type: "text",
                    text: "STDOUT:\n" + stdout,
                },
            });
        }
        if (stderr) {
            messages.push({
                role: "user",
                content: {
                    type: "text",
                    text: "STDERR:\n" + stderr,
                },
            });
        }
        verbose_log("INFO: PromptResponse", messages);
        return { messages };
    });
}
