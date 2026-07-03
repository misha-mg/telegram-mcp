import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTelegramTools } from "./tools.js";

const server = new McpServer({
  name: "telegram-mcp",
  version: "0.1.0",
});

registerTelegramTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
