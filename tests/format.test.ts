import { describe, expect, it } from "vitest";
import { serializeDialog, serializeMessage, toSafeJson } from "../src/format.js";

describe("format helpers", () => {
  it("serializes bigint values as JSON strings", () => {
    expect(toSafeJson({ id: 123n })).toBe('{\n  "id": "123"\n}');
  });

  it("normalizes Telegram dialogs", () => {
    expect(
      serializeDialog({
        unreadCount: 3,
        entity: {
          id: 123n,
          title: "Payments Chat",
          username: "payments",
          megagroup: true,
        },
      }),
    ).toEqual({
      id: "123",
      name: "Payments Chat",
      isChannel: false,
      isGroup: true,
      unreadCount: 3,
      username: "payments",
    });
  });

  it("normalizes Telegram messages", () => {
    expect(
      serializeMessage({
        id: 10,
        date: 1_700_000_000,
        senderId: 999n,
        message: "Hello",
      }),
    ).toEqual({
      id: "10",
      date: "2023-11-14T22:13:20.000Z",
      senderId: "999",
      text: "Hello",
    });
  });
});
