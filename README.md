# actionbridge

Zapier exposed actions as MCP tools, talking to the documented
Zapier exposed-actions (NLA) API. actionbridge is a clean-room
generic action-runner core, under a new name: fresh code, no copied
branding.

**Special case, stated plainly:** Zapier's surface is thousands of
per-app actions behind a hosted per-user MCP endpoint; per-app
action parity is NOT enumerable and is NOT claimed. actionbridge
is a generic runner over whatever actions the key's account has
exposed. It does not reproduce Zapier's hosted MCP endpoint, its
per-user URL/key embedding, or any specific app's action catalogue.

## Tools (generic runner core, 8)

`list_actions`, `search_actions`, `get_action`, `execute_action`,
`list_action_apps`, `describe_action_inputs`,
`validate_action_params`, `get_execution_result`.

Not included, by design: every specific app's action catalogue
(not enumerable), Zap/Zaps management, folders, Zap history UI
surfaces, app connections admin, and the hosted MCP endpoint
itself.

## Setup

Create a Zapier API key for the exposed-actions API and set it:

```bash
export ZAPIER_API_KEY=...
```

Optionally override the API base with `ZAPIER_API_BASE_URL`
(default `https://nla.zapier.com/api/v1`). Without the key, every
tool call fails with an error naming the missing variable.

## CLI

```bash
npx @reneturcios/actionbridge list_actions
npx @reneturcios/actionbridge execute_action '{"action_id":"123","instructions":"Send it"}'
npx @reneturcios/actionbridge mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "actionbridge": {
      "command": "npx",
      "args": ["-y", "@reneturcios/actionbridge", "mcp"],
      "env": { "ZAPIER_API_KEY": "..." }
    }
  }
}
```

## Docker

```bash
docker run -i -e ZAPIER_API_KEY ghcr.io/cloudcorprecords/actionbridge
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
