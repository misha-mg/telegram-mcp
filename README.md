# Telegram MCP

Local MCP server for controlled Telegram access through GramJS and MTProto.

This project exposes a small, safety-focused set of Telegram tools to MCP clients such as Codex, Claude Desktop, Cursor, and other Model Context Protocol hosts.

## Safety Defaults

- Read tools are available after login.
- Sending is disabled by default.
- `telegram_send_message` requires both `TELEGRAM_MCP_ENABLE_SEND=true` and `confirm: "SEND"`.
- No background polling, bulk send loop, or outreach automation is included.

## Setup

```bash
cd telegram-mcp
npm install
cp .env.example .env
```

Fill `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from `https://my.telegram.org/apps`.

## Login

The MCP server cannot prompt interactively over stdio, so create a GramJS session first:

```bash
npm run login
```

The login helper saves a session string to `TELEGRAM_SESSION_PATH`, defaulting to `.local/telegram.session`.

If login codes are not arriving, use QR login instead:

```bash
npm run login:qr
```

Then scan the terminal QR code from Telegram mobile: **Settings -> Devices -> Link Desktop Device**.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

The test suite uses mocked Telegram clients for unit coverage and an MCP stdio smoke test that does not require Telegram credentials.

## MCP Client Config

Example stdio config:

```json
{
  "mcpServers": {
    "telegram-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/telegram-mcp/dist/server.js"],
      "env": {
        "TELEGRAM_API_ID": "123456",
        "TELEGRAM_API_HASH": "replace_with_api_hash",
        "TELEGRAM_SESSION_PATH": "/absolute/path/to/telegram-mcp/.local/telegram.session",
        "TELEGRAM_MCP_ENABLE_SEND": "false"
      }
    }
  }
}
```

## Tools

- `telegram_status`: reports safe configuration/auth status.
- `telegram_list_dialogs`: lists recent dialogs.
- `telegram_read_messages`: reads recent messages from a peer.
- `telegram_search_messages`: searches messages in a peer.
- `telegram_send_message`: sends one message only when explicitly enabled.

## Documentation

- [PRD](docs/product/telegram-mcp-server-prd.md)
- [Setup Guide](docs/setup.md)
- [Tool Reference](docs/tools.md)
- [Security Notes](docs/security.md)
