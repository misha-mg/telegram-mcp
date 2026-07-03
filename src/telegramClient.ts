import { TelegramClient } from "telegram";
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

export function resetTelegramClientForTests(): void {
  clientPromise = undefined;
}
