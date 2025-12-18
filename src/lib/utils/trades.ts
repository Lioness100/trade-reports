/**
 * Core math utilities for trade report calculations.
 * No API or Discord dependencies.
 */

export interface TradeInput {
	costAtOpen: number;
	creditAtClose: number;
}

export interface TradeResult {
	profitLoss: number;
	roiPercent: number;
}

export function validateTradeInput(costAtOpen: number, creditAtClose: number): void {
	if (!Number.isFinite(costAtOpen) || !Number.isFinite(creditAtClose)) {
		throw new TypeError('Inputs must be valid numbers');
	}

	if (costAtOpen <= 0) {
		throw new Error('Cost at open must be greater than 0');
	}
}

export function calculateProfitLoss(costAtOpen: number, creditAtClose: number): number {
	return creditAtClose - costAtOpen;
}

export function calculateROI(costAtOpen: number, profitLoss: number): number {
	return (profitLoss / costAtOpen) * 100;
}
