import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertTelegramConfig, loadConfig, loadSession, saveSession } from "../src/config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("config", () => {
  it("loads safe defaults without credentials", () => {
    delete process.env.TELEGRAM_API_ID;
    delete process.env.TELEGRAM_API_HASH;
    delete process.env.TELEGRAM_SESSION;
    delete process.env.TELEGRAM_SESSION_PATH;
    delete process.env.TELEGRAM_MCP_ENABLE_SEND;

    expect(loadConfig()).toEqual({
      apiId: undefined,
      apiHash: undefined,
      session: undefined,
      sessionPath: ".local/telegram.session",
      sendEnabled: false,
    });
  });

  it("parses credentials and enables sending only with exact true", () => {
    process.env.TELEGRAM_API_ID = "12345";
    process.env.TELEGRAM_API_HASH = "hash";
    process.env.TELEGRAM_SESSION = "session";
    process.env.TELEGRAM_SESSION_PATH = "/tmp/session";
    process.env.TELEGRAM_MCP_ENABLE_SEND = "true";

    expect(loadConfig()).toEqual({
      apiId: 12345,
      apiHash: "hash",
      session: "session",
      sessionPath: "/tmp/session",
      sendEnabled: true,
    });

    process.env.TELEGRAM_MCP_ENABLE_SEND = "TRUE";
    expect(loadConfig().sendEnabled).toBe(false);
  });

  it("prefers TELEGRAM_SESSION over session file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "telegram-mcp-"));
    const sessionPath = path.join(dir, "session");
    const config = { session: " env-session ", sessionPath, sendEnabled: false };

    await saveSession("file-session", { ...config, session: undefined });

    await expect(loadSession(config)).resolves.toBe("env-session");
  });

  it("saves session files with trimmed content and owner-only mode", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "telegram-mcp-"));
    const sessionPath = path.join(dir, "nested", "telegram.session");

    await saveSession("  session-value  ", { sessionPath, sendEnabled: false });

    await expect(readFile(sessionPath, "utf8")).resolves.toBe("session-value\n");
    const mode = (await stat(sessionPath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("throws when Telegram credentials are incomplete", () => {
    expect(() => assertTelegramConfig({ sessionPath: "s", sendEnabled: false })).toThrow(
      "Missing TELEGRAM_API_ID or TELEGRAM_API_HASH.",
    );
  });
});
