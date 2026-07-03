type UnknownRecord = Record<string, unknown>;

export function toSafeJson(value: unknown): string {
  return JSON.stringify(value, bigIntReplacer, 2);
}

function bigIntReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

export function serializeDialog(dialog: UnknownRecord) {
  const entity = (dialog.entity ?? {}) as UnknownRecord;

  return {
    id: stringifyId(entity.id ?? dialog.id),
    name: dialog.name ?? entity.title ?? entity.username ?? entity.firstName ?? "Unknown",
    isChannel: Boolean(entity.broadcast),
    isGroup: Boolean(entity.megagroup || entity.gigagroup),
    unreadCount: dialog.unreadCount ?? 0,
    username: entity.username ?? null,
  };
}

export function serializeMessage(message: UnknownRecord) {
  return {
    id: stringifyId(message.id),
    date: formatTelegramDate(message.date),
    senderId: stringifyId(message.senderId),
    text: message.message ?? message.text ?? "",
  };
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
