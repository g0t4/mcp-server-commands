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
                // ?? add prompts for various LLMs that tailor instructions to make them optimize use of run_process tool
                //  idea is, users could insert those manually, or perhaps automatically if necessary, depending on context
                //  that way you don't need one prompt for everything and certain models won't need any help (i.e. Claude) vs
                //  llama4 which struggled with old run_script tool (now just stdin on run_process) so it might need some
                //  special instructions and yeah... I think that's a use case for these prompts
                //  /prompt llama4 ?
                {
                    name: "run_process",
                    description:
                        "Include command output in the prompt. " +
                        "This is effectively a user tool call.",
                    arguments: [
                        { name: "mode", },
                        { name: "command_line", },
                        { name: "argv", },
                        { name: "dry_run", },
                        // ? other args?
                    ],
                },
            ],
        };
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        // if (request.params.name == "examples") {
        //     return GetExamplePromptMessages();
        // } else
        if (request.params.name !== "run_process") {
            throw new Error(
                "Unknown or not implemented prompt: " + request.params.name
            );
        }
        verbose_log("INFO: PromptRequest", request);
        throw new Error("run_process not yet ported to prompts");

        const command_line = String(request.params.arguments?.command_line);
        const argv = String(request.params.arguments?.argv);
        const mode = String(request.params.arguments?.mode);
        const dry_run = Boolean(request.params.arguments?.dry_run);
        // Is it possible/feasible to pass a path for the workdir when running the command?
        // - currently it uses / (yikez)
        // - IMO makes more sense to have it be based on the Zed workdir of each project
        // - Fallback could be to configure on server level (i.e. home dir of current user) - perhaps CLI arg? (thinking of zed's context_servers config section)

        // TODO RUN_PROCESS MIGRATION - finish rest of migrtation to run_process
        const { stdout, stderr } = await execAsync(command_line);
        // TODO gracefully handle errors and turn them into a prompt message that can be used by LLM to troubleshoot the issue, currently errors result in nothing inserted into the prompt and instead it shows the Zed's chat panel as a failure

        const messages: PromptMessage[] = [
            {
                role: "user",
                content: {
                    type: "text",
                    text:
                        "I ran the following command, if there is any output it will be shown below:\n" +
                        command_line,
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
function GetExamplePromptMessages(): PromptMessage[] {
    throw new Error("Function not implemented.");
}
