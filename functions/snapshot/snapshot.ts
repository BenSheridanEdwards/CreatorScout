import fs from 'node:fs/promises';
import type { Page } from 'puppeteer';

export async function snapshot(page: Page, label: string): Promise<string> {
  await fs.mkdir('tmp', { recursive: true });
  const ts = Date.now();
  const file = `tmp/${label}-${ts}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
