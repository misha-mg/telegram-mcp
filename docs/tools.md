# Tool Reference

## `telegram_status`

Reports configuration and authorization status without exposing secrets.

Inputs: none.

## `telegram_list_dialogs`

Lists recent dialogs for the authenticated Telegram account.

Inputs:

- `limit`: integer from 1 to 50, default 20.

## `telegram_read_messages`

Reads recent messages from a peer.

Inputs:

- `peer`: Telegram peer, such as `me`, `@username`, channel username, phone, or another GramJS-resolvable peer.
- `limit`: integer from 1 to 100, default 20.

## `telegram_search_messages`

Searches recent messages in a peer.

Inputs:

- `peer`: Telegram peer.
- `query`: search text.
- `limit`: integer from 1 to 100, default 20.

## `telegram_send_message`

Sends exactly one Telegram message.

Inputs:

- `peer`: Telegram peer.
- `message`: message text, max 4096 characters.
- `confirm`: must be exactly `SEND`.

Safety gates:

- `TELEGRAM_MCP_ENABLE_SEND` must be exactly `true`.
- `confirm` must be exactly `SEND`.

If either gate is missing, the tool returns a blocked result before opening Telegram send behavior.
