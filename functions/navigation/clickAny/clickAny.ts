import type { Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanLikeClickHandle } from "../humanClick/humanClick.ts";

/**
 * Click the first button that matches any provided text.
 */
export async function clickAny(page: Page, texts: string[]): Promise<boolean> {
	for (const t of texts) {
		const handle = await page.$(
			`xpath//button[contains(normalize-space(), "${t}")]`,
		);
		if (handle) {
			await humanLikeClickHandle(page, handle);
			await sleep(200);
			return true;
		}
	}
	return false;
}
