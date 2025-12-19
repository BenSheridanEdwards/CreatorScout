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
 */
async function clickButtonLikeByText(
	page: Page,
	labels: string[],
): Promise<boolean> {
	return await page.evaluate((texts) => {
		const candidates = Array.from(
			document.querySelectorAll('button, div[role="button"]'),
		);
		for (const el of candidates) {
			const text = (el.textContent || "").trim().toLowerCase();
			if (texts.some((label) => text.includes(label.toLowerCase()))) {
				(el as HTMLElement).click();
				return true;
			}
		}
		return false;
	}, labels);
}

/**
 * Handle Instagram popups and error pages (notifications, reload prompts, etc.)
 */
export async function handleInstagramPopups(page: Page): Promise<void> {
	// Handle "The messaging tab has a new look" popup
	const messagingTabDismissed =
		(await clickButtonLikeByText(page, ["ok", "got it", "dismiss"])) ||
		(await clickAny(page, ["OK", "Got it", "Got It", "Dismiss"]));
	if (messagingTabDismissed) {
		getLogger().info("ACTION", "Dismissed messaging tab popup");
		await sleep(1000 + Math.random() * 1000);
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

