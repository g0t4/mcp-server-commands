#!/usr/bin/env fish
set call '{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "query_docs_filesystem_docs_by_lang_chain", "arguments": {  "command": "head -200 /oss/python/deepagents/cli/mcp-tools.mdx"  } } }'

curl --include \
    --request POST \
    --header "Content-Type: application/json" \
    --header "Accept: application/json, text/event-stream" \
    --data "$call" \
    --url https://docs.langchain.com/mcp

# response headers will mention Content-Type
# and s/b text/event-stream in this example
