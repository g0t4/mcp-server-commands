#!/usr/bin/env fish

set init '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

set call '{ "jsonrpc": "2.0", "id": 2, "method":"tools/call","params":{"name":"fetch","arguments":{"url":"https://manpages.org/ls"}}}'

begin
    echo $init
    echo $call
    sleep 2 # wait for server response else client here disconnects and server never gets to respond
end | uvx --directory ~/repos/github/g0t4/mcp-servers/src/fetch mcp-server-fetch | jq
