import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTelegramToolHandlers, type TelegramClientLike } from "../src/toolHandlers.js";
import { parseToolJson } from "./helpers.js";

function setup(sendEnabled = true) {
  const client: TelegramClientLike = {
    checkAuthorization: vi.fn().mockResolvedValue(true),
    getDialogs: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    getInputEntity: vi.fn(async (peer: string) => ({ resolved: peer })),
    sendMessage: vi.fn(),
    saveDraft: vi.fn(),
    sendFile: vi.fn().mockResolvedValue({ id: 77 }),
    downloadMedia: vi.fn(),
    downloadThumbnail: vi.fn(),
    downloadMediaToFile: vi.fn(),
  };
  const handlers = createTelegramToolHandlers({
    loadConfig: () => ({ sessionPath: "s", sendEnabled }),
    loadSession: async () => "session",
    getTelegramClient: async () => client,
  });
  return { client, handlers };
}

function tempFile(name = "setup.zip", content = "PK\u0003\u0004") {
  const dir = mkdtempSync(path.join(tmpdir(), "tg-send-"));
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return { dir, file };
}

describe("telegram_send_file", () => {
  it("uploads the file with its caption and reports the sent message", async () => {
    const { file } = tempFile();
    const { client, handlers } = setup();

    const result = parseToolJson(await handlers.telegramSendFile({ peer: "me", path: file, caption: "my setup", confirm: "SEND" }));

    expect(result).toEqual({ sent: true, peer: "me", messageId: "77", fileName: "setup.zip", sizeBytes: 4 });
    expect(client.sendFile).toHaveBeenCalledWith({ resolved: "me" }, { file, caption: "my setup", forceDocument: false });
  });

  it("passes asDocument through as forceDocument", async () => {
    const { file } = tempFile("photo.jpg");
    const { client, handlers } = setup();

    await handlers.telegramSendFile({ peer: "me", path: file, asDocument: true, confirm: "SEND" });

    expect(client.sendFile).toHaveBeenCalledWith(expect.anything(), { file, caption: undefined, forceDocument: true });
  });

  it("is blocked unless sending is enabled and confirmed", async () => {
    const { file } = tempFile();

    const disabled = setup(false);
    expect(parseToolJson(await disabled.handlers.telegramSendFile({ peer: "me", path: file, confirm: "SEND" }))).toMatchObject({ blocked: true });

    const unconfirmed = setup();
    expect(parseToolJson(await unconfirmed.handlers.telegramSendFile({ peer: "me", path: file, confirm: "yes" }))).toMatchObject({ blocked: true });

    expect(disabled.client.sendFile).not.toHaveBeenCalled();
    expect(unconfirmed.client.sendFile).not.toHaveBeenCalled();
  });

  it("refuses missing files, folders and empty files without connecting", async () => {
    const { dir } = tempFile();
    const empty = tempFile("empty.txt", "").file;
    mkdirSync(path.join(dir, "folder"));
    const { client, handlers } = setup();

    const missing = parseToolJson(await handlers.telegramSendFile({ peer: "me", path: path.join(dir, "nope.zip"), confirm: "SEND" }));
    const folder = parseToolJson(await handlers.telegramSendFile({ peer: "me", path: path.join(dir, "folder"), confirm: "SEND" }));
    const zero = parseToolJson(await handlers.telegramSendFile({ peer: "me", path: empty, confirm: "SEND" }));

    expect(missing).toMatchObject({ sent: false, error: "File not found." });
    expect(folder).toMatchObject({ sent: false, error: "Not a regular file." });
    expect(zero).toMatchObject({ sent: false, error: "File is empty." });
    expect(client.sendFile).not.toHaveBeenCalled();
  });
});
