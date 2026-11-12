import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** Package root (parent of src/ or dist/), so MCP clients can launch the server from any working directory. */
export const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

// quiet: stdout is the MCP stdio channel, so dotenv must not log there.
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(PACKAGE_ROOT, ".env"), quiet: true });

/** Relative session paths are resolved against the package root, not the process working directory. */
export function resolveSessionPath(sessionPath: string): string {
  return path.resolve(PACKAGE_ROOT, sessionPath);
}

export type TelegramMcpConfig = {
  apiId?: number;
  apiHash?: string;
  session?: string;
  sessionPath: string;
  sendEnabled: boolean;
  draftsEnabled?: boolean;
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
    draftsEnabled: process.env.TELEGRAM_MCP_ENABLE_DRAFTS === "true",
  };
}

export function getConfigStatus(config = loadConfig()) {
  return {
    hasApiId: typeof config.apiId === "number",
    hasApiHash: Boolean(config.apiHash),
    hasSessionEnv: Boolean(config.session),
    sessionPath: config.sessionPath,
    sendEnabled: config.sendEnabled,
    draftsEnabled: Boolean(config.draftsEnabled),
  };
}

export async function loadSession(config = loadConfig()): Promise<string> {
  if (config.session) {
    return config.session.trim();
  }

  try {
    return (await readFile(resolveSessionPath(config.sessionPath), "utf8")).trim();
  } catch {
    return "";
  }
}

export async function saveSession(session: string, config = loadConfig()): Promise<void> {
  const target = resolveSessionPath(config.sessionPath);
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
