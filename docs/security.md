# Security Notes

## Secrets

Never commit:

- `.env`
- `.env.*`
- `.local/telegram.session`
- raw `TELEGRAM_SESSION` values
- Telegram login codes
- Telegram two-step passwords

The repository `.gitignore` excludes these by default.

## Telegram Account Safety

This server uses GramJS over MTProto, which means it can operate as the authenticated Telegram account. Keep the exposed tool set narrow and avoid bulk automation.

Recommended defaults:

- Keep `TELEGRAM_MCP_ENABLE_SEND=false`.
- Enable sending only for short controlled sessions.
- Prefer read-only use unless you explicitly need a one-off send.
- Rotate or delete the local session file if a machine is compromised.

## MCP Safety

MCP clients can pass model-generated arguments into tools. This server uses two controls for message sending:

- an environment-level write gate
- a per-call confirmation string

Do not remove these controls unless the server is placed behind stronger approval and allowlist logic.
