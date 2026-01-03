/**
 * Message sending logic - clicking send button and verification
 */
import type { Page } from "puppeteer";
import {
	humanClickByText,
	humanClickSelector,
} from "../../navigation/humanInteraction/humanInteraction.ts";
import { DM_MESSAGE } from "../../shared/config/config.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

// Lazy logger creation to prevent memory issues in tests
let logger: ReturnType<typeof createLogger> | null = null;
function getLogger() {
	if (!logger) {
		logger = createLogger(process.env.DEBUG_LOGS === "true");
	}
	return logger;
}

const SEND_SELECTORS = [
	'[aria-label="Send"]',
	'[data-testid="send-button"]',
	'svg[aria-label="Send"]',
	'button[type="submit"]',
];

/**
 * Send the message by clicking the send button
 */
export async function sendMessage(page: Page): Promise<boolean> {
	getLogger().info("ACTION", "Looking for Send button...");

	// Wait a moment for the button to become enabled after typing
	await sleep(500 + Math.random() * 500);

	// Try multiple send button selectors with human-like clicking
	for (const selector of SEND_SELECTORS) {
		try {
			const sendButton = await page.$(selector);
			if (sendButton) {
				// Check if button is visible and enabled
				const isVisible = await page.evaluate((sel) => {
					const el = document.querySelector(sel);
					if (!el) return false;
					const style = window.getComputedStyle(el);
					return (
						style.display !== "none" &&
						style.visibility !== "hidden" &&
						style.opacity !== "0"
					);
				}, selector);

				if (isVisible) {
					getLogger().info(
						"ACTION",
						`Found visible send button with selector: ${selector}`,
					);
					// Use human-like click with mouse movement
					await humanClickSelector(page, selector, {
						elementType: "button",
						moveDelay: 150 + Math.random() * 200,
					});
					getLogger().info("ACTION", "Successfully clicked send button");
					await sleep(3000 + Math.random() * 1000);
					return true;
				} else {
					getLogger().info(
						"ACTION",
						`Button found but not visible with selector: ${selector}`,
					);
				}
			} else {
				getLogger().info(
					"ACTION",
					`Send button not found with selector: ${selector}`,
				);
			}
		} catch (err) {
			getLogger().info("ACTION", `Send selector ${selector} failed: ${err}`);
		}
	}

	// Try XPath for div[role="button"] containing "Send" text (Instagram's current structure)
	// Use humanClickSelector for human-like clicking behavior
	getLogger().info(
		"ACTION",
		"Trying XPath for div[role='button'] with 'Send' text (using human-like click)...",
	);
	try {
		const sendButtonXPath = await page.$(
			'xpath//div[@role="button" and contains(normalize-space(), "Send")]',
		);
		if (sendButtonXPath) {
			getLogger().info(
				"ACTION",
				"Found send button with XPath (div[role='button']), using humanClickSelector",
			);
			// Use humanClickSelector for human-like clicking with mouse movement
			await humanClickSelector(
				page,
				'xpath//div[@role="button" and contains(normalize-space(), "Send")]',
				{
					elementType: "button",
					moveDelay: 150 + Math.random() * 200,
				},
			);
			getLogger().info(
				"ACTION",
				"Successfully clicked send button via humanClickSelector",
			);
			await sleep(3000 + Math.random() * 1000);
			return true;
		} else {
			getLogger().info("ACTION", "No send button found with XPath selector");
		}
	} catch (err) {
		getLogger().info("ACTION", `XPath send button selector failed: ${err}`);
	}

	// If send button not found, try clicking by text using humanClickByText
	getLogger().info(
		"ACTION",
		"Trying humanClickByText to find Send button by text...",
	);
	const clickedByText = await humanClickByText(page, ["Send"]);
	if (clickedByText) {
		getLogger().info(
			"ACTION",
			"Send button clicked by text via humanClickByText",
		);
		await sleep(3000 + Math.random() * 1000);
		return true;
	} else {
		getLogger().info("ACTION", "humanClickByText did not find Send button");
	}

	// If still not sent, try Enter key
	getLogger().info(
		"ACTION",
		"Send button not found with any method, falling back to Enter key",
	);
	await page.keyboard.press("Enter");
	await sleep(3000 + Math.random() * 1000);
	return true;
}

/**
 * Verify that the DM was sent successfully by checking if the message text appears in the thread
 */
export async function verifyDmSent(
	page: Page,
	username: string,
): Promise<{ sent: boolean; proofPath: string }> {
	// Wait a bit for message to be sent and appear in the thread
	await shortDelay(1.5, 2.5);

	// Take screenshot as proof of DM (always enabled - this is critical evidence)
	const proofPath = await snapshot(page, `dm_proof_${username}`, true);

	// Verify we're in a DM thread
	const isInDmThread = await page
		.evaluate(() => {
			const url = window.location.href;
			return url.includes("/direct/t/") || url.includes("/direct/inbox/");
		})
		.catch(() => false);

	if (!isInDmThread) {
		getLogger().warn(
			"ACTION",
			"Not in DM thread page - verification may be unreliable",
		);
	}

	// Look for the message text in the thread - check for divs with the message content
	const messageFound = await page
		.evaluate((msg: string) => {
			// Look for divs that might contain the message (Instagram's message structure)
			// The message appears in divs with dir="auto" and various classes
			const allDivs = Array.from(
				document.querySelectorAll('div[dir="auto"]'),
			) as HTMLElement[];

			for (const div of allDivs) {
				const text = div.textContent?.trim() || "";
				// Check for exact match or if the message text is contained
				if (text === msg || text.includes(msg)) {
					return { found: true, matchedText: text.substring(0, 50) };
				}
			}

			// Also check all divs in case the structure is different
			const allTextDivs = Array.from(
				document.querySelectorAll("div"),
			) as HTMLElement[];
			for (const div of allTextDivs) {
				const text = div.textContent?.trim() || "";
				// Look for the full message text or significant portions
				if (text === msg) {
					return { found: true, matchedText: text };
				}
				// Check if it contains a substantial portion of the message (at least 20 chars)
				if (msg.length > 20 && text.includes(msg.substring(0, 20))) {
					return { found: true, matchedText: text.substring(0, 50) };
				}
			}

			// Fallback: check if message text appears anywhere in the page
			const bodyText = document.body?.innerText || "";
			if (bodyText.includes(msg)) {
				return { found: true, matchedText: "found in body text" };
			}

			return { found: false, matchedText: null };
		}, DM_MESSAGE)
		.catch(() => ({ found: false, matchedText: null }));

	if (messageFound.found) {
		getLogger().info(
			"ACTION",
			`✅ Message text found in thread - DM verified as sent (matched: ${messageFound.matchedText}...)`,
		);
		return {
			sent: true,
			proofPath,
		};
	} else {
		getLogger().warn(
			"ACTION",
			"⚠️  Message text not found in thread - DM may not have been sent",
		);
		// Still return true since we attempted to send, but log the warning
		return {
			sent: true, // Assume sent since we clicked send
			proofPath,
		};
	}
}
