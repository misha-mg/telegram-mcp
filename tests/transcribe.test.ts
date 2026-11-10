import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { describeMedia, extensionForMime } from "../src/format.js";
import {
  createTranscriber,
  loadTranscriptionConfig,
  resolveBackend,
  type RunCommand,
  type TranscriptionConfig,
} from "../src/transcribe.js";

const base: TranscriptionConfig = loadTranscriptionConfig({});

describe("transcription config", () => {
  it("is disabled with an empty environment", () => {
    expect(base).toMatchObject({ language: "auto", whisperBin: "whisper-cli", ffmpegBin: "ffmpeg" });
    expect(resolveBackend(base)).toBeNull();
    expect(createTranscriber(base)).toBeNull();
  });

  it("prefers the local model, honours an explicit backend, and resolves relative model paths", () => {
    const both = loadTranscriptionConfig({ WHISPER_MODEL_PATH: ".local/models/m.bin", OPENAI_API_KEY: "sk-x" });
    expect(resolveBackend(both)).toBe("local");
    expect(path.isAbsolute(both.whisperModelPath!)).toBe(true);
    expect(resolveBackend({ ...both, backend: "openai" })).toBe("openai");
    expect(resolveBackend({ ...base, backend: "local" })).toBeNull();
  });
});

describe("local whisper.cpp backend", () => {
  it("converts with ffmpeg, runs whisper-cli and reads the txt output", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const runCommand: RunCommand = vi.fn(async (file, args) => {
      calls.push({ file, args });
      if (file === "whisper-cli") {
        const outBase = args[args.indexOf("-of") + 1];
        await writeFile(`${outBase}.txt`, "  Привет,\n едем   в горы \n");
      }
      return { stdout: "", stderr: "" };
    });
    const transcriber = createTranscriber({ ...base, whisperModelPath: "/models/turbo.bin", whisperThreads: 4 }, { runCommand })!;

    const text = await transcriber.transcribe({ data: Buffer.from("ogg"), extension: "ogg" }, "ru");

    expect(text).toBe("Привет, едем в горы");
    expect(calls.map((call) => call.file)).toEqual(["ffmpeg", "whisper-cli"]);
    expect(calls[0].args).toEqual(expect.arrayContaining(["-ar", "16000", "-ac", "1"]));
    expect(calls[1].args).toEqual(expect.arrayContaining(["-m", "/models/turbo.bin", "-l", "ru", "-t", "4", "-otxt"]));
  });

  it("explains a missing binary", async () => {
    const runCommand: RunCommand = vi.fn(async () => {
      throw Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" });
    });
    const transcriber = createTranscriber({ ...base, whisperModelPath: "/m.bin" }, { runCommand })!;

    await expect(transcriber.transcribe({ data: Buffer.from("x"), extension: "ogg" })).rejects.toThrow(/ffmpeg was not found/);
  });
});

describe("OpenAI-compatible backend", () => {
  it("posts multipart audio and returns the text", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "hello there" }), { status: 200 }));
    const config = { ...base, openaiApiKey: "sk-test", openaiBaseUrl: "https://api.example.com/v1", openaiModel: "whisper-large-v3-turbo" };
    const transcriber = createTranscriber(config, { fetch: fetchMock as unknown as typeof fetch })!;

    const text = await transcriber.transcribe({ data: Buffer.from("ogg"), extension: "ogg" }, "en");

    expect(text).toBe("hello there");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect((form.get("file") as File).name).toBe("voice.ogg");
  });

  it("surfaces API errors", async () => {
    const fetchMock = vi.fn(async () => new Response("bad key", { status: 401 }));
    const transcriber = createTranscriber({ ...base, openaiApiKey: "sk-bad" }, { fetch: fetchMock as unknown as typeof fetch })!;

    await expect(transcriber.transcribe({ data: Buffer.from("x"), extension: "ogg" })).rejects.toThrow(/401: bad key/);
  });
});

describe("media detection", () => {
  it("recognises voice notes, round videos and photos", () => {
    const doc = (mimeType: string, attributes: object[]) => ({ media: { document: { mimeType, attributes } } });
    expect(describeMedia(doc("audio/ogg", [{ className: "DocumentAttributeAudio", voice: true, duration: 5 }]))).toEqual({
      kind: "voice",
      mimeType: "audio/ogg",
      durationSeconds: 5,
    });
    expect(describeMedia(doc("video/mp4", [{ className: "DocumentAttributeVideo", roundMessage: true, duration: 9 }]))?.kind).toBe("video_note");
    expect(describeMedia({ media: { photo: {} } })?.kind).toBe("photo");
    expect(describeMedia({})).toBeNull();
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime(null)).toBe("ogg");
  });
});
