import input from "input";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { assertTelegramConfig, loadConfig, loadSession, saveSession } from "./config.js";

const config = loadConfig();
assertTelegramConfig(config);

const existingSession = await loadSession(config);
const client = new TelegramClient(new StringSession(existingSession), config.apiId, config.apiHash, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => process.env.TELEGRAM_PHONE || input.text("Phone number: "),
  password: async () => process.env.TELEGRAM_PASSWORD || input.text("Two-step password, if enabled: "),
  phoneCode: async () => input.text("Telegram code: "),
  onError: (error) => {
    console.error(error);
  },
});

const session = (client.session as StringSession).save();
await saveSession(session, config);
console.log(`Telegram session saved to ${config.sessionPath}`);
await client.disconnect();
