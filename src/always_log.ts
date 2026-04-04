import fs from 'fs';
// export let is_verbose = false; 
export let is_verbose = true;  // override in testing to force verbose
// check CLI args:
if (process.argv.includes("--verbose")) {
    is_verbose = true;
}

always_log("INFO: starting mcp-server-commands");
if (is_verbose) {
    always_log("INFO: verbose logging enabled");
}

export function verbose_log(message: string, data?: any) {
    // https://modelcontextprotocol.io/docs/tools/debugging - mentions various ways to debug/troubleshoot (including dev tools)
    //
    // remember STDIO transport means can't log over STDOUT (client expects JSON messages per the spec)
    // https://modelcontextprotocol.io/docs/tools/debugging#implementing-logging
    //   mentions STDERR is captured by the host app (i.e. Claude Desktop app)
    //   server.sendLoggingMessage is captured by MCP client (not Claude Desktop app)
    //   * SO, IIUC use STDERR for logging into Claude Desktop app logs in:
    //      '~/Library/Logs/Claude/mcp.log'
    if (is_verbose) {
        always_log(message, data);
    }
    // inspector, catches these logs and shows them on left hand side of screen (sidebar)

    // IF I wanted to log via MCP client logs (not sure what those are/do):
    //  I do not see inspector catching these logs :(, there is a server notifications section and it remains empty
    //server.sendLoggingMessage({
    //    level: "info",
    //    data: message,
    //});
    // which results in something like:
    //server.notification({
    //    method: "notifications/message",
    //    params: {
    //        level: "warning",
    //        logger: "mcp-server-commands",
    //        data: "ListToolsRequest2",
    //    },
    //});
    //
    // FYI client should also requets a log level from the server, so that needs to be here at some point too
}

export function always_log(message: string, data?: any) {
    const isJest = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
    if (isJest) {
        console.log(`${message}${data ? ": " + JSON.stringify(data) : ""}`);
        return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}${data ? ": " + JSON.stringify(data) : ""}`;
    const shareDir = process.env.HOME + "/.local/share/mcp-server-commands/";
    const logFile = shareDir + "/commands.log";
    fs.mkdirSync(shareDir, { recursive: true });
    fs.appendFileSync(logFile, logMessage + "\n");
    // TODO any hail mary if this logging fails? just use console.error then?
    //   else still can get seemingly hung tool calls
}
