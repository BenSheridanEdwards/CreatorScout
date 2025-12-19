import type { Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanLikeClickHandle } from "../humanClick/humanClick.ts";

/**
 * Click the first button that matches any provided text.
 * Supports both button elements and div[role="button"] elements.
 */
export async function clickAny(page: Page, texts: string[]): Promise<boolean> {
	for (const t of texts) {
		// Try button elements first
		const buttonHandle = await page.$(
			`xpath//button[contains(normalize-space(), "${t}")]`,
		);
		if (buttonHandle) {
			await humanLikeClickHandle(page, buttonHandle);
			await sleep(200);
			return true;
		}

		// Try div[role="button"] elements (Instagram's current structure)
		const divHandle = await page.$(
			`xpath//div[@role="button" and contains(normalize-space(), "${t}")]`,
		);
		if (divHandle) {
			await humanLikeClickHandle(page, divHandle);
			await sleep(200);
			return true;
		}
	}
	return false;
}
