import type { TelegramMcpConfig } from "./config.js";
import { getConfigStatus, loadConfig, loadSession } from "./config.js";
import { serializeDialog, serializeMessage, toSafeJson } from "./format.js";
import { createPeerResolver } from "./peers.js";
import { getTelegramClient, saveDraft } from "./telegramClient.js";

export type TelegramClientLike = {
  checkAuthorization(): Promise<boolean>;
  getDialogs(params: { limit: number }): Promise<unknown[]>;
  getMessages(peer: unknown, params: { limit: number; search?: string }): Promise<unknown[]>;
  getInputEntity(peer: string): Promise<unknown>;
  sendMessage(entity: unknown, params: { message: string }): Promise<{ id: unknown }>;
  saveDraft(entity: unknown, message: string): Promise<void>;
};

export type TelegramToolDependencies = {
  loadConfig(): TelegramMcpConfig;
  loadSession(config: TelegramMcpConfig): Promise<string>;
  getTelegramClient(config?: TelegramMcpConfig): Promise<TelegramClientLike>;
};

export type TelegramStatusInput = Record<string, never>;
export type TelegramListDialogsInput = { limit: number };
export type TelegramReadMessagesInput = { peer: string; limit: number };
export type TelegramSearchMessagesInput = { peer: string; query: string; limit: number };
export type TelegramSendMessageInput = { peer: string; message: string; confirm: string };
export type TelegramSaveDraftInput = { peer: string; message: string };

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
