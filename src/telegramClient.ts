import { rename, rm, stat, writeFile } from "node:fs/promises";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { TelegramMcpConfig } from "./config.js";
import { assertTelegramConfig, loadConfig, loadSession } from "./config.js";

let clientPromise: Promise<TelegramClient> | undefined;

export async function getTelegramClient(config: TelegramMcpConfig = loadConfig()): Promise<TelegramClient> {
  if (!clientPromise) {
    clientPromise = createTelegramClient(config);
  }

  return clientPromise;
}

async function createTelegramClient(config: TelegramMcpConfig): Promise<TelegramClient> {
  assertTelegramConfig(config);

  const session = await loadSession(config);
  if (!session) {
    throw new Error("Missing Telegram session. Run `npm run login` in tools/telegram-mcp first.");
  }

  const client = new TelegramClient(new StringSession(session), config.apiId, config.apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  const authorized = await client.checkAuthorization();
  if (!authorized) {
    throw new Error("Telegram session is not authorized. Run `npm run login` again.");
  }

  return client;
}

/** Saves `message` as the draft of the given chat. Nothing is sent. */
export async function saveDraft(client: TelegramClient, entity: unknown, message: string): Promise<void> {
  await client.invoke(
    new Api.messages.SaveDraft({
      peer: entity as Api.TypeEntityLike,
      message,
    }),
  );
}

/** Downloads a message's media into memory. Returns undefined when the message has none. */
export async function downloadMessageMedia(client: TelegramClient, message: unknown): Promise<Buffer | undefined> {
  const result = await client.downloadMedia(message as Api.Message, {});
  return Buffer.isBuffer(result) ? result : undefined;
}

/**
 * Streams a message's media straight to `outputFile` (no full copy in memory) and returns the bytes written.
 * Writes to a `.part` file first and renames it, so a failed download never leaves a truncated file behind.
 */
export async function downloadMessageMediaToFile(client: TelegramClient, message: unknown, outputFile: string): Promise<number> {
  const partial = `${outputFile}.part`;
  try {
    const result = await client.downloadMedia(message as Api.Message, { outputFile: partial });
    if (result === undefined) throw new Error("The message has no downloadable media.");
    if (Buffer.isBuffer(result)) await writeFile(partial, result);
    await rename(partial, outputFile);
    return (await stat(outputFile)).size;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Downloads the largest thumbnail of a document (e.g. a video's preview). Undefined when there is none. */
export async function downloadMessageThumbnail(client: TelegramClient, message: unknown): Promise<Buffer | undefined> {
  const document = (message as { media?: { document?: { thumbs?: unknown[] } } }).media?.document;
  const thumbs = document?.thumbs ?? [];
  if (thumbs.length === 0) return undefined;
  const result = await client.downloadMedia(message as Api.Message, { thumb: thumbs.length - 1 });
  return Buffer.isBuffer(result) ? result : undefined;
}

export function resetTelegramClientForTests(): void {
  clientPromise = undefined;
}
