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
