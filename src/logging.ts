import fs from 'fs';
export let is_verbose = false; 
// check CLI args:
if (process.argv.includes("--verbose")) {
    is_verbose = true;
}

always_log("INFO: starting mcp-server-commands");
if (is_verbose) {
    always_log("INFO: verbose logging enabled");
}

export function verbose_log(message: string, data?: any) {
    if (is_verbose) {
        always_log(message, data);
    }
}

export function always_log(message: string, data?: any) {

    // LOGGING NOTES:
    // https://modelcontextprotocol.io/docs/tools/debugging#implementing-logging
    // * STDIO transport => STDERR captured by host app (i.e. Claude Desktop which writes to ~/Library/Logs/Claude/mcp.log)
    // * Streamable HTTP transport => suggests server side capture (i.e. log file)
    // * and/or log to MCP client regardless of transport
    //   server.sendLoggingMessage({
    //       level: "info",
    //       data: message,
    //   });
    //   // sends a message like:
    //   server.notification({
    //      method: "notifications/message",
    //      params: {
    //          level: "warning",
    //          logger: "mcp-server-commands",
    //          data: "ListToolsRequest2",
    //      },
    //   });

    const isJest = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;
    if (isJest) {
        // * JEST => log to console so I can see in test runner output
        console.log(`${message}${data ? ": " + JSON.stringify(data) : ""}`);
        return;
    }

    // * all transports => server side log file
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}${data ? ": " + JSON.stringify(data) : ""}`;
    const shareDir = process.env.HOME + "/.local/share/mcp-server-commands/";
    const logFile = shareDir + "/commands.log";
    fs.mkdirSync(shareDir, { recursive: true });
    fs.appendFileSync(logFile, logMessage + "\n");
    // TODO any hail mary if this logging fails? just use console.error then?
    //   else still can get seemingly hung tool calls
}
