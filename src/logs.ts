let verbose = false;
// check CLI args:
if (process.argv.includes("--verbose")) {
    verbose = true;
}

if (verbose) {
    always_log("INFO: verbose logging enabled");
} else {
    always_log("INFO: verbose logging disabled, enable it with --verbose");
}

export function always_log(message: string, data?: any) {
    if (data !== undefined) {
        // I want false to hit this branch
        console.error(message + ": " + JSON.stringify(data));
    } else {
        console.error(message);
    }
}

// TODO extract server module so I can import it above and use it to send logs once I can figure out how to do notification based logging (if that is supposed to be a thing)
// OR flip things around and have a module init that takes a server arg toinit this module and then use that static logger instance in always_log/verbose_log
// OR see how others approach this

export function verbose_log(message: string, data?: any) {
    // https://modelcontextprotocol.io/docs/tools/debugging - mentions various ways to debug/troubleshoot (including dev tools)
    //
    // remember STDIO transport means can't log over STDOUT (client expects JSON messages per the spec)
    // https://modelcontextprotocol.io/docs/tools/debugging#implementing-logging
    //   mentions STDERR is captured by the host app (i.e. Claude Desktop app)
    //   server.sendLoggingMessage is captured by MCP client (not Claude Desktop app)
    //   SO, IIUC use STDERR for logging into Claude Desktop app logs in:
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
