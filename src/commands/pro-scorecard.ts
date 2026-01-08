import { Command } from '@sapphire/framework';
import { AttachmentBuilder } from 'discord.js';
import { sendError } from '#utils/responses';
import { calculateProfitLoss, calculateROI, validateTradeInput } from '#utils/trades';
import { generateScoreCardImage } from '#utils/canvas';
import { saveTradeToSpreadsheet } from '#utils/spreadsheet';

export class ProScoreCardCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		await interaction.deferReply();

		const costAtOpen = interaction.options.getNumber('cost-at-open', true);
		const creditAtClose = interaction.options.getNumber('credit-at-close', true);

		try {
			validateTradeInput(costAtOpen, creditAtClose);
		} catch (error) {
			return sendError(interaction, (error as Error).message);
		}

		const mode = interaction.options.getString('mode') ?? 'dark';
		const profitLoss = calculateProfitLoss(costAtOpen, creditAtClose);
		const roiPercent = calculateROI(costAtOpen, profitLoss);

		const buffer = await generateScoreCardImage({
			discordHandle: interaction.user.username,
			mode: mode as 'dark' | 'light',
			profitLoss,
			roiPercent,
			security: 'SPY'
		});

		const attachment = new AttachmentBuilder(buffer, { name: 'pro-scorecard.png' });
		await interaction.editReply({ files: [attachment] });

		// Save trade data to Google Spreadsheet
		await saveTradeToSpreadsheet({
			discordHandle: interaction.user.username,
			costAtOpen,
			creditAtClose,
			profitLoss,
			roiPercent,
			security: 'SPY',
			channelName: interaction.guild?.name ?? `@${interaction.user.username}`
		});
	}

	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((command) =>
			command
				.setName('bobbypro-scorecard')
				.setDescription('Generate a score card')
				.addNumberOption((option) =>
					option
						.setName('cost-at-open')
						.setDescription('The cost at the opening of the trade')
						.setRequired(true)
				)
				.addNumberOption((option) =>
					option

						.setName('credit-at-close')
						.setDescription('The credit at the closing of the trade')
						.setRequired(true)
				)
				.addStringOption((option) =>
					option
						.setName('mode')
						.setDescription('Display mode for the scorecard')
						.addChoices({ name: 'Dark (default)', value: 'dark' }, { name: 'Light', value: 'light' })
						.setRequired(false)
				)
		);
	}
}
