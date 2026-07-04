import { describe, expect, it } from "vitest";
import { createTelegramLoginUrl } from "../src/qr.js";

describe("QR login helpers", () => {
  it("creates a Telegram login deep link with base64url token encoding", () => {
    const token = Buffer.from([251, 255, 238, 1]);

    expect(createTelegramLoginUrl(token)).toBe("tg://login?token=-__uAQ");
  });
});
