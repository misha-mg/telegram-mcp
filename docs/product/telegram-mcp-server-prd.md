# Telegram MCP Server PRD

## Objective

Build a local MCP server that lets an MCP-compatible assistant inspect and, when explicitly enabled, send Telegram messages through the user's own Telegram account using GramJS over MTProto.

The server is intended for personal/operator workflows, not bulk outreach automation. Read actions are enabled by default after authentication. Write actions require an explicit environment flag and per-call confirmation.

## Problem

Operators often need a safe, structured way for an agent to inspect Telegram context or perform controlled Telegram actions through an MCP interface.

An MCP server can expose a narrow set of Telegram tools to Codex, Claude Desktop, Cursor, or other MCP clients while keeping authentication and session files local.

## Users

- Primary user: project operator who wants controlled Telegram access from MCP clients.
- Secondary user: developer maintaining the local outreach pipeline.

## Non-Goals

- No mass messaging.
- No contact scraping at scale.
- No automatic Telegram outreach execution.
- No hosted multi-tenant service.
- No replacement for email or CRM systems.
- No browser automation for Telegram Web.

## Success Criteria

- A local MCP server starts over stdio.
- The operator can authenticate once and reuse a saved GramJS session.
- MCP clients can list recent dialogs, read recent messages, and search messages.
- Sending is disabled by default.
- Sending requires `TELEGRAM_MCP_ENABLE_SEND=true` and `confirm: "SEND"` in the tool call.
- Secrets and session files are not committed.
- TypeScript build passes without credentials.

## Risks And Controls

| Risk | Control |
| --- | --- |
| Accidental message sending | Send tool disabled by default; requires env flag and confirmation string. |
| Telegram account restrictions | Keep tools narrow; avoid bulk sending; do not run automated loops. |
| Session leakage | Store session in ignored local file; support env-based session injection. |
| MCP prompt injection | Read tools return plain summaries; write tool requires hard confirmation. |
| Over-broad account access | Implement only minimal tools in MVP. |

## Vertical Slices

### Slice 1: Local TypeScript MCP Shell

Goal: create a server that starts over stdio and exposes a `telegram_status` tool.

Deliverables:
- `package.json`, `tsconfig.json`, build/start scripts.
- MCP server bootstrap with `StdioServerTransport`.
- Status tool that reports credential/session configuration without printing secrets.

Acceptance:
- `npm run build` succeeds without Telegram credentials.
- Server can be launched by an MCP client.

### Slice 2: Authentication And Session Reuse

Goal: connect GramJS with local session persistence.

Deliverables:
- GramJS client factory.
- Session source priority:
  1. `TELEGRAM_SESSION`
  2. `TELEGRAM_SESSION_PATH`
  3. default `.local/telegram.session`
- Login helper script that creates/saves a session string.

Acceptance:
- User can run login once and save a reusable session.
- MCP tools fail with actionable errors when credentials/session are missing.

### Slice 3: Read-Only Telegram Tools

Goal: expose useful read operations safely.

Deliverables:
- `telegram_list_dialogs`
- `telegram_read_messages`
- `telegram_search_messages`

Acceptance:
- Dialogs and messages are returned as compact JSON text.
- Limits are capped to avoid large responses.
- Message output includes IDs, dates, sender IDs when available, and text.

### Slice 4: Controlled Send Tool

Goal: allow explicit one-off sends without enabling automation by default.

Deliverables:
- `telegram_send_message`
- Requires `TELEGRAM_MCP_ENABLE_SEND=true`.
- Requires `confirm: "SEND"`.
- Validates target peer through GramJS before sending.

Acceptance:
- Without env flag, send tool returns a clear blocked result.
- Without confirmation, send tool returns a clear blocked result.
- With both controls and a valid session, it sends exactly one message.

### Slice 5: Operator Docs And Client Config

Goal: make the server easy to run locally.

Deliverables:
- README with setup, login, MCP config example, and safety notes.
- `.env.example`.
- Local `.gitignore`.

Acceptance:
- A developer can configure the server from the docs.
- Session and env files are ignored.

## Implementation Blocks

1. Project scaffold
   - Create `tools/telegram-mcp`.
   - Add TypeScript dependencies and scripts.

2. Telegram config
   - Parse env vars.
   - Resolve session file path.
   - Avoid logging secrets.

3. GramJS adapter
   - Create lazy singleton `TelegramClient`.
   - Connect only when a tool needs Telegram.
   - Save session after successful login helper usage.

4. MCP tools
   - Register tools using Zod schemas.
   - Normalize GramJS responses into small JSON payloads.

5. Safety layer
   - Hard caps for limits.
   - Explicit send gate.
   - No background polling or auto-send loops.

6. Verification
   - TypeScript compile.
   - Help/status commands run without credentials.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_API_ID` | yes for Telegram calls | Numeric API ID from `my.telegram.org`. |
| `TELEGRAM_API_HASH` | yes for Telegram calls | API hash from `my.telegram.org`. |
| `TELEGRAM_SESSION` | optional | GramJS StringSession value. |
| `TELEGRAM_SESSION_PATH` | optional | File path for saved session string. |
| `TELEGRAM_PHONE` | login helper only | Phone number for initial login. |
| `TELEGRAM_PASSWORD` | login helper only | 2FA password if enabled. |
| `TELEGRAM_MCP_ENABLE_SEND` | optional | Must be `true` to allow sends. |

## Future Slices

- Append Telegram send attempts to a configurable local audit log.
- Add allowlist for sendable peers.
- Add attachment download with file-size caps.
- Add dialog pinning/folder support.
- Add read-only channel analytics.
- Add tests with mocked GramJS adapter.
