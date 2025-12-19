import fs from "node:fs/promises";
import type { Page } from "puppeteer";

export async function snapshot(page: Page, label: string): Promise<string> {
	// Organize screenshots into date-based folders under a top-level screenshots directory:
	// screenshots/YYYY-MM-DD/<label>-<timestamp>.png
	const now = new Date();
	const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

	const baseDir = "screenshots";
	const dateDir = `${baseDir}/${date}`;

	await fs.mkdir(dateDir, { recursive: true });

	const ts = Date.now();
	const file = `${dateDir}/${label}-${ts}.png`;

	await page.screenshot({ path: file, fullPage: true });
	// Lightweight debug log so callers can see where the snapshot was saved
	// (avoid importing logger here to prevent circular dependencies)
	console.log(`📸 Snapshot saved: ${file}`);
	return file;
}

/**
 * Save a screenshot with a structured naming convention:
 * screenshots/YYYY-MM-DD/YYYY-MM-DD_TYPE_USERNAME_ACTION.png
 *
 * @param page - Puppeteer page instance
 * @param type - Type of action (e.g., "follow", "dm", "login")
 * @param username - Instagram username
 * @param action - Action result (e.g., "success", "failed", "error", "state")
 * @returns Path to the saved screenshot
 */
export async function saveScreenshot(
	page: Page,
	type: string,
	username: string,
	action: string,
): Promise<string> {
	const now = new Date();
	const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

	const baseDir = "screenshots";
	const dateDir = `${baseDir}/${date}`;

	await fs.mkdir(dateDir, { recursive: true });

	// Format: YYYY-MM-DD_TYPE_USERNAME_ACTION.png
	const filename = `${date}_${type}_${username}_${action}.png`;
	const file = `${dateDir}/${filename}`;

	await page.screenshot({ path: file, fullPage: true });
	return file;
}
