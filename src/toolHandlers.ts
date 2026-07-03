import type { TelegramMcpConfig } from "./config.js";
import { getConfigStatus, loadConfig, loadSession } from "./config.js";
import { serializeDialog, serializeMessage, toSafeJson } from "./format.js";
import { getTelegramClient } from "./telegramClient.js";

export type TelegramClientLike = {
  checkAuthorization(): Promise<boolean>;
  getDialogs(params: { limit: number }): Promise<unknown[]>;
  getMessages(peer: string, params: { limit: number; search?: string }): Promise<unknown[]>;
  getEntity(peer: string): Promise<unknown>;
  sendMessage(entity: unknown, params: { message: string }): Promise<{ id: unknown }>;
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

const defaultDependencies: TelegramToolDependencies = {
  loadConfig,
  loadSession,
  getTelegramClient: getTelegramClient as (config?: TelegramMcpConfig) => Promise<TelegramClientLike>,
};

export function createTelegramToolHandlers(deps: TelegramToolDependencies = defaultDependencies) {
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
      const messages = await client.getMessages(peer, { limit });

      return textResult({
        peer,
        messages: messages.map((message) => serializeMessage(message as Record<string, unknown>)),
      });
    },

    telegramSearchMessages: async ({ peer, query, limit }: TelegramSearchMessagesInput) => {
      const client = await deps.getTelegramClient();
      const messages = await client.getMessages(peer, { limit, search: query });

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
      const entity = await client.getEntity(peer);
      const sent = await client.sendMessage(entity, { message });

      return textResult({
        sent: true,
        peer,
        messageId: String(sent.id),
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
