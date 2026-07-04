import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { parseToolJson } from "./helpers.js";

describe("MCP stdio server", () => {
  it("lists tools and serves status without Telegram credentials", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "src/server.ts"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        DOTENV_CONFIG_PATH: "/tmp/telegram-mcp-test-env-does-not-exist",
      },
      stderr: "pipe",
      cwd: process.cwd(),
    });
    const client = new Client({ name: "telegram-mcp-test", version: "0.0.0" });

    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "telegram_list_dialogs",
        "telegram_read_messages",
        "telegram_search_messages",
        "telegram_send_message",
        "telegram_status",
      ]);

      const status = parseToolJson(await client.callTool({ name: "telegram_status", arguments: {} }));
      expect(status).toMatchObject({
        hasApiId: false,
        hasApiHash: false,
        hasSession: false,
        sendEnabled: false,
        authorized: null,
      });
    } finally {
      await client.close();
    }
  });
});
