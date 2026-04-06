#!/usr/bin/env fish

# when the request fails, error response has why (at least from my mcp-server-commands server)

set request '{"id":2,"jsonrpc":"2.0","method":"initialize","params":{"clientInfo":{"version":"1.0.0","name":"ExampleClient"},"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":false},"sampling":[]}}}'

set response (echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose)

echo "## FULL RESPONSE"
echo $response
echo

echo
echo "## ERROR MESSAGE EXTRACTED"
echo $response | jq .error.message -r

# * example output:
#
# ## FULL RESPONSE
# {"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"[\n  {\n    \"code\": \"invalid_type\",\n    \"expected\": \"object\",\n    \"received\": \"array\",\n    \"path\": [\n      \"params\",\n      \"capabilities\",\n      \"sampling\"\n    ],\n    \"message\": \"Expected object, received array\"\n  }\n]"}}
#
#
# ## ERROR MESSAGE EXTRACTED
# [
#   {
#     "code": "invalid_type",
#     "expected": "object",
#     "received": "array",
#     "path": [
#       "params",
#       "capabilities",
#       "sampling"
#     ],
#     "message": "Expected object, received array"
#   }
# ]

