import type { TelegramMcpConfig } from "./config.js";
import { getConfigStatus, loadConfig, loadSession } from "./config.js";
import { describeMedia, extensionForMime, serializeDialog, serializeMessage, toSafeJson, TRANSCRIBABLE_KINDS } from "./format.js";
import { createPeerResolver } from "./peers.js";
import { downloadMessageMedia, getTelegramClient, saveDraft } from "./telegramClient.js";
import {
  createTranscriber,
  getTranscriptionStatus,
  loadTranscriptionConfig,
  TRANSCRIPTION_NOT_CONFIGURED,
  type Transcriber,
} from "./transcribe.js";

export type TelegramClientLike = {
  checkAuthorization(): Promise<boolean>;
  getDialogs(params: { limit: number }): Promise<unknown[]>;
  getMessages(peer: unknown, params: { limit?: number; search?: string; ids?: number[] }): Promise<unknown[]>;
  getInputEntity(peer: string): Promise<unknown>;
  sendMessage(entity: unknown, params: { message: string }): Promise<{ id: unknown }>;
  saveDraft(entity: unknown, message: string): Promise<void>;
  downloadMedia(message: unknown): Promise<Buffer | undefined>;
};

export type TelegramToolDependencies = {
  loadConfig(): TelegramMcpConfig;
  loadSession(config: TelegramMcpConfig): Promise<string>;
  getTelegramClient(config?: TelegramMcpConfig): Promise<TelegramClientLike>;
  /** Returns null when no transcription backend is configured. Defaults to reading the environment. */
  getTranscriber?(): Transcriber | null;
};

export type TelegramStatusInput = Record<string, never>;
export type TelegramListDialogsInput = { limit: number };
export type TelegramReadMessagesInput = { peer: string; limit: number };
export type TelegramSearchMessagesInput = { peer: string; query: string; limit: number };
export type TelegramSendMessageInput = { peer: string; message: string; confirm: string };
export type TelegramSaveDraftInput = { peer: string; message: string };
export type TelegramTranscribeVoiceInput = { peer: string; messageIds: number[]; language?: string };

const defaultDependencies: TelegramToolDependencies = {
  loadConfig,
  loadSession,
  getTelegramClient: async (config?: TelegramMcpConfig): Promise<TelegramClientLike> => {
    const client = await getTelegramClient(config);
    return {
      checkAuthorization: () => client.checkAuthorization(),
      getDialogs: (params) => client.getDialogs(params),
      getMessages: (peer, params) => client.getMessages(peer as never, params),
      getInputEntity: (peer) => client.getInputEntity(peer),
      sendMessage: (entity, params) => client.sendMessage(entity as never, params),
      saveDraft: (entity, message) => saveDraft(client, entity, message),
      downloadMedia: (message) => downloadMessageMedia(client, message),
    };
  },
};

