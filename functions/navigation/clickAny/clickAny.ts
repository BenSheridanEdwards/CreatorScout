import type { Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

/**
 * Click the first element that matches any provided text.
 * Supports button, a, div[role="button"], and span elements.
 */
export async function clickAny(page: Page, texts: string[]): Promise<boolean> {
	if (page.isClosed()) {
		throw new Error("Page is closed, cannot click elements");
	}

	logger.info("CLICK", `Looking for elements with text: ${texts.join(", ")}`);

	for (const text of texts) {
		try {
			// Method 1: Direct page.evaluate to find and click by text content
			const clicked = await page.evaluate((searchText) => {
				// Find all clickable elements
				const elements = document.querySelectorAll('button, a, [role="button"], span[role="link"]');
				for (const el of elements) {
					const elText = el.textContent?.trim();
					if (elText === searchText || elText?.toLowerCase() === searchText.toLowerCase()) {
						(el as HTMLElement).click();
						return { found: true, tagName: el.tagName, text: elText };
					}
				}
				return { found: false };
			}, text);

			if (clicked.found) {
				logger.info("CLICK", `✓ Clicked ${clicked.tagName} with text "${clicked.text}"`);
				await sleep(500);
				return true;
			}

			// Method 2: XPath for button
			const buttonHandle = await page.$(`xpath/.//button[normalize-space()="${text}"]`);
			if (buttonHandle) {
				await buttonHandle.click();
				logger.info("CLICK", `✓ Clicked button (xpath) with text "${text}"`);
				await sleep(500);
				return true;
			}

			// Method 3: XPath for anchor
			const anchorHandle = await page.$(`xpath/.//a[normalize-space()="${text}"]`);
			if (anchorHandle) {
				await anchorHandle.click();
				logger.info("CLICK", `✓ Clicked anchor (xpath) with text "${text}"`);
				await sleep(500);
				return true;
			}

			// Method 4: XPath for div role button
			const divHandle = await page.$(`xpath/.//div[@role="button"][normalize-space()="${text}"]`);
			if (divHandle) {
				await divHandle.click();
				logger.info("CLICK", `✓ Clicked div[role=button] (xpath) with text "${text}"`);
				await sleep(500);
				return true;
			}

		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (errorMsg.includes("Target closed") || errorMsg.includes("TargetCloseError")) {
				throw err;
			}
			logger.warn("CLICK", `Error trying to click "${text}": ${errorMsg}`);
		}
	}

	logger.info("CLICK", "No matching elements found");
	return false;
}
