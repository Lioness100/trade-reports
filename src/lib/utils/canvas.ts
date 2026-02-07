import { loadImage, createCanvas, registerFont } from 'canvas';

interface ScoreCardOptions {
	discordHandle: string;
	mode: 'dark' | 'light';
	profitLoss: number;
	roiPercent: number;
	security: string;
}

registerFont('assets/Inter-Regular.ttf', { family: 'Inter', weight: '400' });
registerFont('assets/Inter-SemiBold.ttf', { family: 'Inter', weight: '600' });
registerFont('assets/Inter-Bold.ttf', { family: 'Inter', weight: '700' });

export async function generateScoreCardImage(
	options: ScoreCardOptions,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	service: 'discord' | 'telegram' = 'discord'
): Promise<Buffer> {
	const { mode, profitLoss, roiPercent, security, discordHandle } = options;
	const templatePath = mode === 'dark' ? `assets/dark-rocket.png` : `assets/light-rocket.png`;
	const templateImage = await loadImage(templatePath);

	const canvasWidth = templateImage.width;
	const canvasHeight = templateImage.height;

	const canvas = createCanvas(canvasWidth, canvasHeight);
	const ctx = canvas.getContext('2d');

	ctx.drawImage(templateImage, 0, 0, canvasWidth, canvasHeight);

	ctx.textBaseline = 'top';
	ctx.fillStyle = mode === 'dark' ? '#FFFFFF' : '#7d7f85';

	const date = new Date();
	const dateString = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
	ctx.font = '400 42px Inter';
	ctx.fillText(dateString, 175, 175);

	ctx.font = '700 160px Inter';
	ctx.fillStyle = mode === 'dark' ? '#FFFFFF' : '#575e69';
	const formattedPL = `${profitLoss >= 0 ? '+' : '−'}${Math.abs(profitLoss).toLocaleString()}`;
	ctx.fillText(formattedPL, 170, 280);

	ctx.fillStyle = mode === 'dark' ? '#FFFFFF' : '#7d7f85';
	ctx.font = '600 40px Inter';
	const formattedROI = `ROI ${roiPercent >= 0 ? '+' : '−'}${Math.abs(roiPercent).toFixed(0)}%`;
	ctx.fillText(formattedROI, 160, 540);

	ctx.font = '400 36px Inter';
	ctx.fillText(`Securities: ${security}`, 160, 610);

	ctx.font = '400 34px Inter';
	ctx.fillText(`Bobby Trader`, 230, 688);

	return canvas.toBuffer();
}
