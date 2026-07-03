import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type TelegramMcpConfig = {
  apiId?: number;
  apiHash?: string;
  session?: string;
  sessionPath: string;
  sendEnabled: boolean;
};

const DEFAULT_SESSION_PATH = ".local/telegram.session";

export function loadConfig(): TelegramMcpConfig {
  const apiIdRaw = process.env.TELEGRAM_API_ID;
  const apiId = apiIdRaw ? Number(apiIdRaw) : undefined;

  return {
    apiId: Number.isFinite(apiId) ? apiId : undefined,
    apiHash: process.env.TELEGRAM_API_HASH,
    session: process.env.TELEGRAM_SESSION,
    sessionPath: process.env.TELEGRAM_SESSION_PATH || DEFAULT_SESSION_PATH,
    sendEnabled: process.env.TELEGRAM_MCP_ENABLE_SEND === "true",
  };
}

export function getConfigStatus(config = loadConfig()) {
  return {
    hasApiId: typeof config.apiId === "number",
    hasApiHash: Boolean(config.apiHash),
    hasSessionEnv: Boolean(config.session),
    sessionPath: config.sessionPath,
    sendEnabled: config.sendEnabled,
  };
}

export async function loadSession(config = loadConfig()): Promise<string> {
  if (config.session) {
    return config.session.trim();
  }

  try {
    return (await readFile(config.sessionPath, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function saveSession(session: string, config = loadConfig()): Promise<void> {
  const target = path.resolve(config.sessionPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${session.trim()}\n`, { mode: 0o600 });
}

export function assertTelegramConfig(config = loadConfig()): asserts config is TelegramMcpConfig & {
  apiId: number;
  apiHash: string;
} {
  if (!config.apiId || !config.apiHash) {
    throw new Error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH.");
  }
}
