import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileNameFor, sanitizeFileName, uniquePath } from "../src/download.js";
import { serializeMessage } from "../src/format.js";
import { createTelegramToolHandlers, type TelegramClientLike } from "../src/toolHandlers.js";
import { parseToolJson } from "./helpers.js";

const pdf = {
  id: 10,
  date: 1700000000,
  message: "",
  media: {
    document: {
      mimeType: "application/pdf",
      size: 5,
      attributes: [{ className: "DocumentAttributeFilename", fileName: "../Костельна_4.pdf" }],
    },
  },
};
const photo = { id: 11, date: 1700000000, message: "", media: { photo: {} } };
const webpage = { id: 12, date: 1700000000, message: "link", media: { webpage: {} } };

function setup(dir: string, messages: unknown[] = [pdf, photo, webpage]) {
  const client: TelegramClientLike = {
    checkAuthorization: vi.fn().mockResolvedValue(true),
    getDialogs: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue(messages),
    getInputEntity: vi.fn(async (peer: string) => ({ resolved: peer })),
    sendMessage: vi.fn(),
    saveDraft: vi.fn(),
    downloadMedia: vi.fn(),
    downloadThumbnail: vi.fn(),
    downloadMediaToFile: vi.fn(async (_message: unknown, file: string) => {
      writeFileSync(file, "%PDF-");
      return 5;
    }),
  };
  const handlers = createTelegramToolHandlers({
    loadConfig: () => ({ sessionPath: "s", sendEnabled: false }),
    loadSession: async () => "session",
    getTelegramClient: async () => client,
    getDownloadDir: () => dir,
  });
  return { client, handlers };
}

describe("telegram_download_file", () => {
  it("saves documents and photos under safe names and skips media without a file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tg-dl-"));
    const { handlers } = setup(dir);
    const result = parseToolJson(await handlers.telegramDownloadFile({ peer: "Mom", messageIds: [10, 11, 12, 99] }));

    expect(result.directory).toBe(dir);
    expect(result.files).toMatchObject([
      { id: "10", kind: "document", path: path.join(dir, "Костельна_4.pdf"), sizeBytes: 5 },
      { id: "11", kind: "photo", path: path.join(dir, "telegram_photo_11.jpg") },
      { id: "12", error: expect.stringContaining("No downloadable file") },
      { id: "99", error: "Message not found." },
    ]);
    expect(result.files[0].warning).toBeUndefined();
    expect(readFileSync(result.files[0].path, "utf8")).toBe("%PDF-");
  });

  it("never overwrites an existing file and honours an explicit directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tg-dl-"));
    writeFileSync(path.join(dir, "Костельна_4.pdf"), "old");
    const { handlers } = setup("/should/not/be/used", [pdf]);
    const result = parseToolJson(await handlers.telegramDownloadFile({ peer: "Mom", messageIds: [10], directory: dir }));

    expect(result.files[0].path).toBe(path.join(dir, "Костельна_4 (2).pdf"));
    expect(readFileSync(path.join(dir, "Костельна_4.pdf"), "utf8")).toBe("old");
  });

  it("warns when the written size differs from what Telegram reports", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tg-dl-"));
    const { client, handlers } = setup(dir, [pdf]);
    vi.mocked(client.downloadMediaToFile).mockResolvedValue(3);
    const result = parseToolJson(await handlers.telegramDownloadFile({ peer: "Mom", messageIds: [10] }));
    expect(result.files[0].warning).toContain("5 bytes");
  });
});

describe("download helpers", () => {
  it("sanitizes names and falls back to the MIME type", () => {
    expect(sanitizeFileName("a/b\\..\\evil:name?.pdf")).toBe("evil_name_.pdf");
    expect(sanitizeFileName("...hidden")).toBe("hidden");
    expect(fileNameFor("7", { kind: "document", mimeType: "application/pdf", durationSeconds: null, fileName: null })).toBe("telegram_document_7.pdf");
    expect(fileNameFor("8", { kind: "voice", mimeType: "audio/ogg", durationSeconds: 3 })).toBe("telegram_voice_8.ogg");
  });

  it("picks a numbered name when the file exists", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tg-dl-"));
    writeFileSync(path.join(dir, "x.pdf"), "");
    writeFileSync(path.join(dir, "x (2).pdf"), "");
    expect(await uniquePath(dir, "x.pdf")).toBe(path.join(dir, "x (3).pdf"));
  });

  it("exposes fileName and sizeBytes in serialized messages", () => {
    expect(serializeMessage(pdf)).toMatchObject({ mediaKind: "document", fileName: "../Костельна_4.pdf", sizeBytes: 5 });
    expect(serializeMessage(photo)).not.toHaveProperty("fileName");
  });
});
