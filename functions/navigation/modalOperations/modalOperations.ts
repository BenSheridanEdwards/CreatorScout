/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanLikeClickHandle } from "../humanClick/humanClick.ts";

/**
 * Open the "Following" modal for a profile.
 * Uses multiple selector strategies and fallback logic for robustness.
 */
export async function openFollowingModal(page: Page): Promise<boolean> {
	const selectors = ['a[href$="/following/"]', 'a[href$="/following"]'];
	for (const sel of selectors) {
		try {
			const handle = await page.$(sel);
			if (handle) {
				await humanLikeClickHandle(page, handle);
				await sleep(3000);
				return true;
			}
		} catch {}
	}

	// Fallback: use page.evaluate to find and click
	try {
		const clicked = await page.evaluate(() => {
			const links = Array.from(document.querySelectorAll("a"));
			for (const link of links) {
				const href = link.getAttribute("href") || "";
				if (href.includes("/following")) {
					(link as HTMLElement).click();
					return true;
				}
			}
			for (const link of links) {
				const text = link.textContent?.toLowerCase() || "";
				if (text.includes("following") && !text.includes("followers")) {
					(link as HTMLElement).click();
					return true;
				}
			}
			return false;
		});
		if (clicked) {
			await sleep(3000);
			return true;
		}
	} catch {
		// Ignore errors
	}

	return false;
}

/**
 * Extract usernames from the following modal.
 * Returns array of usernames (without @ symbol).
 * Uses multiple selector variants for robustness.
 */
export async function extractFollowingUsernames(
	page: Page,
	batchSize: number = 10,
): Promise<string[]> {
	try {
		await page.waitForSelector('div[role="dialog"] a[href^="/"]', {
			timeout: 15000,
		});
	} catch {
		return [];
	}

	// Small initial scroll to ensure content is loaded
	await scrollFollowingModal(page, 600);

	const selectorVariants = [
		'div[role="dialog"] a[href^="/"]',
		'div[role="dialog"] a[role="link"][href^="/"]',
		'div[role="dialog"] ul > li a[href^="/"]',
		'div[role="dialog"] li a[href^="/"]',
	];

	for (const sel of selectorVariants) {
		const items = await page.$$(sel);
		if (items?.length) {
			const usernames: string[] = [];
			for (const item of items) {
				const href = await item.evaluate((el: Element) =>
					el.getAttribute("href"),
				);
				if (href?.startsWith("/") && href.split("/").length === 3) {
					const username = href.replace(/\//g, "");
					if (username && !username.startsWith("explore")) {
						usernames.push(username);
					}
				}
				if (usernames.length >= batchSize) break;
			}
			if (usernames.length) return usernames;
		}
	}
	return [];
}

/**
 * Scroll the following modal to load more profiles.
 * @param page - Puppeteer page instance
 * @param scrollAmount - Amount to scroll in pixels (default: 600)
 */
export async function scrollFollowingModal(
	page: Page,
	scrollAmount: number = 600,
): Promise<void> {
	try {
		await page.evaluate((amount) => {
			const modal = document.querySelector(
				'div[role="dialog"] div[style*="overflow"]',
			);
			if (modal) {
				(modal as HTMLElement).scrollTop += amount;
			}
		}, scrollAmount);
		await sleep(400);
	} catch {
		// Could not scroll modal
	}
}
