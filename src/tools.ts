import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTelegramToolHandlers, type TelegramToolDependencies } from "./toolHandlers.js";

const MAX_DIALOG_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

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
      description: "List recent Telegram dialogs for the authenticated account.",
      inputSchema: {
        limit: z.number().int().min(1).max(MAX_DIALOG_LIMIT).default(20),
      },
    },
    handlers.telegramListDialogs,
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
    handlers.telegramReadMessages,
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
    handlers.telegramSearchMessages,
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
    handlers.telegramSendMessage,
  );
}
