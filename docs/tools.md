# Tool Reference

## `telegram_status`

Reports configuration and authorization status without exposing secrets.

Inputs: none.

## `telegram_list_dialogs`

Lists recent dialogs for the authenticated Telegram account. Each dialog has a `peer` id (marked, e.g. `-100…` for groups and channels) that the other tools accept.

Inputs:

- `limit`: integer from 1 to 50, default 20.

## `telegram_read_messages`

Reads recent messages from a peer.

Inputs:

- `peer`: the `peer` id from `telegram_list_dialogs`, an exact or unique partial chat name (case-insensitive), `@username`, `me`, or another GramJS-resolvable peer. Ambiguous names return an error listing the matches.
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

## `telegram_save_draft`

Saves text as the draft in a chat's input box, synced to all of the user's devices. Nothing is sent; any existing draft in that chat is replaced.

Inputs:

- `peer`: Telegram peer.
- `message`: draft text, max 4096 characters.

Safety gate: `TELEGRAM_MCP_ENABLE_DRAFTS` must be exactly `true`, otherwise the tool returns a blocked result.

## `telegram_transcribe_voice`

Transcribes voice messages, round video notes, audio files and videos to text. Messages that can be transcribed show `mediaKind` `voice`, `video_note`, `audio` or `video` in `telegram_read_messages` / `telegram_search_messages`.

Inputs:

- `peer`: Telegram peer.
- `messageIds`: 1 to 20 message ids, processed in order.
- `language`: optional ISO-639-1 code (`ru`, `uk`, `en`...) or `auto`.

Returns one entry per id with `text`, or `error` when the message is missing, has no audio, or transcription failed. Returns a blocked result if no backend is configured. Setup: [Voice Transcription](transcription.md).
