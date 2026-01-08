import { Bot, InputFile } from 'grammy';
import { container } from '@sapphire/framework';
import { env } from '#root/config';
import type { SignalData } from '#utils/signals';
import { generateScoreCardImage } from '#utils/canvas';
import { calculateProfitLoss, calculateROI, validateTradeInput } from '#utils/trades';
import { saveTradeToSpreadsheet } from '#utils/spreadsheet';

class TelegramService {
	private bot: Bot | null = null;
	private chatId: string | null = null;

	public async initialize() {
		if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
			container.logger.warn(
				'[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID - Telegram integration disabled'
			);
			return;
		}

		this.chatId = env.TELEGRAM_CHAT_ID;
		this.bot = new Bot(env.TELEGRAM_BOT_TOKEN);

		await this.registerCommands();
		await this.startPolling();

		container.logger.info('[Telegram] Bot initialized successfully');
	}

	private async registerCommands() {
		if (!this.bot) {
			return;
		}

		// /pro-scorecard command
		this.bot.command('bobbypro_scorecard', async (ctx) => {
			console.log('Received /bobbypro_scorecard command');
			const args = ctx.message?.text?.split(' ').slice(1) ?? [];

			if (args.length < 2) {
				await ctx.reply(
					'Usage: /bobbypro_scorecard <cost-at-open> <credit-at-close> [mode]\n\n' +
						'Example: /bobbypro_scorecard 1000 1250\n\n' +
						'Parameters:\n' +
						'• cost-at-open: The cost at the opening of the trade\n' +
						'• credit-at-close: The credit at the closing of the trade\n' +
						'• mode: Display mode (dark or light, default: dark)'
				);
				return;
			}

			const costAtOpen = Number.parseFloat(args[0]);
			const creditAtClose = Number.parseFloat(args[1]);
			const mode = (args[2]?.toLowerCase() === 'light' ? 'light' : 'dark') as 'dark' | 'light';

			if (Number.isNaN(costAtOpen) || Number.isNaN(creditAtClose)) {
				await ctx.reply('Error: cost-at-open and credit-at-close must be valid numbers.');
				return;
			}

			try {
				validateTradeInput(costAtOpen, creditAtClose);
			} catch (error) {
				await ctx.reply(`Error: ${(error as Error).message}`);
				return;
			}

			const username = ctx.from?.username ?? ctx.from?.first_name ?? 'Unknown';
			const profitLoss = calculateProfitLoss(costAtOpen, creditAtClose);
			const roiPercent = calculateROI(costAtOpen, profitLoss);

			try {
				const buffer = await generateScoreCardImage(
					{
						discordHandle: username,
						mode,
						profitLoss,
						roiPercent,
						security: 'SPY'
					},
					'telegram'
				);

				console.log(ctx.chat);

				void saveTradeToSpreadsheet({
					discordHandle: username,
					costAtOpen,
					creditAtClose,
					profitLoss,
					roiPercent,
					security: 'SPY',
					source: 'Telegram',
					channelName: `@${ctx.chat.title ?? ctx.chat.username ?? ctx.chat.id.toString()}`
				});

				await ctx.replyWithPhoto(new InputFile(buffer, 'pro-scorecard.png'));
			} catch (error) {
				container.logger.error('[Telegram] Error generating scorecard:', error);
				await ctx.reply('Error generating scorecard. Please try again later.');
			}
		});

		this.bot.on('message', (ctx) => ctx.reply('Got another message!'));

		// Set bot commands menu
		void this.bot.api.setMyCommands([
			{ command: 'bobbypro_scorecard', description: 'Generate a trade score card' }
		]);
	}

	private async startPolling() {
		if (!this.bot) {
			return;
		}

		void this.bot.start({
			onStart: () => {
				container.logger.info('[Telegram] Bot started polling for updates');
			}
		});

		// Handle errors
		this.bot.catch((error) => {
			container.logger.error('[Telegram] Bot error:', error);
		});
	}

	public async sendSignal(data: SignalData): Promise<boolean> {
		if (!this.bot || !this.chatId) {
			return false;
		}

		try {
			const message = this.formatSignalMessage(data);
			const disclaimer =
				'⚠️ <b>Risk Disclaimer:</b> Bobby Trend Score is for informational purposes only and not financial advice. Trading involves substantial risk. Past performance does not guarantee future results.';

			await this.bot.api.sendMessage(this.chatId, `${message}\n\n${disclaimer}`, {
				parse_mode: 'HTML'
			});

			container.logger.debug('[Telegram] Signal sent successfully');
			return true;
		} catch (error) {
			container.logger.error('[Telegram] Error sending signal:', error);
			return false;
		}
	}

	public async sendScheduledMessage(message: string): Promise<boolean> {
		if (!this.bot || !this.chatId) {
			return false;
		}

		try {
			// Format as HTML for Telegram
			const formattedMessage = `ℹ️ ${this.escapeHtml(message)}`;

			await this.bot.api.sendMessage(this.chatId, formattedMessage, {
				parse_mode: 'HTML'
			});

			container.logger.debug('[Telegram] Scheduled message sent successfully');
			return true;
		} catch (error) {
			container.logger.error('[Telegram] Error sending scheduled message:', error);
			return false;
		}
	}

	private formatSignalMessage(data: SignalData): string {
		const lines = [
			`<b>Trend:</b> ${this.escapeHtml(data.trend)}`,
			`<b>Trend Score:</b> ${data.trendScore}`,
			`<b>Trend Lock Activated:</b> ${this.escapeHtml(data.trendLockActivated)}`,
			`<b>Securities:</b> ${this.escapeHtml(data.securities)}`,
			`<b>Morning Breaker Entry:</b> ${data.morningBreakerEntry}`
		];

		if (data.morningBreakerEntry === 'ON') {
			if (data.stop) {
				lines.push(`<b>Stop:</b> ${this.escapeHtml(data.stop)}`);
			}
			if (data.entry) {
				lines.push(`<b>Entry:</b> ${this.escapeHtml(data.entry)}`);
			}
			if (data.target) {
				lines.push(`<b>Target:</b> ${this.escapeHtml(data.target)}`);
			}
		}

		lines.push(`<b>Reverse Signal Detected?:</b> ${data.reverseSignalDetected}`);

		return lines.join('\n');
	}

	private escapeHtml(text: string): string {
		return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
	}

	public isEnabled(): boolean {
		return this.bot !== null && this.chatId !== null;
	}

	public async stop(): Promise<void> {
		if (this.bot) {
			await this.bot.stop();
			container.logger.info('[Telegram] Bot stopped');
		}
	}
}

export const telegramService = new TelegramService();
