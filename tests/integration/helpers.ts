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

function getFirstText(result: CallToolResult) {
    // TODO throw if none? more than 1?
    const first = result.content[0] as TextContent;
    return (first.text as string).trim();
}

export { getStdoutText, getStderrText, getFirstText };
