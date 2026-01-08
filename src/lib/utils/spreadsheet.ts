import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { env } from '#root/config';

export interface TradeData {
	channelName: string;
	costAtOpen: number;
	creditAtClose: number;
	discordHandle: string;
	profitLoss: number;
	roiPercent: number;
	security: string;
	source?: string;
}

let doc: GoogleSpreadsheet | null = null;

async function getSpreadsheet(): Promise<GoogleSpreadsheet> {
	if (doc) {
		return doc;
	}

	const serviceAccountAuth = new JWT({
		email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
		key: env.GOOGLE_PRIVATE_KEY.replaceAll('\\n', '\n'),
		scopes: ['https://www.googleapis.com/auth/spreadsheets']
	});

	doc = new GoogleSpreadsheet(env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
	await doc.loadInfo();

	return doc;
}

export async function saveTradeToSpreadsheet(data: TradeData): Promise<void> {
	const spreadsheet = await getSpreadsheet();

	const existingSheet = spreadsheet.sheetsByIndex[0];

	const sheet =
		existingSheet ??
		(await spreadsheet.addSheet({
			headerValues: [
				'Handle',
				'Cost @ Open',
				'Credit @ Close',
				'Profit/Loss',
				'ROI %',
				'Security',
				'Date',
				'Source',
				'Channel Name'
			]
		}));

	await sheet.loadHeaderRow().catch(async () => {
		await sheet.setHeaderRow([
			'Handle',
			'Cost @ Open',
			'Credit @ Close',
			'Profit/Loss',
			'ROI %',
			'Security',
			'Date',
			'Source',
			'Channel Name'
		]);
	});

	await sheet.addRow({
		Handle: data.discordHandle,
		'Cost @ Open': data.costAtOpen,
		'Credit @ Close': data.creditAtClose,
		'Profit/Loss': data.profitLoss,
		'ROI %': data.roiPercent,
		Security: data.security,
		Date: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
		Source: data.source ?? 'Discord',
		'Channel Name': data.channelName
	});
}
