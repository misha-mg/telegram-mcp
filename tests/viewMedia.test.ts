import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMediaProcessor, type MediaProcessor } from "../src/media.js";
import { createTelegramToolHandlers, type TelegramClientLike } from "../src/toolHandlers.js";
import { parseToolJson } from "./helpers.js";

const photo = { id: 1, date: 1700000000, message: "screen", media: { photo: {} } };
const video = {
  id: 2,
  date: 1700000000,
  message: "",
  media: {
    document: {
      mimeType: "video/mp4",
      size: 1000,
      attributes: [{ className: "DocumentAttributeVideo", duration: 8 }],
    },
  },
};
const voice = {
  id: 3,
  date: 1700000000,
  message: "",
  media: { document: { mimeType: "audio/ogg", attributes: [{ className: "DocumentAttributeAudio", voice: true }] } },
};

function setup(processor: MediaProcessor, maxVideoBytes = 50 * 1024 * 1024, messages: unknown[] = [photo, video, voice]) {
  const client: TelegramClientLike = {
    checkAuthorization: vi.fn().mockResolvedValue(true),
    getDialogs: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue(messages),
    getInputEntity: vi.fn(async (peer: string) => ({ resolved: peer })),
    sendMessage: vi.fn(),
    saveDraft: vi.fn(),
    downloadMedia: vi.fn().mockResolvedValue(Buffer.from("bytes")),
    downloadThumbnail: vi.fn().mockResolvedValue(Buffer.from("thumb")),
    downloadMediaToFile: vi.fn().mockResolvedValue(0),
  };
  const handlers = createTelegramToolHandlers({
    loadConfig: () => ({ sessionPath: "s", sendEnabled: false }),
    loadSession: async () => "session",
    getTelegramClient: async () => client,
    getMediaProcessor: () => ({ processor, maxVideoBytes }),
  });
  return { client, handlers };
}

const fakeProcessor: MediaProcessor = {
  toImage: vi.fn(async () => ({ data: Buffer.from("img"), mimeType: "image/jpeg" })),
  videoFrames: vi.fn(async (_d, _e, duration, count) =>
    Array.from({ length: count }, (_, i) => ({ data: Buffer.from(`f${i}`), mimeType: "image/jpeg", atSeconds: ((duration ?? 0) * (i + 0.5)) / count })),
  ),
};

describe("telegram_view_media", () => {
  it("returns photos as images, videos as frames, and explains unsupported media", async () => {
    const { handlers } = setup(fakeProcessor);
    const result = await handlers.telegramViewMedia({ peer: "Mom", messageIds: [1, 2, 3, 9], framesPerVideo: 2 });

    const summary = parseToolJson(result);
    expect(summary.items).toMatchObject([
      { id: "1", kind: "photo", caption: "screen", images: 1 },
      { id: "2", kind: "video", durationSeconds: 8, images: 2 },
      { id: "3", kind: "voice", error: expect.stringContaining("No photo or video") },
      { id: "9", error: "Message not found." },
    ]);
    const images = result.content.filter((block) => block.type === "image");
    expect(images).toHaveLength(3);
    expect(images[0]).toEqual({ type: "image", data: Buffer.from("img").toString("base64"), mimeType: "image/jpeg" });
  });

  it("shows only the thumbnail of a video over the size limit", async () => {
    const { client, handlers } = setup(fakeProcessor, 500, [video]);
    const result = await handlers.telegramViewMedia({ peer: "Mom", messageIds: [2] });

    expect(parseToolJson(result).items[0]).toMatchObject({ thumbnailOnly: true, images: 1 });
    expect(client.downloadThumbnail).toHaveBeenCalledOnce();
    expect(client.downloadMedia).not.toHaveBeenCalled();
  });
});

let hasFfmpeg = true;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  hasFfmpeg = false;
}

describe.skipIf(!hasFfmpeg)("media processor (real ffmpeg)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "telegram-mcp-test-"));
  const processor = createMediaProcessor({ ffmpegBin: "ffmpeg", maxVideoBytes: 1e9 });

  it("downscales a large image to a JPEG", async () => {
    const file = path.join(dir, "big.png");
    execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=3000x2000", "-frames:v", "1", file]);
    const image = await processor.toImage(readFileSync(file), "png");
    expect(image.mimeType).toBe("image/jpeg");
    expect(image.data.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("extracts evenly spaced frames from a video", async () => {
    const file = path.join(dir, "clip.mp4");
    execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:duration=4", "-pix_fmt", "yuv420p", file]);
    const frames = await processor.videoFrames(readFileSync(file), "mp4", 4, 3);
    expect(frames.map((frame) => frame.atSeconds)).toEqual([0.7, 2, 3.3]);
    expect(frames.every((frame) => frame.data.length > 0)).toBe(true);
  });
});
