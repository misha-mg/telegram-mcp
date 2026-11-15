import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { MediaInfo } from "./format.js";

export const DEFAULT_DOWNLOAD_DIR = path.join(homedir(), "Downloads", "Telegram MCP");

export type DownloadConfig = { directory: string };

export function loadDownloadConfig(env: NodeJS.ProcessEnv = process.env): DownloadConfig {
  return { directory: expandHome(env.TELEGRAM_MCP_DOWNLOAD_DIR?.trim() || DEFAULT_DOWNLOAD_DIR) };
}

export function expandHome(dir: string): string {
  if (dir === "~") return homedir();
  if (dir.startsWith("~/")) return path.join(homedir(), dir.slice(2));
  return path.resolve(dir);
}

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

/**
 * File name to save a message's media under. Uses Telegram's own file name when it has one,
 * stripped of any directory parts and characters that are unsafe in a file name.
 */
export function fileNameFor(messageId: string, media: MediaInfo): string {
  const original = media.fileName ? sanitizeFileName(media.fileName) : "";
  if (original) return original;
  const mime = media.mimeType?.split(";")[0].trim().toLowerCase();
  const extension = media.kind === "photo" ? "jpg" : (mime && MIME_EXTENSIONS[mime]) || mime?.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  return `telegram_${media.kind}_${messageId}.${extension}`;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").trim();
  return cleaned.slice(0, 200);
}

/** `dir/name`, or `dir/name (2).ext` etc. when a file with that name already exists. Never overwrites. */
export async function uniquePath(dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 1; ; i += 1) {
    const candidate = path.join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
