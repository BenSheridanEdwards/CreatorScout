/**
 * Message input handling - finding input field and typing message
 */
import type { Page } from "puppeteer";
import { DM_MESSAGE } from "../../shared/config/config.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import {
	humanTypeText,
	humanClickElement,
	moveMouseToElement,
} from "../../timing/humanize/humanize.ts";
import { handleInstagramPopups } from "./popupHandler.ts";

// Lazy logger creation to prevent memory issues in tests
let logger: ReturnType<typeof createLogger> | null = null;
function getLogger() {
	if (!logger) {
		logger = createLogger(process.env.DEBUG_LOGS === "true");
	}
	return logger;
}

const MESSAGE_SELECTORS = [
	'div[role="textbox"][data-lexical-editor="true"][aria-label="Message"]',
	'div[role="textbox"][aria-label="Message"]',
	'div[contenteditable="true"][aria-label="Message"]',
	'div[role="textbox"][data-lexical-editor="true"]',
	'[contenteditable="true"]',
	'[aria-label*="Message"]',
	'div[data-lexical-editor="true"]',
	'textarea[placeholder*="Message"]',
	'div[contenteditable="true"][aria-label*="Message"]',
	".x1i10hfl textarea",
	".x1i10hfl div[contenteditable]",
];

/**
 * Find the message input field on the DM page
 */
export async function findMessageInput(page: Page): Promise<string | null> {
	// Wait a bit more for message input to appear with human-like delay
	await sleep(2000 + Math.random() * 1500); // 2-3.5 seconds

	// Popups like "Turn on Notifications" often appear a moment after the thread
	// opens. Make sure we clear them *again* right before we try to find the
	// message input so they don't block clicks/typing.
	await handleInstagramPopups(page);

	for (const selector of MESSAGE_SELECTORS) {
		try {
			// Wait for selector to appear
			await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
			const messageInput = await page.$(selector);
			if (messageInput) {
				getLogger().info(
					"ACTION",
					`Found message input with selector: ${selector}`,
				);
				return selector;
			}
		} catch (err) {
			getLogger().info("ACTION", `Selector ${selector} failed: ${err}`);
			continue;
		}
	}

	return null;
}

/**
 * Type message into the input field with human-like behavior
 */
export async function typeMessage(
	page: Page,
	selector: string,
	username: string,
): Promise<boolean> {
	try {
		// Move mouse to input with human-like movement
		await moveMouseToElement(page, selector, {
			offsetX: 10 + Math.random() * 20,
			offsetY: 5 + Math.random() * 10,
			duration: 500 + Math.random() * 250, // Slower for inputs
		});

		// Hover before clicking
		await sleep(200 + Math.random() * 300);

		// Click to focus
		await humanClickElement(page, selector, {
			elementType: "input",
			hoverDelay: 100 + Math.random() * 200,
		});

		await sleep(500 + Math.random() * 500);

		// Clear any existing text
		await page.keyboard.down("Control");
		await page.keyboard.press("a");
		await page.keyboard.up("Control");
		await sleep(200 + Math.random() * 200);

		// Type the message with human-like typing
		await humanTypeText(page, selector, DM_MESSAGE, {
			typeDelay: 80 + Math.random() * 100, // 80-180ms between chars
			wordPause: 150 + Math.random() * 200, // 150-350ms between words
			mistakeRate: 0, // No typos for important messages
		});

		await sleep(1500 + Math.random() * 1000); // 1.5-2.5 seconds after typing

		// Safety: verify that some of our message text is actually present
		// in the composer before attempting to send. No text = no send.
		const textPresent = await page
			.evaluate(
				(sel, msg) => {
					const el = document.querySelector(sel);
					if (!el) return false;
					const text = (el.textContent || "").toLowerCase();
					if (!text.trim()) return false;
					const words = msg.toLowerCase().split(" ");
					return words.some((w) => w && text.includes(w));
				},
				selector,
				DM_MESSAGE,
			)
			.catch(() => false);

		if (!textPresent) {
			getLogger().warn(
				"ACTION",
				"DM composer appears empty after typing; skipping send to avoid blank message",
			);
			await snapshot(page, `dm_no_text_${username}`);
			return false;
		}

		return true;
	} catch (err) {
		getLogger().info("ACTION", `Failed to type message: ${err}`);
		return false;
	}
}

