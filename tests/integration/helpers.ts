import {
    CallToolResult,
    TextContent,
} from "@modelcontextprotocol/sdk/types.js";

function getStdoutText(result: CallToolResult) {
    const stdout = result.content.find(
        (content) => content.name === "STDOUT"
    ) as TextContent;
    return (stdout.text as string).trim();
}

function getStderrText(result: CallToolResult) {
    const stderr = result.content.find(
        (content) => content.name === "STDERR"
    ) as TextContent;
    return (stderr.text as string).trim();
}

export { getStdoutText, getStderrText };
