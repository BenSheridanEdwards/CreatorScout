/**
 * Utility functions.
 */
import { mkdirSync } from "node:fs";
import type { Page } from "puppeteer";

export async function saveProof(username: string, page: Page): Promise<string> {
	mkdirSync("screenshots", { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const path = `screenshots/DM_${username}_${timestamp}.png`;
	await page.screenshot({ path, fullPage: true });
	return path;
}
