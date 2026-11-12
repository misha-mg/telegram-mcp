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
    mediaKind: describeMedia(message)?.kind ?? null,
    text: message.message ?? message.text ?? "",
  };
}

export type MediaKind = "voice" | "video_note" | "audio" | "video" | "photo" | "document" | "other";

export type MediaInfo = {
  kind: MediaKind;
  mimeType: string | null;
  durationSeconds: number | null;
  /** Size in bytes of a document (video, file); null for photos. */
  sizeBytes?: number | null;
  /** File name of a document, when Telegram has one. */
  fileName?: string | null;
};

/** Kinds that carry speech and can be passed to telegram_transcribe_voice. */
export const TRANSCRIBABLE_KINDS: ReadonlySet<MediaKind> = new Set(["voice", "video_note", "audio", "video"]);

export function describeMedia(message: UnknownRecord): MediaInfo | null {
  const media = message.media as UnknownRecord | undefined;
  if (!media) {
    return null;
  }

  const document = media.document as UnknownRecord | undefined;
  if (!document) {
    return { kind: media.photo ? "photo" : "other", mimeType: null, durationSeconds: null };
  }

  const mimeType = typeof document.mimeType === "string" ? document.mimeType : null;
  const attributes = Array.isArray(document.attributes) ? (document.attributes as UnknownRecord[]) : [];
  const audio = attributes.find((attribute) => attribute.className === "DocumentAttributeAudio");
  const video = attributes.find((attribute) => attribute.className === "DocumentAttributeVideo");
  const duration = Number((audio ?? video)?.duration);
  const durationSeconds = Number.isFinite(duration) ? duration : null;

  const fileNameAttr = attributes.find((attribute) => attribute.className === "DocumentAttributeFilename");
  const size = Number(document.size);
  const extra = {
    sizeBytes: Number.isFinite(size) ? size : null,
    fileName: typeof fileNameAttr?.fileName === "string" ? fileNameAttr.fileName : null,
  };

  let kind: MediaKind = "document";
  if (audio?.voice) kind = "voice";
  else if (video?.roundMessage) kind = "video_note";
  else if (audio || mimeType?.startsWith("audio/")) kind = "audio";
  else if (video || mimeType?.startsWith("video/")) kind = "video";

  return { kind, mimeType, durationSeconds, ...extra };
}

/** Whether telegram_view_media can show this media: photos, image files, videos, round videos, GIFs. */
export function isViewable(media: MediaInfo): boolean {
  if (media.kind === "photo" || media.kind === "video" || media.kind === "video_note") return true;
  return media.kind === "document" && Boolean(media.mimeType?.startsWith("image/"));
}

/** File extension for an image MIME type or file name, used when handing the bytes to ffmpeg. */
export function imageExtension(media: MediaInfo): string {
  if (media.kind === "photo") return "jpg";
  const fromName = media.fileName?.split(".").pop();
  if (fromName && /^[a-z0-9]{1,5}$/i.test(fromName)) return fromName.toLowerCase();
  const subtype = media.mimeType?.split("/")[1]?.split(";")[0]?.trim().toLowerCase();
  return subtype === "jpeg" ? "jpg" : subtype || "bin";
}

/** File extension for a media MIME type, used when handing the bytes to ffmpeg or an upload API. */
export function extensionForMime(mimeType: string | null): string {
  const map: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return (mimeType && map[mimeType.split(";")[0].trim().toLowerCase()]) || "ogg";
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
