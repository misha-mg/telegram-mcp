import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultRunCommand, runTool, safeExtension, type RunCommand } from "./transcribe.js";

/** Longest side of images handed to the model; larger images only cost tokens. */
export const MAX_IMAGE_SIDE = 1568;
export const DEFAULT_FRAMES_PER_VIDEO = 4;
export const MAX_FRAMES_PER_VIDEO = 8;
/** Videos above this size are not downloaded in full; their thumbnail is shown instead. */
export const DEFAULT_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export type ImageOutput = { data: Buffer; mimeType: string };
export type VideoFrame = ImageOutput & { atSeconds: number };

export type MediaProcessor = {
  /** Normalizes any image (jpeg, png, webp, heic...) to a JPEG no larger than MAX_IMAGE_SIDE. */
  toImage(data: Buffer, extension: string): Promise<ImageOutput>;
  /** Grabs `count` evenly spaced frames from a video. */
  videoFrames(data: Buffer, extension: string, durationSeconds: number | null, count: number): Promise<VideoFrame[]>;
};

export type MediaConfig = { ffmpegBin: string; maxVideoBytes: number };

export function loadMediaConfig(env: NodeJS.ProcessEnv = process.env): MediaConfig {
  const maxMb = Number(env.TELEGRAM_MCP_MAX_VIDEO_MB);
  return {
    ffmpegBin: env.FFMPEG_BIN?.trim() || "ffmpeg",
    maxVideoBytes: Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : DEFAULT_MAX_VIDEO_BYTES,
  };
}

const PASSTHROUGH_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
// Scale down only, keep aspect ratio.
const SCALE_FILTER = `scale='min(${MAX_IMAGE_SIDE},iw)':'min(${MAX_IMAGE_SIDE},ih)':force_original_aspect_ratio=decrease`;

export function createMediaProcessor(config: MediaConfig, runCommand: RunCommand = defaultRunCommand): MediaProcessor {
  return {
    async toImage(data, extension) {
      return withTempDir(async (dir) => {
        const input = path.join(dir, `input.${safeExtension(extension)}`);
        const output = path.join(dir, "image.jpg");
        await writeFile(input, data);
        try {
          await runTool(runCommand, config.ffmpegBin, [
            "-hide_banner", "-loglevel", "error", "-y", "-i", input, "-frames:v", "1", "-vf", SCALE_FILTER, "-q:v", "3", output,
          ]);
          return { data: await readFile(output), mimeType: "image/jpeg" };
        } catch (error) {
          // Without ffmpeg, plain JPEG/PNG can still be shown as is.
          const mimeType = PASSTHROUGH_MIME[extension.toLowerCase()];
          if (mimeType) return { data, mimeType };
          throw error;
        }
      });
    },

    async videoFrames(data, extension, durationSeconds, count) {
      return withTempDir(async (dir) => {
        const input = path.join(dir, `input.${safeExtension(extension)}`);
        await writeFile(input, data);

        const duration = durationSeconds && durationSeconds > 0 ? durationSeconds : 0;
        const frameCount = duration > 0 ? count : 1;
        const frames: VideoFrame[] = [];
        for (let i = 0; i < frameCount; i += 1) {
          const atSeconds = Math.round(((duration * (i + 0.5)) / frameCount) * 10) / 10;
          const output = path.join(dir, `frame${i}.jpg`);
          await runTool(runCommand, config.ffmpegBin, [
            "-hide_banner", "-loglevel", "error", "-y",
            "-ss", String(atSeconds), "-i", input, "-frames:v", "1", "-vf", SCALE_FILTER, "-q:v", "4", output,
          ]);
          frames.push({ data: await readFile(output), mimeType: "image/jpeg", atSeconds });
        }
        return frames;
      });
    },
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "telegram-mcp-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
