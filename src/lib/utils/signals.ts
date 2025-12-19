/* eslint-disable require-atomic-updates */
import { GoogleSpreadsheet, type GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { env } from '#root/config';

export interface SignalData {
	entry?: string;
	morningBreakerEntry: 'ON' | 'OFF';
	ready: boolean;
	reverseSignalDetected: 'YES' | 'NO';
	securities: string;
	stop?: string;
	target?: string;
	trend: string;
	trendLockActivated: string;
	trendScore: number;
}

const SIGNALS_SHEET_NAME = 'Signals';
const SIGNALS_HEADERS = [
	'Ready',
	'Trend',
	'Trend Score',
	'Trend Lock Activated',
	'Securities',
	'Morning Breaker Entry',
	'Stop',
	'Entry',
	'Target',
	'Reverse Signal Detected',
	'Sent'
];

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

export async function getOrCreateSignalsSheet(): Promise<GoogleSpreadsheetWorksheet> {
	const spreadsheet = await getSpreadsheet();

	const existingSheet = spreadsheet.sheetsByTitle[SIGNALS_SHEET_NAME];

	if (existingSheet) {
		await existingSheet.loadHeaderRow().catch(async () => {
			await existingSheet.setHeaderRow(SIGNALS_HEADERS);
		});
		return existingSheet;
	}

	return spreadsheet.addSheet({
		title: SIGNALS_SHEET_NAME,
		headerValues: SIGNALS_HEADERS
	});
}

export async function getReadySignals(): Promise<{ data: SignalData; rowIndex: number }[]> {
	const sheet = await getOrCreateSignalsSheet();
	const rows = await sheet.getRows();

	const readySignals: { data: SignalData; rowIndex: number }[] = [];

	for (const row of rows) {
		const ready = row.get('Ready');
		const sent = row.get('Sent');

		if (
			(ready === 'TRUE' || ready === true || ready === 'true') &&
			sent !== 'TRUE' &&
			sent !== true &&
			sent !== 'true'
		) {
			const morningBreakerEntry = row.get('Morning Breaker Entry') as 'ON' | 'OFF';

			const signalData: SignalData = {
				morningBreakerEntry,
				ready: true,
				reverseSignalDetected: row.get('Reverse Signal Detected') as 'YES' | 'NO',
				securities: row.get('Securities'),
				trend: row.get('Trend'),
				trendLockActivated: row.get('Trend Lock Activated'),
				trendScore: Number(row.get('Trend Score'))
			};

			if (morningBreakerEntry === 'ON') {
				signalData.stop = row.get('Stop');
				signalData.entry = row.get('Entry');
				signalData.target = row.get('Target');
			}

			readySignals.push({
				data: signalData,
				rowIndex: row.rowNumber
			});
		}
	}

	return readySignals;
}

export async function markSignalAsSent(rowIndex: number): Promise<void> {
	const sheet = await getOrCreateSignalsSheet();
	const rows = await sheet.getRows();

	const row = rows.find((r) => r.rowNumber === rowIndex);
	if (row) {
		row.set('Sent', 'TRUE');
		await row.save();
	}
}

export function formatSignalMessage(data: SignalData): string {
	const lines = [
		`**Trend:** ${data.trend}`,
		`**Trend Score:** ${data.trendScore}`,
		`**Trend Lock Activated:** ${data.trendLockActivated}`,
		`**Securities:** ${data.securities}`,
		`**Morning Breaker Entry:** ${data.morningBreakerEntry}`
	];

	if (data.morningBreakerEntry === 'ON') {
		if (data.stop) {
			lines.push(`**Stop:** ${data.stop}`);
		}
		if (data.entry) {
			lines.push(`**Entry:** ${data.entry}`);
		}
		if (data.target) {
			lines.push(`**Target:** ${data.target}`);
		}
	}

	lines.push(`**Reverse Signal Detected?:** ${data.reverseSignalDetected}`);

	return lines.join('\n');
}

export interface ScheduledMessages {
	closing: string;
	midnight: string;
	weekend: string;
}

const MESSAGES_SHEET_NAME = 'Messages';
const MESSAGES_HEADERS = ['Type', 'Message'];
const DEFAULT_MESSAGES: ScheduledMessages = {
	closing: 'Bobby Trend Score reopens at 9:30am ET on {nextBusinessDay}.',
	midnight: 'Bobby Trend Score will open at 9:30am ET today.',
	weekend: 'Bobby is resting, see you on Monday morning. Bobby Trend Score reopens at 9:30am ET on {nextBusinessDay}.'
};

export async function getScheduledMessages(): Promise<ScheduledMessages> {
	console.log(4);
	const spreadsheet = await getSpreadsheet();
	console.log(5);
	let sheet = spreadsheet.sheetsByTitle[MESSAGES_SHEET_NAME];

	if (!sheet) {
		console.log(6);
		sheet = await spreadsheet.addSheet({
			title: MESSAGES_SHEET_NAME,
			headerValues: MESSAGES_HEADERS
		});
		console.log(7);

		await sheet.addRows([
			{ Type: 'closing', Message: DEFAULT_MESSAGES.closing },
			{ Type: 'midnight', Message: DEFAULT_MESSAGES.midnight },
			{ Type: 'weekend', Message: DEFAULT_MESSAGES.weekend }
		]);
		console.log(8);

		return { ...DEFAULT_MESSAGES };
	}

	console.log(9);
	await sheet.loadHeaderRow().catch(async () => {
		console.log(10);
		await sheet.setHeaderRow(MESSAGES_HEADERS);
	});

	console.log(11);

	const rows = await sheet.getRows();
	console.log(12);
	const messages: ScheduledMessages = { ...DEFAULT_MESSAGES };
	const foundTypes = new Set<string>();

	for (const row of rows) {
		const type = row.get('Type') as keyof ScheduledMessages;
		const message = row.get('Message');

		if (type && message && type in DEFAULT_MESSAGES) {
			messages[type] = message;
			foundTypes.add(type);
		}
	}

	const missingTypes = Object.keys(DEFAULT_MESSAGES).filter((t) => !foundTypes.has(t));
	if (missingTypes.length > 0) {
		console.log(13);
		await sheet.addRows(
			missingTypes.map((type) => ({
				Type: type,
				Message: DEFAULT_MESSAGES[type as keyof ScheduledMessages]
			}))
		);
	}

	return messages;
}
