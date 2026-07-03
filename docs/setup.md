# Setup Guide

## Requirements

- Node.js 20 or newer.
- Telegram account.
- Telegram API credentials from `https://my.telegram.org/apps`.
- An MCP-compatible client that can run a stdio server.

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=replace_with_api_hash
TELEGRAM_SESSION_PATH=.local/telegram.session
TELEGRAM_MCP_ENABLE_SEND=false
```

## Login

Create a reusable GramJS session before connecting the server to an MCP host:

```bash
npm run login
```

The helper prompts for phone number and login code. If your account has two-step verification enabled, set `TELEGRAM_PASSWORD` in your shell or `.env` before running the login helper.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

Tests do not require Telegram credentials. Telegram-dependent behavior is covered through mocked GramJS adapters.

## Run

For direct stdio use:

```bash
npm start
```

For development:

```bash
npm run dev
```

## MCP Client Configuration

Use an absolute path to `dist/server.js`:

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
