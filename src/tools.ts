import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConfigStatus, loadConfig, loadSession } from "./config.js";
import { serializeDialog, serializeMessage, toSafeJson } from "./format.js";
import { getTelegramClient } from "./telegramClient.js";

const MAX_DIALOG_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

export function registerTelegramTools(server: McpServer): void {
  server.registerTool(
    "telegram_status",
    {
      description: "Report Telegram MCP configuration and authorization status without exposing secrets.",
      inputSchema: {},
    },
    async () => {
      const config = loadConfig();
      const session = await loadSession(config);

      let authorized: boolean | null = null;
      let authError: string | null = null;

      if (config.apiId && config.apiHash && session) {
        try {
          const client = await getTelegramClient(config);
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
  );

  server.registerTool(
    "telegram_list_dialogs",
    {
      description: "List recent Telegram dialogs for the authenticated account.",
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_DIALOG_LIMIT).default(20),
      },
    },
    async ({ limit }) => {
      const client = await getTelegramClient();
      const dialogs = await client.getDialogs({ limit });

      return textResult({
        dialogs: dialogs.map((dialog) => serializeDialog(dialog as unknown as Record<string, unknown>)),
      });
    },
  );

  server.registerTool(
    "telegram_read_messages",
    {
      description: "Read recent messages from a Telegram peer, such as @username, channel username, phone, or saved dialog peer.",
      inputSchema: {
        peer: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(20),
      },
    },
    async ({ peer, limit }) => {
      const client = await getTelegramClient();
      const messages = await client.getMessages(peer, { limit });

      return textResult({
        peer,
        messages: messages.map((message) => serializeMessage(message as unknown as Record<string, unknown>)),
      });
    },
  );

  server.registerTool(
    "telegram_search_messages",
    {
      description: "Search recent messages in a Telegram peer.",
      inputSchema: {
        peer: z.string().min(1),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(MAX_MESSAGE_LIMIT).default(20),
      },
    },
    async ({ peer, query, limit }) => {
      const client = await getTelegramClient();
      const messages = await client.getMessages(peer, { limit, search: query });

      return textResult({
        peer,
        query,
        messages: messages.map((message) => serializeMessage(message as unknown as Record<string, unknown>)),
      });
    },
  );

  server.registerTool(
    "telegram_send_message",
    {
      description: "Send one Telegram message. Disabled unless TELEGRAM_MCP_ENABLE_SEND=true and confirm is SEND.",
      inputSchema: {
        peer: z.string().min(1),
        message: z.string().min(1).max(4096),
        confirm: z.string(),
      },
    },
    async ({ peer, message, confirm }) => {
      const config = loadConfig();
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

      const client = await getTelegramClient(config);
      const entity = await client.getEntity(peer);
      const sent = await client.sendMessage(entity, { message });

      return textResult({
        sent: true,
        peer,
        messageId: String(sent.id),
      });
    },
  );
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: toSafeJson(value),
      },
    ],
  };
}
