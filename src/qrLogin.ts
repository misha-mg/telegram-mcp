import input from "input";
import QRCode from "qrcode";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { assertTelegramConfig, loadConfig, loadSession, saveSession } from "./config.js";
import { createTelegramLoginUrl } from "./qr.js";

const config = loadConfig();
assertTelegramConfig(config);

const existingSession = await loadSession(config);
const stringSession = new StringSession(existingSession);
const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
  connectionRetries: 5,
});

await client.connect();

if (await client.checkAuthorization()) {
  await saveSession(stringSession.save(), config);
  console.log(`Telegram session already authorized and saved to ${config.sessionPath}`);
  await client.disconnect();
  process.exit(0);
}

await client.signInUserWithQrCode(
  { apiId: config.apiId, apiHash: config.apiHash },
  {
    qrCode: async ({ token, expires }) => {
      const url = createTelegramLoginUrl(token);
      const expiresAt = new Date(expires * 1000).toISOString();

      console.clear();
      console.log("Scan this QR code with an already logged-in Telegram mobile app.");
      console.log("Telegram: Settings -> Devices -> Link Desktop Device");
      console.log(`Expires at: ${expiresAt}`);
      console.log("");
      console.log(await renderTerminalQr(url));
      console.log("");
      console.log(`Fallback deep link: ${url}`);
      console.log("");
    },
    password: async (hint?: string) => {
      const label = hint ? `Two-step password (${hint}): ` : "Two-step password: ";
      return process.env.TELEGRAM_PASSWORD || input.text(label);
    },
    onError: async (error) => {
      console.error(error);
      return true;
    },
  },
);

await saveSession(stringSession.save(), config);
console.log(`Telegram session saved to ${config.sessionPath}`);
await client.disconnect();

async function renderTerminalQr(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "terminal",
    small: true,
    errorCorrectionLevel: "M",
  });
}
