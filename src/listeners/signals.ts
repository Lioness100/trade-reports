import { TextChannel } from 'discord.js';
import { Events, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import {
	formatSignalMessage,
	getOrCreateSignalsSheet,
	getReadySignals,
	getScheduledMessages,
	markSignalAsSent
} from '#utils/signals';
import { createEmbed } from '#utils/responses';

const POLL_INTERVAL_MS = 30_000;
const CHECK_SCHEDULE_INTERVAL_MS = 60_000;

function getNextBusinessDay(date: Date = new Date()): string {
	const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const nextDay = new Date(date);
	nextDay.setDate(nextDay.getDate() + 1);

	if (nextDay.getDay() === 6) {
		nextDay.setDate(nextDay.getDate() + 2);
	} else if (nextDay.getDay() === 0) {
		nextDay.setDate(nextDay.getDate() + 1);
	}

	return days[nextDay.getDay()];
}

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class SignalsMonitorListener extends Listener<typeof Events.ClientReady> {
	private lastMessageSent: { date: string; type: string } | null = null;

	public async run() {
		await getOrCreateSignalsSheet();
		this.pollForSignals();
		this.pollScheduledMessages();
	}

	private pollForSignals() {
		setInterval(() => {
			void this.checkAndSendSignals();
		}, POLL_INTERVAL_MS);

		void this.checkAndSendSignals();
	}

	private pollScheduledMessages() {
		setInterval(() => {
			void this.checkAndSendScheduledMessages();
		}, CHECK_SCHEDULE_INTERVAL_MS);

		void this.checkAndSendScheduledMessages();
	}

	private getSignalsChannels() {
		const channels: TextChannel[] = [];

		for (const guild of this.container.client.guilds.cache.values()) {
			const channel = guild.channels.cache.find(
				(ch) => ch.name === 'bobbypro-signals' && ch instanceof TextChannel && ch.id === '1450998624572932388'
			) as TextChannel | undefined;

			if (channel) {
				channels.push(channel);
			}
		}

		return channels;
	}

	private async deleteLastStatusMessage(channel: TextChannel) {
		const messages = await channel.messages.fetch({ limit: 10 }).catch(console.error);
		if (!messages) {
			return;
		}

		const botMessage = messages.find(
			(msg) =>
				msg.author.id === this.container.client.user?.id &&
				msg.embeds.length > 0 &&
				msg.embeds[0].description?.startsWith('Bobby')
		);

		await botMessage?.delete().catch(() => null);
	}

	private async checkAndSendScheduledMessages() {
		const etTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
		const hours = etTime.getHours();
		const minutes = etTime.getMinutes();
		const dayOfWeek = etTime.getDay();
		const dateKey = etTime.toDateString();

		this.container.logger.debug(
			`[Signals] Checking scheduled messages - ET Time: ${hours}:${minutes}, Day: ${dayOfWeek}`
		);

		const channels = this.getSignalsChannels();
		if (channels.length === 0) {
			this.container.logger.debug('[Signals] No bobbypro-signals channels found in any server');
			return;
		}

		this.container.logger.debug(`[Signals] Found ${channels.length} signals channel(s) across servers`);

		let messageToSend: string | null = null;
		let messageType: string | null = null;

		if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 9 && minutes === 30) {
			this.container.logger.debug('[Signals] Market opening - deleting previous status messages');
			for (const channel of channels) {
				await this.deleteLastStatusMessage(channel);
			}

			return;
		}

		if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 11 && minutes === 33) {
			const nextBusinessDay = getNextBusinessDay(etTime);
			const messages = await getScheduledMessages();
			if (dayOfWeek === 5) {
				messageType = 'weekend';
				messageToSend = messages.weekend.replace('{nextBusinessDay}', nextBusinessDay);
			} else {
				messageType = 'closing';
				messageToSend = messages.closing.replace('{nextBusinessDay}', nextBusinessDay);
			}
			this.container.logger.debug(`[Signals] Prepared ${messageType} message: ${messageToSend}`);
		} else if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 0 && minutes === 0) {
			messageType = 'midnight';
			const messages = await getScheduledMessages();
			messageToSend = messages.midnight;
			this.container.logger.debug(`[Signals] Prepared ${messageType} message: ${messageToSend}`);
		}

		if (messageToSend && messageType) {
			const shouldSend =
				!this.lastMessageSent ||
				this.lastMessageSent.type !== messageType ||
				this.lastMessageSent.date !== dateKey;

			this.container.logger.debug(
				`[Signals] Should send ${messageType} message: ${shouldSend} (last: ${JSON.stringify(this.lastMessageSent)})`
			);

			if (shouldSend) {
				for (const channel of channels) {
					await this.deleteLastStatusMessage(channel);

					const embed = createEmbed(messageToSend).setColor(0x00_7a_cc);
					await channel.send({ embeds: [embed] }).catch(console.error);
					this.container.logger.debug(`[Signals] Sent ${messageType} message to ${channel.guild.name}`);
				}

				this.lastMessageSent = { type: messageType, date: dateKey };
			}
		}
	}

	private async checkAndSendSignals() {
		const readySignals = await getReadySignals();
		if (readySignals.length === 0) {
			return;
		}

		const channels = this.getSignalsChannels();
		if (channels.length === 0) {
			return;
		}

		for (const { data, rowIndex } of readySignals) {
			const signalMessage = formatSignalMessage(data);

			const disclaimerEmbed = createEmbed(
				'Risk Disclaimer: Bobby Trend Score is for informational purposes only and not financial advice. Trading involves substantial risk. Past performance does not guarantee future results.'
			).setColor(0xff_a5_00);

			for (const channel of channels) {
				await channel.send({ content: signalMessage, embeds: [disclaimerEmbed] }).catch(console.error);
			}

			await markSignalAsSent(rowIndex);
		}
	}
}
