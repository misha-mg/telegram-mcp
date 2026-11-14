import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_FRAMES_PER_VIDEO, MAX_FRAMES_PER_VIDEO } from "./media.js";
import { createTelegramToolHandlers, type TelegramToolDependencies } from "./toolHandlers.js";

const MAX_DIALOG_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 300;
const MAX_TRANSCRIBE_IDS = 20;
const MAX_VIEW_IDS = 10;
const MAX_DOWNLOAD_IDS = 20;
const PEER_DESCRIPTION =
  'Chat to use: the `peer` id from telegram_list_dialogs, an exact or unique partial chat name, @username, or "me".';

export function registerTelegramTools(server: McpServer, deps?: TelegramToolDependencies): void {
  const handlers = createTelegramToolHandlers(deps);

  server.registerTool(
    "telegram_status",
    {
      description: "Report Telegram MCP configuration and authorization status without exposing secrets.",
      inputSchema: {},
    },
    handlers.telegramStatus,
  );

  server.registerTool(
    "telegram_list_dialogs",
    {
      description: "List recent Telegram dialogs for the authenticated account. Each result has a `peer` id usable by the other tools.",
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_DIALOG_LIMIT).default(20),
      },
    },
    handlers.telegramListDialogs,
  );

  server.registerTool(
    "telegram_read_messages",
    {
      description: "Read recent messages (newest first) from a Telegram chat.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        limit: z.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(20),
      },
    },
    handlers.telegramReadMessages,
  );

  server.registerTool(
    "telegram_search_messages",
    {
      description: "Search messages in a Telegram chat.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(20),
      },
    },
    handlers.telegramSearchMessages,
  );

  server.registerTool(
    "telegram_send_message",
    {
      description: "Send one Telegram message. Disabled unless TELEGRAM_MCP_ENABLE_SEND=true and confirm is SEND.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        message: z.string().min(1).max(4096),
        confirm: z.string(),
      },
    },
    handlers.telegramSendMessage,
  );

  server.registerTool(
    "telegram_send_file",
    {
      description:
        "Upload one local file (archive, PDF, photo, video, any document) and send it to a Telegram chat, optionally with a caption. Disabled unless TELEGRAM_MCP_ENABLE_SEND=true and confirm is SEND. Max 2000 MB.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        path: z.string().min(1).describe("Absolute path of the local file (~ allowed)."),
        caption: z.string().max(1024).optional(),
        asDocument: z
          .boolean()
          .optional()
          .describe("Send photos and videos as files (no compression). Other files are always sent as documents."),
        confirm: z.string(),
      },
    },
    handlers.telegramSendFile,
  );

  server.registerTool(
    "telegram_save_draft",
    {
      description:
        "Save text as the draft in a Telegram chat's input box, synced to all the user's devices. Does NOT send; the user reviews and sends it themselves. Replaces any existing draft in that chat. Disabled unless TELEGRAM_MCP_ENABLE_DRAFTS=true.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        message: z.string().min(1).max(4096),
      },
    },
    handlers.telegramSaveDraft,
  );

  server.registerTool(
    "telegram_transcribe_voice",
    {
      description:
        "Transcribe voice messages, video notes (round videos), audio and video files to text. Find candidates via `mediaKind` in telegram_read_messages / telegram_search_messages. Runs locally with whisper.cpp or through an OpenAI-compatible API, depending on configuration.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        messageIds: z.array(z.number().int().positive()).min(1).max(MAX_TRANSCRIBE_IDS).describe("Message `id`s to transcribe, processed in order."),
        language: z
          .string()
          .regex(/^(auto|[a-z]{2})$/)
          .optional()
          .describe('ISO-639-1 code such as "ru", "uk", "en", or "auto". Defaults to TELEGRAM_MCP_TRANSCRIBE_LANGUAGE (auto).'),
      },
    },
    handlers.telegramTranscribeVoice,
  );

  server.registerTool(
    "telegram_view_media",
    {
      description:
        "Show photos, image files, videos, round videos and GIFs from Telegram messages as images you can look at. Videos come back as evenly spaced frames (very large videos as their thumbnail only). Find candidates via `mediaKind` in telegram_read_messages / telegram_search_messages. Needs ffmpeg for videos.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        messageIds: z.array(z.number().int().positive()).min(1).max(MAX_VIEW_IDS).describe("Message `id`s to show, in order."),
        framesPerVideo: z
          .number()
          .int()
          .min(1)
          .max(MAX_FRAMES_PER_VIDEO)
          .default(DEFAULT_FRAMES_PER_VIDEO)
          .describe("How many evenly spaced frames to take from each video."),
      },
    },
    handlers.telegramViewMedia,
  );

  server.registerTool(
    "telegram_download_file",
    {
      description:
        "Save files from Telegram messages (documents such as PDFs, archives, photos, videos, audio, voice) to a local folder and return their paths. Find candidates via `mediaKind`, `fileName` and `sizeBytes` in telegram_read_messages / telegram_search_messages. Never overwrites: an existing name gets a \" (2)\" suffix.",
      inputSchema: {
        peer: z.string().min(1).describe(PEER_DESCRIPTION),
        messageIds: z.array(z.number().int().positive()).min(1).max(MAX_DOWNLOAD_IDS).describe("Message `id`s whose files to save, in order."),
        directory: z
          .string()
          .optional()
          .describe("Folder to save into (~ allowed; created if missing). Defaults to TELEGRAM_MCP_DOWNLOAD_DIR or ~/Downloads/Telegram MCP."),
      },
    },
    handlers.telegramDownloadFile,
  );
}
