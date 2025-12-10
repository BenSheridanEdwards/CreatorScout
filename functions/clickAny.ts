import type { Page } from 'puppeteer';
import { sleep } from './sleep.js';

/**
 * Click the first button that matches any provided text.
 */
export async function clickAny(page: Page, texts: string[]): Promise<boolean> {
  for (const t of texts) {
    const handle = await page.$(
      `xpath//button[contains(normalize-space(), "${t}")]`
    );
    if (handle) {
      await handle.click({ delay: 10 });
      await sleep(200);
      return true;
    }
  }
  return false;
}

