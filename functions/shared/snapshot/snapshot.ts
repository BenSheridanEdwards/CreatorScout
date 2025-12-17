import fs from "node:fs/promises";
import type { Page } from "puppeteer";

export async function snapshot(page: Page, label: string): Promise<string> {
	await fs.mkdir("tmp", { recursive: true });
	const ts = Date.now();
	// Store screenshots as base64 text so they survive restricted environments.
	// Decode locally with: base64 -d <file> > out.png
	const file = `tmp/${label}-${ts}.png.base64`;
	const shot = (await page.screenshot({ fullPage: true })) as unknown;
	const buf = Buffer.isBuffer(shot) ? shot : Buffer.from(String(shot ?? ""), "utf8");
	await fs.writeFile(file, buf.toString("base64"), "utf8");
	return file;
}
