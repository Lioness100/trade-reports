import { TextChannel } from 'discord.js';
import { Events, Listener } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { formatSignalMessage, getOrCreateSignalsSheet, getReadySignals, markSignalAsSent } from '#utils/signals';
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
	private readonly lastStatusMessageIds = new Map<string, string>();
	private lastMessageSent: { date: string; type: string } | null = null;

	public async run() {
		await getOrCreateSignalsSheet()
			.then(() => {
				this.container.logger.info('[Signals] Successfully initialized signals sheet');
			})
			.catch((error) => {
				this.container.logger.error('[Signals] Failed to initialize signals sheet:', error);
			});

		this.container.logger.info(`[Signals] Starting to poll every ${POLL_INTERVAL_MS / 1000} seconds`);
		this.pollForSignals();

		this.container.logger.info('[Signals] Starting scheduled message checks');
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
				(ch) => ch.name === 'bobbypro-signals' && ch instanceof TextChannel
			) as TextChannel | undefined;

			if (channel) {
				channels.push(channel);
			}
		}

		return channels;
	}

	private async checkAndSendScheduledMessages() {
		const etTime = new Date();
		const hours = etTime.getHours();
		const minutes = etTime.getMinutes();
		const dayOfWeek = etTime.getDay();
		const dateKey = etTime.toDateString();

		const channels = this.getSignalsChannels();
		if (channels.length === 0) {
			return;
		}

		let messageToSend: string | null = null;
		let messageType: string | null = null;

		if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 9 && minutes === 30) {
			for (const channel of channels) {
				const lastMessageId = this.lastStatusMessageIds.get(channel.guild.id);
				if (lastMessageId) {
					const messageToDelete = await channel.messages.fetch(lastMessageId);
					await messageToDelete?.delete().catch(() => null);
				}
			}

			return;
		}

		if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 10 && minutes === 45) {
			const nextBusinessDay = getNextBusinessDay(etTime);
			if (dayOfWeek === 5) {
				messageType = 'weekend';
				messageToSend = `Bobby is resting, see you on Monday morning. Bobby Trend Score reopens at 9:30am ET on ${nextBusinessDay}.`;
			} else {
				messageType = 'closing';
				messageToSend = `Bobby Trend Score reopens at 9:30am ET on ${nextBusinessDay}.`;
			}
		} else if (dayOfWeek >= 1 && dayOfWeek <= 5 && hours === 0 && minutes === 0) {
			messageType = 'midnight';
			messageToSend = 'Bobby Trend Score will open at 9:30am ET today.';
		}

		if (messageToSend && messageType) {
			const shouldSend =
				!this.lastMessageSent ||
				this.lastMessageSent.type !== messageType ||
				this.lastMessageSent.date !== dateKey;

			if (shouldSend) {
				for (const channel of channels) {
					const lastMessageId = this.lastStatusMessageIds.get(channel.guild.id);
					if (lastMessageId) {
						const messageToDelete = await channel.messages.fetch(lastMessageId);
						await messageToDelete?.delete();
					}

					const embed = createEmbed(messageToSend).setColor(0x00_7a_cc);
					const sentMessage = await channel.send({ embeds: [embed] }).catch(() => null);
					if (!sentMessage) {
						continue;
					}

					this.lastStatusMessageIds.set(channel.guild.id, sentMessage.id);
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
				await channel.send({ content: signalMessage, embeds: [disclaimerEmbed] }).catch(() => null);
			}

			await markSignalAsSent(rowIndex);
		}
	}
}
