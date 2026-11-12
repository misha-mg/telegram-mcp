import { describe, expect, it, vi } from "vitest";
import {
  createTelegramToolHandlers,
  type TelegramClientLike,
  type TelegramToolDependencies,
} from "../src/toolHandlers.js";
import type { TelegramMcpConfig } from "../src/config.js";
import type { Transcriber } from "../src/transcribe.js";
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
    getInputEntity: vi.fn(async (peer: string) => ({ resolved: peer })),
    sendMessage: vi.fn().mockResolvedValue({ id: 42 }),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    downloadMedia: vi.fn().mockResolvedValue(Buffer.from("audio")),
    downloadThumbnail: vi.fn().mockResolvedValue(Buffer.from("thumb")),
    ...overrides,
  };
}

function makeDeps(
  client = makeClient(),
  config: TelegramMcpConfig = baseConfig,
  session = "session",
  transcriber: Transcriber | null = null,
): TelegramToolDependencies {
  return {
    loadConfig: vi.fn(() => config),
    loadSession: vi.fn().mockResolvedValue(session),
    getTelegramClient: vi.fn().mockResolvedValue(client),
    getTranscriber: vi.fn(() => transcriber),
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
        peer: "123",
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

    expect(client.getMessages).toHaveBeenCalledWith({ resolved: "me" }, { limit: 5 });
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

    expect(client.getMessages).toHaveBeenCalledWith({ resolved: "@channel" }, { limit: 7, search: "decline" });
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
      getInputEntity: vi.fn().mockResolvedValue({ id: "peer-entity" }),
      sendMessage: vi.fn().mockResolvedValue({ id: 777n }),
    });
    const handlers = createTelegramToolHandlers(makeDeps(client, { ...baseConfig, sendEnabled: true }));

    const result = parseToolJson(await handlers.telegramSendMessage({ peer: "me", message: "hello", confirm: "SEND" }));

    expect(client.getInputEntity).toHaveBeenCalledWith("me");
    expect(client.sendMessage).toHaveBeenCalledWith({ id: "peer-entity" }, { message: "hello" });
    expect(result).toEqual({ sent: true, peer: "me", messageId: "777" });
  });

  const tripDialog = {
    id: -1001234567890n,
    name: "Barcelona Trip 🌴",
    inputEntity: { kind: "trip-input" },
    entity: { id: 1234567890n, title: "Barcelona Trip 🌴", megagroup: true },
  };
  const workDialog = {
    id: -555n,
    name: "Work Team",
    inputEntity: { kind: "work-input" },
    entity: { id: 555n, title: "Work Team" },
  };

  it("resolves a marked peer id from telegram_list_dialogs through the dialog list", async () => {
    const client = makeClient({ getDialogs: vi.fn().mockResolvedValue([tripDialog, workDialog]) });
    const handlers = createTelegramToolHandlers(makeDeps(client));

    await handlers.telegramReadMessages({ peer: "-1001234567890", limit: 5 });

    expect(client.getMessages).toHaveBeenCalledWith({ kind: "trip-input" }, { limit: 5 });
    expect(client.getInputEntity).not.toHaveBeenCalled();
  });

  it("resolves a chat by unique partial name, case-insensitively", async () => {
    const client = makeClient({ getDialogs: vi.fn().mockResolvedValue([tripDialog, workDialog]) });
    const handlers = createTelegramToolHandlers(makeDeps(client));

    await handlers.telegramReadMessages({ peer: "barcelona", limit: 5 });

    expect(client.getMessages).toHaveBeenCalledWith({ kind: "trip-input" }, { limit: 5 });
  });

  it("rejects ambiguous names and lists the options", async () => {
    const otherTrip = { ...tripDialog, id: -1009n, name: "Barcelona Trip 2025", inputEntity: { kind: "old" } };
    const client = makeClient({ getDialogs: vi.fn().mockResolvedValue([tripDialog, otherTrip]) });
    const handlers = createTelegramToolHandlers(makeDeps(client));

    await expect(handlers.telegramReadMessages({ peer: "barcelona", limit: 5 })).rejects.toThrow(/Ambiguous/);
    expect(client.getMessages).not.toHaveBeenCalled();
  });

  it("blocks drafts when the drafts gate is disabled", async () => {
    const client = makeClient();
    const deps = makeDeps(client, { ...baseConfig, draftsEnabled: false });
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramSaveDraft({ peer: "Work Team", message: "hi" }));

    expect(result.blocked).toBe(true);
    expect(deps.getTelegramClient).not.toHaveBeenCalled();
  });

  it("saves a draft without sending when drafts are enabled", async () => {
    const client = makeClient({ getDialogs: vi.fn().mockResolvedValue([tripDialog, workDialog]) });
    const handlers = createTelegramToolHandlers(makeDeps(client, { ...baseConfig, draftsEnabled: true }));

    const result = parseToolJson(await handlers.telegramSaveDraft({ peer: "Work Team", message: "On it!" }));

    expect(client.saveDraft).toHaveBeenCalledWith({ kind: "work-input" }, "On it!");
    expect(client.sendMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ drafted: true, sent: false });
  });
  const voiceMessage = {
    id: 10,
    date: 1_800_000_000,
    sender: { firstName: "Anton" },
    media: {
      document: {
        mimeType: "audio/ogg",
        attributes: [{ className: "DocumentAttributeAudio", voice: true, duration: 12 }],
      },
    },
  };
  const textMessage = { id: 11, message: "just text" };

  it("blocks transcription when no backend is configured", async () => {
    const client = makeClient();
    const deps = makeDeps(client, baseConfig, "session", null);
    const handlers = createTelegramToolHandlers(deps);

    const result = parseToolJson(await handlers.telegramTranscribeVoice({ peer: "me", messageIds: [10] }));

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("WHISPER_MODEL_PATH");
    expect(deps.getTelegramClient).not.toHaveBeenCalled();
  });

  it("transcribes voice messages in order and reports per-message errors", async () => {
    const client = makeClient({ getMessages: vi.fn().mockResolvedValue([textMessage, voiceMessage]) });
    const transcriber: Transcriber = {
      backend: "local",
      transcribe: vi.fn().mockResolvedValue("привет, едем в горы"),
    };
    const handlers = createTelegramToolHandlers(makeDeps(client, baseConfig, "session", transcriber));

    const result = parseToolJson(
      await handlers.telegramTranscribeVoice({ peer: "me", messageIds: [10, 11, 12], language: "ru" }),
    );

    expect(client.getMessages).toHaveBeenCalledWith({ resolved: "me" }, { ids: [10, 11, 12] });
    expect(client.downloadMedia).toHaveBeenCalledOnce();
    expect(transcriber.transcribe).toHaveBeenCalledWith({ data: Buffer.from("audio"), extension: "ogg" }, "ru");
    expect(result.backend).toBe("local");
    expect(result.transcripts).toEqual([
      expect.objectContaining({ id: "10", kind: "voice", durationSeconds: 12, senderName: "Anton", text: "привет, едем в горы" }),
      expect.objectContaining({ id: "11", error: expect.stringContaining("none") }),
      { id: "12", error: "Message not found." },
    ]);
  });

  it("keeps going when one transcription fails", async () => {
    const second = { ...voiceMessage, id: 20 };
    const client = makeClient({ getMessages: vi.fn().mockResolvedValue([voiceMessage, second]) });
    const transcriber: Transcriber = {
      backend: "openai",
      transcribe: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok"),
    };
    const handlers = createTelegramToolHandlers(makeDeps(client, baseConfig, "session", transcriber));

    const result = parseToolJson(await handlers.telegramTranscribeVoice({ peer: "me", messageIds: [10, 20] }));

    expect(result.transcripts[0]).toMatchObject({ id: "10", error: "boom" });
    expect(result.transcripts[1]).toMatchObject({ id: "20", text: "ok" });
  });
});
