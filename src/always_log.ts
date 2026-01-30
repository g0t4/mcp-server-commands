let verbose = false;
// check CLI args:
if (process.argv.includes("--verbose")) {
    verbose = true;
}

if (verbose) {
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
    if (verbose) {
        always_log(message, data);
    }
    // inspector, catches these logs and shows them on left hand side of screen (sidebar)

    // TODO add verbose parameter (CLI arg?)

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
        return;
    }
    if (data) {
        console.error(message + ": " + JSON.stringify(data));
    } else {
        console.error(message);
    }
}

