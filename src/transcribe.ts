import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PACKAGE_ROOT } from "./config.js";

export type TranscriptionBackend = "local" | "openai";

export type TranscriptionConfig = {
  /** Explicit backend, or undefined to pick one from what is configured (local model first). */
  backend?: TranscriptionBackend;
  /** Spoken language as an ISO-639-1 code (e.g. "ru", "uk", "en"), or "auto" to detect. */
  language: string;
  /** whisper.cpp CLI. Plain name is looked up on PATH (whisper-cli / whisper-cli.exe). */
  whisperBin: string;
  /** Path to a ggml whisper model, e.g. ggml-large-v3-turbo-q5_0.bin. Enables the local backend. */
  whisperModelPath?: string;
  /** CPU threads for whisper.cpp; undefined lets whisper.cpp decide. */
  whisperThreads?: number;
  ffmpegBin: string;
  /** Key for an OpenAI-compatible /audio/transcriptions endpoint. Enables the openai backend. */
  openaiApiKey?: string;
  openaiBaseUrl: string;
  openaiModel: string;
};

export type AudioInput = {
  data: Buffer;
  /** File extension without dot, used for the upload filename and temp file (ogg, mp4, mp3, m4a...). */
  extension: string;
};

export type Transcriber = {
  backend: TranscriptionBackend;
  transcribe(audio: AudioInput, language?: string): Promise<string>;
};

export type RunCommand = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);
export const defaultRunCommand: RunCommand = (file, args) =>
  execFileAsync(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });

/** OpenAI's documented upload limit for /audio/transcriptions. */
export const OPENAI_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function loadTranscriptionConfig(env: NodeJS.ProcessEnv = process.env): TranscriptionConfig {
  const backendRaw = env.TELEGRAM_MCP_TRANSCRIBE_BACKEND?.trim().toLowerCase();
  const threads = Number(env.WHISPER_THREADS);
  const modelPath = env.WHISPER_MODEL_PATH?.trim();

  return {
    backend: backendRaw === "local" || backendRaw === "openai" ? backendRaw : undefined,
    language: env.TELEGRAM_MCP_TRANSCRIBE_LANGUAGE?.trim() || "auto",
    whisperBin: env.WHISPER_CPP_BIN?.trim() || "whisper-cli",
    // Relative model paths resolve against the package root, like TELEGRAM_SESSION_PATH.
    whisperModelPath: modelPath ? path.resolve(PACKAGE_ROOT, modelPath) : undefined,
    whisperThreads: Number.isInteger(threads) && threads > 0 ? threads : undefined,
    ffmpegBin: env.FFMPEG_BIN?.trim() || "ffmpeg",
    openaiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    openaiBaseUrl: (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    openaiModel: env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
  };
}

/** Which backend would be used, or null when transcription is not configured. Never exposes secrets. */
export function resolveBackend(config: TranscriptionConfig): TranscriptionBackend | null {
  if (config.backend === "local") return config.whisperModelPath ? "local" : null;
  if (config.backend === "openai") return config.openaiApiKey ? "openai" : null;
  if (config.whisperModelPath) return "local";
  if (config.openaiApiKey) return "openai";
  return null;
}

export function getTranscriptionStatus(config: TranscriptionConfig) {
  return {
    transcriptionBackend: resolveBackend(config),
    transcriptionLanguage: config.language,
    hasWhisperModel: Boolean(config.whisperModelPath),
    hasOpenaiKey: Boolean(config.openaiApiKey),
  };
}

export const TRANSCRIPTION_NOT_CONFIGURED =
  "Transcription is not configured. Set WHISPER_MODEL_PATH (local whisper.cpp, needs whisper-cli and ffmpeg) " +
  "or OPENAI_API_KEY (OpenAI-compatible API). See docs/transcription.md.";

export function createTranscriber(
  config: TranscriptionConfig,
  deps: { runCommand?: RunCommand; fetch?: typeof fetch } = {},
): Transcriber | null {
  const backend = resolveBackend(config);
  if (backend === "local") return createLocalTranscriber(config, deps.runCommand ?? defaultRunCommand);
  if (backend === "openai") return createOpenAiTranscriber(config, deps.fetch ?? fetch);
  return null;
}

/**
 * whisper.cpp via its CLI. Nothing stays resident: ffmpeg and whisper-cli are spawned per request
 * and exit when done, so there is no idle CPU/RAM cost. Works the same on macOS, Linux and Windows.
 */
function createLocalTranscriber(config: TranscriptionConfig, runCommand: RunCommand): Transcriber {
  return {
    backend: "local",
    async transcribe(audio, language = config.language) {
      const dir = await mkdtemp(path.join(tmpdir(), "telegram-mcp-voice-"));
      try {
        const input = path.join(dir, `input.${safeExtension(audio.extension)}`);
        const wav = path.join(dir, "audio.wav");
        const outBase = path.join(dir, "transcript");
        await writeFile(input, audio.data);

        // whisper.cpp needs 16 kHz mono PCM; Telegram voice notes are Opus in OGG.
        await runTool(runCommand, config.ffmpegBin, [
          "-hide_banner", "-loglevel", "error", "-y",
          "-i", input, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav,
        ]);

        const args = ["-m", config.whisperModelPath!, "-f", wav, "-l", language || "auto", "-nt", "-np", "-otxt", "-of", outBase];
        if (config.whisperThreads) args.push("-t", String(config.whisperThreads));
        await runTool(runCommand, config.whisperBin, args);

        return normalizeTranscript(await readFile(`${outBase}.txt`, "utf8"));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}

function createOpenAiTranscriber(config: TranscriptionConfig, fetchImpl: typeof fetch): Transcriber {
  return {
    backend: "openai",
    async transcribe(audio, language = config.language) {
      if (audio.data.byteLength > OPENAI_MAX_UPLOAD_BYTES) {
        throw new Error("Audio is larger than 25 MB, the OpenAI transcription upload limit.");
      }

      const form = new FormData();
      const extension = safeExtension(audio.extension);
      form.append("file", new Blob([new Uint8Array(audio.data)]), `voice.${extension}`);
      form.append("model", config.openaiModel);
      form.append("response_format", "json");
      if (language && language !== "auto") form.append("language", language);

      const response = await fetchImpl(`${config.openaiBaseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.openaiApiKey}` },
        body: form,
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 500);
        throw new Error(`Transcription API returned ${response.status}: ${detail}`);
      }

      const body = (await response.json()) as { text?: unknown };
      return normalizeTranscript(typeof body.text === "string" ? body.text : "");
    },
  };
}

export async function runTool(runCommand: RunCommand, file: string, args: string[]): Promise<void> {
  try {
    await runCommand(file, args);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      throw new Error(`${file} was not found. Install it or set its path in the environment (see docs/transcription.md).`);
    }
    const stderr = typeof err.stderr === "string" ? err.stderr.trim().slice(-500) : "";
    throw new Error(`${path.basename(file)} failed${stderr ? `: ${stderr}` : `: ${err.message}`}`);
  }
}

export function safeExtension(extension: string): string {
  return /^[a-z0-9]{1,5}$/i.test(extension) ? extension.toLowerCase() : "bin";
}

function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
