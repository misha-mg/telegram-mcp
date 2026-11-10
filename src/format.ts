type UnknownRecord = Record<string, unknown>;

export function toSafeJson(value: unknown): string {
  return JSON.stringify(value, bigIntReplacer, 2);
}

function bigIntReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

export function serializeDialog(dialog: UnknownRecord) {
  const entity = (dialog.entity ?? {}) as UnknownRecord;
  const id = stringifyId(entity.id ?? dialog.id);

  return {
    // Marked peer id (e.g. -100... for channels/supergroups). Pass this as `peer` to other tools.
    peer: stringifyId(dialog.id) ?? id,
    id,
    name: dialog.name ?? entity.title ?? entity.username ?? entity.firstName ?? "Unknown",
    isChannel: Boolean(entity.broadcast),
    isGroup: Boolean(dialog.isGroup ?? (entity.megagroup || entity.gigagroup)),
    unreadCount: dialog.unreadCount ?? 0,
    username: entity.username ?? null,
  };
}

export function serializeMessage(message: UnknownRecord) {
  const replyTo = (message.replyTo ?? {}) as UnknownRecord;

  return {
    id: stringifyId(message.id),
    date: formatTelegramDate(message.date),
    senderId: stringifyId(message.senderId),
    senderName: senderName(message),
    replyToId: stringifyId(replyTo.replyToMsgId),
    hasMedia: Boolean(message.media),
    text: message.message ?? message.text ?? "",
  };
}

function senderName(message: UnknownRecord): string | null {
  const sender = (message.sender ?? message._sender) as UnknownRecord | undefined;
  if (!sender) {
    return null;
  }
  const fullName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");
  const name = fullName || sender.title || sender.username;
  return name ? String(name) : null;
}

function stringifyId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function formatTelegramDate(value: unknown): string | null {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}
