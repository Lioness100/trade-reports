/* eslint-disable @typescript-eslint/naming-convention */
import 'dotenv/config';

import { type ClientOptions, GatewayIntentBits } from 'discord.js';
import { cleanEnv, str } from 'envalid';
import { Logger } from '#structures/Logger';

process.env.TZ = 'America/New_York';
process.env.NODE_ENV ??= 'development';

export const env = cleanEnv(process.env, {
	DISCORD_TOKEN: str({ desc: 'The discord bot token' }),
	DEV_SERVER_ID: str({ default: '' }),
	GOOGLE_SERVICE_ACCOUNT_EMAIL: str({ desc: 'Google service account email for Sheets API' }),
	GOOGLE_PRIVATE_KEY: str({ desc: 'Google service account private key for Sheets API' }),
	GOOGLE_SPREADSHEET_ID: str({ desc: 'The ID of the Google Spreadsheet to save trade data' }),
	TELEGRAM_BOT_TOKEN: str({ default: '', desc: 'Telegram bot token from BotFather' }),
	TELEGRAM_CHAT_ID: str({ default: '', desc: 'Telegram channel/group chat ID for signals' })
});

export const clientOptions: ClientOptions = {
	intents: [GatewayIntentBits.Guilds],
	logger: { instance: new Logger() },
	loadDefaultErrorListeners: false,
	hmr: { enabled: env.isDev }
};