export function createTelegramToolHandlers(deps: TelegramToolDependencies = defaultDependencies) {
  const resolvePeer = createPeerResolver();

  return {
    telegramStatus: async (_input: TelegramStatusInput = {}) => {
      const config = deps.loadConfig();
      const session = await deps.loadSession(config);

      let authorized: boolean | null = null;
      let authError: string | null = null;

      if (config.apiId && config.apiHash && session) {
        try {
          const client = await deps.getTelegramClient(config);
          authorized = await client.checkAuthorization();
        } catch (error) {
          authorized = false;
          authError = error instanceof Error ? error.message : String(error);
        }
      }

      return textResult({
        ...getConfigStatus(config),
        ...getTranscriptionStatus(loadTranscriptionConfig()),
        hasSession: Boolean(session),
        authorized,
        authError,
      });
    },

    telegramListDialogs: async ({ limit }: TelegramListDialogsInput) => {
      const client = await deps.getTelegramClient();
      const dialogs = await client.getDialogs({ limit });

      return textResult({
        dialogs: dialogs.map((dialog) => serializeDialog(dialog as Record<string, unknown>)),
      });
    },

    telegramReadMessages: async ({ peer, limit }: TelegramReadMessagesInput) => {
      const client = await deps.getTelegramClient();
      const entity = await resolvePeer(client, peer);
      const messages = await client.getMessages(entity, { limit });

      return textResult({
        peer,
        messages: messages.map((message) => serializeMessage(message as Record<string, unknown>)),
      });
    },

    telegramSearchMessages: async ({ peer, query, limit }: TelegramSearchMessagesInput) => {
      const client = await deps.getTelegramClient();
      const entity = await resolvePeer(client, peer);
      const messages = await client.getMessages(entity, { limit, search: query });

      return textResult({
        peer,
        query,
        messages: messages.map((message) => serializeMessage(message as Record<string, unknown>)),
      });
    },

    telegramSendMessage: async ({ peer, message, confirm }: TelegramSendMessageInput) => {
      const config = deps.loadConfig();
      if (!config.sendEnabled) {
        return textResult({
          blocked: true,
          reason: "Sending is disabled. Set TELEGRAM_MCP_ENABLE_SEND=true to enable this tool.",
        });
      }

      if (confirm !== "SEND") {
        return textResult({
          blocked: true,
          reason: 'Missing explicit confirmation. Pass confirm: "SEND".',
        });
      }

      const client = await deps.getTelegramClient(config);
      const entity = await resolvePeer(client, peer);
      const sent = await client.sendMessage(entity, { message });

      return textResult({
        sent: true,
        peer,
        messageId: String(sent.id),
      });
    },

    telegramSaveDraft: async ({ peer, message }: TelegramSaveDraftInput) => {
      const config = deps.loadConfig();
      if (!config.draftsEnabled) {
        return textResult({
          blocked: true,
          reason: "Drafts are disabled. Set TELEGRAM_MCP_ENABLE_DRAFTS=true to enable this tool.",
        });
      }

      const client = await deps.getTelegramClient(config);
      const entity = await resolvePeer(client, peer);
      await client.saveDraft(entity, message);

      return textResult({
        drafted: true,
        sent: false,
        peer,
        note: "Saved as the chat's draft (replaces any existing draft). The user must review and send it in Telegram.",
      });
    },

    telegramTranscribeVoice: async ({ peer, messageIds, language }: TelegramTranscribeVoiceInput) => {
      const transcriber = deps.getTranscriber ? deps.getTranscriber() : createTranscriber(loadTranscriptionConfig());
      if (!transcriber) {
        return textResult({ blocked: true, reason: TRANSCRIPTION_NOT_CONFIGURED });
      }

      const client = await deps.getTelegramClient();
      const entity = await resolvePeer(client, peer);
      const found = await client.getMessages(entity, { ids: messageIds });
      const byId = new Map<string, Record<string, unknown>>();
      for (const message of found) {
        const record = message as Record<string, unknown> | undefined;
        if (record?.id !== undefined) byId.set(String(record.id), record);
      }

      // Sequential on purpose: one ffmpeg/whisper process at a time keeps CPU and RAM use flat.
      const transcripts = [];
      for (const id of messageIds) {
        const message = byId.get(String(id));
        if (!message) {
          transcripts.push({ id: String(id), error: "Message not found." });
          continue;
        }

        const { date, senderName } = serializeMessage(message);
        const media = describeMedia(message);
        if (!media || !TRANSCRIBABLE_KINDS.has(media.kind)) {
          transcripts.push({ id: String(id), date, senderName, error: `No voice/audio/video to transcribe (media: ${media?.kind ?? "none"}).` });
          continue;
        }

        try {
          const data = await client.downloadMedia(message);
          if (!data) throw new Error("Could not download the media.");
          const text = await transcriber.transcribe({ data, extension: extensionForMime(media.mimeType) }, language);
          transcripts.push({ id: String(id), date, senderName, kind: media.kind, durationSeconds: media.durationSeconds, text });
        } catch (error) {
          transcripts.push({ id: String(id), date, senderName, kind: media.kind, error: error instanceof Error ? error.message : String(error) });
        }
      }

      return textResult({ peer, backend: transcriber.backend, transcripts });
    },
  };
}

export function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: toSafeJson(value),
      },
    ],
  };
}
