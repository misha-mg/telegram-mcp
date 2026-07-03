import { describe, expect, it, vi } from "vitest";
import {
  createTelegramToolHandlers,
  type TelegramClientLike,
  type TelegramToolDependencies,
} from "../src/toolHandlers.js";
import type { TelegramMcpConfig } from "../src/config.js";
import { parseToolJson } from "./helpers.js";

const baseConfig = {
  apiId: 123,
  apiHash: "hash",
  sessionPath: ".local/session",
  sendEnabled: false,
};

function makeClient(overrides: Partial<TelegramClientLike> = {}): TelegramClientLike {
  return {
    checkAuthorization: vi.fn().mockResolvedValue(true),
    getDialogs: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    getEntity: vi.fn().mockResolvedValue({ id: "entity" }),
    sendMessage: vi.fn().mockResolvedValue({ id: 42 }),
    ...overrides,
  };
}

function makeDeps(
  client = makeClient(),
  config: TelegramMcpConfig = baseConfig,
  session = "session",
): TelegramToolDependencies {
  return {
    loadConfig: vi.fn(() => config),
    loadSession: vi.fn().mockResolvedValue(session),
    getTelegramClient: vi.fn().mockResolvedValue(client),
  };
}

describe("telegram tool handlers", () => {
  it("reports status without connecting when credentials or session are missing", async () => {
    const deps = makeDeps(makeClient(), { sessionPath: ".local/session", sendEnabled: false }, "");
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramStatus());

    expect(result).toMatchObject({
      hasApiId: false,
      hasApiHash: false,
      hasSession: false,
      authorized: null,
      authError: null,
    });
    expect(deps.getTelegramClient).not.toHaveBeenCalled();
  });

  it("reports authorization when credentials and session are present", async () => {
    const client = makeClient({ checkAuthorization: vi.fn().mockResolvedValue(true) });
    const deps = makeDeps(client);
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramStatus());

    expect(result.authorized).toBe(true);
    expect(client.checkAuthorization).toHaveBeenCalledOnce();
  });

  it("lists dialogs with normalized output", async () => {
    const client = makeClient({
      getDialogs: vi.fn().mockResolvedValue([
        {
          unreadCount: 2,
          entity: { id: 123n, title: "Team", username: "team", broadcast: true },
        },
      ]),
    });
    const handlers = createTelegramToolHandlers(makeDeps(client));

    const result = parseToolJson(await handlers.telegramListDialogs({ limit: 10 }));

    expect(client.getDialogs).toHaveBeenCalledWith({ limit: 10 });
    expect(result.dialogs).toEqual([
      {
        id: "123",
        name: "Team",
        isChannel: true,
        isGroup: false,
        unreadCount: 2,
        username: "team",
      },
    ]);
  });

  it("reads messages from a peer", async () => {
    const client = makeClient({
      getMessages: vi.fn().mockResolvedValue([{ id: 1, date: new Date("2026-07-03T12:00:00Z"), message: "Hi" }]),
    });
    const handlers = createTelegramToolHandlers(makeDeps(client));

    const result = parseToolJson(await handlers.telegramReadMessages({ peer: "me", limit: 5 }));

    expect(client.getMessages).toHaveBeenCalledWith("me", { limit: 5 });
    expect(result.messages[0]).toMatchObject({
      id: "1",
      date: "2026-07-03T12:00:00.000Z",
      text: "Hi",
    });
  });

  it("searches messages with query forwarding", async () => {
    const client = makeClient();
    const handlers = createTelegramToolHandlers(makeDeps(client));

    const result = parseToolJson(await handlers.telegramSearchMessages({ peer: "@channel", query: "decline", limit: 7 }));

    expect(client.getMessages).toHaveBeenCalledWith("@channel", { limit: 7, search: "decline" });
    expect(result).toMatchObject({ peer: "@channel", query: "decline", messages: [] });
  });

  it("blocks sending when the environment write gate is disabled", async () => {
    const client = makeClient();
    const deps = makeDeps(client, { ...baseConfig, sendEnabled: false });
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramSendMessage({ peer: "me", message: "hello", confirm: "SEND" }));

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("Sending is disabled");
    expect(deps.getTelegramClient).not.toHaveBeenCalled();
  });

  it("blocks sending when confirmation is missing", async () => {
    const client = makeClient();
    const deps = makeDeps(client, { ...baseConfig, sendEnabled: true });
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramSendMessage({ peer: "me", message: "hello", confirm: "NO" }));

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("confirm");
    expect(deps.getTelegramClient).not.toHaveBeenCalled();
  });

  it("sends exactly one message when both safety gates pass", async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ id: "peer-entity" }),
      sendMessage: vi.fn().mockResolvedValue({ id: 777n }),
    });
    const handlers = createTelegramToolHandlers(makeDeps(client, { ...baseConfig, sendEnabled: true }));

    const result = parseToolJson(await handlers.telegramSendMessage({ peer: "me", message: "hello", confirm: "SEND" }));

    expect(client.getEntity).toHaveBeenCalledWith("me");
    expect(client.sendMessage).toHaveBeenCalledWith({ id: "peer-entity" }, { message: "hello" });
    expect(result).toEqual({ sent: true, peer: "me", messageId: "777" });
  });
});
