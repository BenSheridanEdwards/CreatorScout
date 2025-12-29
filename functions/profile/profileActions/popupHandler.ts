/**
 * Handle Instagram popups and error pages (notifications, reload prompts, etc.)
 */
import type { Page } from "puppeteer";
import { clickAny } from "../../navigation/clickAny/clickAny.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

// Lazy logger creation to prevent memory issues in tests
let logger: ReturnType<typeof createLogger> | null = null;
function getLogger() {
	if (!logger) {
		logger = createLogger(process.env.DEBUG_LOGS === "true");
	}
	return logger;
}

/**
 * Helper that clicks any button-like element (button or div[role="button"])
 * whose visible text contains one of the provided labels.
 * Uses human-like clicking instead of direct .click() to avoid bot detection.
 */
async function clickButtonLikeByText(
	page: Page,
	labels: string[],
): Promise<boolean> {
	// Find the element using the original logic
	const elementInfo = await page.evaluate((texts) => {
		const candidates = Array.from(
			document.querySelectorAll('button, div[role="button"]'),
		);
		for (const el of candidates) {
			const text = (el.textContent || "").trim().toLowerCase();
			if (texts.some((label) => text.includes(label.toLowerCase()))) {
				// Return element info for human-like clicking
				return {
					found: true,
					tagName: el.tagName.toLowerCase(),
					text: text,
					index: Array.from(el.parentElement?.children || []).indexOf(el),
				};
			}
		}
		return { found: false };
	}, labels);

	if (!elementInfo.found) {
		return false;
	}

	// Find the element handle using the same selector logic
	const candidates = await page.$$('button, div[role="button"]');
	for (const candidate of candidates) {
		const text = await candidate.evaluate((el) =>
			(el.textContent || "").trim().toLowerCase(),
		);
		if (labels.some((label) => text.includes(label.toLowerCase()))) {
			// Use human-like clicking instead of direct .click()
			const { humanLikeClickHandle } = await import(
				"../../navigation/humanClick/humanClick.ts"
			);
			await humanLikeClickHandle(page, candidate);
			return true;
		}
	}

	return false;
}

/**
 * Handle Instagram popups and error pages (notifications, reload prompts, etc.)
 */
export async function handleInstagramPopups(page: Page): Promise<void> {
	// Handle "The messaging tab has a new look" popup
	// Check for the specific popup text first
	const hasMessagingTabPopup = await page.evaluate(() => {
		const bodyText = document.body?.innerText || "";
		return bodyText.includes("The messaging tab has a new look") ||
			bodyText.includes("messaging tab has a new look") ||
			bodyText.includes("You can now go to your inbox by tapping this icon");
	});

	if (hasMessagingTabPopup) {
		const messagingTabDismissed =
			(await clickButtonLikeByText(page, ["ok", "got it", "dismiss"])) ||
			(await clickAny(page, ["OK", "Got it", "Got It", "Dismiss"]));
		if (messagingTabDismissed) {
			getLogger().info("ACTION", "Dismissed messaging tab popup");
			await sleep(1000 + Math.random() * 1000);
		}
	}

	// Handle "Turn on Notifications" popup
	const notificationDismissed =
		(await clickButtonLikeByText(page, [
			"Not Now",
			"Cancel",
			"close",
			"turn on notifications",
		])) || (await clickAny(page, ["Not Now", "Not now", "Cancel", "Close"]));
	if (notificationDismissed) {
		getLogger().info("ACTION", "Dismissed notification popup");
		await sleep(1000 + Math.random() * 1000);
	}

	// Handle "Reload page" button if error page appears
	const reloadClicked =
		(await clickButtonLikeByText(page, ["reload page", "reload"])) ||
		(await clickAny(page, ["Reload page", "Reload"]));
	if (reloadClicked) {
		getLogger().info("ACTION", "Clicked reload page button");
		await sleep(3000 + Math.random() * 2000);
		// Try handling popups again after reload
		await handleInstagramPopups(page);
	}
}
