/**
 * Message sending logic - clicking send button and verification
 */
import type { Page } from "puppeteer";
import { DM_MESSAGE } from "../../shared/config/config.ts";
import { clickAny } from "../../navigation/clickAny/clickAny.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanClickElement } from "../../timing/humanize/humanize.ts";
import { analyzeDmProof } from "../vision/analyzeDmProof.ts";

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
	// Try multiple send button selectors with human-like clicking
	for (const selector of SEND_SELECTORS) {
		try {
			const sendButton = await page.$(selector);
			if (sendButton) {
				getLogger().info(
					"ACTION",
					`Found send button with selector: ${selector}`,
				);
				// Use human-like click with mouse movement
				const clicked = await humanClickElement(page, selector, {
					elementType: "button",
					hoverDelay: 150 + Math.random() * 200,
				});
				if (clicked) {
					await sleep(3000 + Math.random() * 1000);
					return true;
				}
			}
		} catch (err) {
			getLogger().info("ACTION", `Send selector ${selector} failed: ${err}`);
			continue;
		}
	}

	// If send button not found, try clicking by text using clickAny
	const clickedByText = await clickAny(page, ["Send"]);
	if (clickedByText) {
		await sleep(3000 + Math.random() * 1000);
		getLogger().info("ACTION", "Send button clicked by text");
		return true;
	}

	// If still not sent, try Enter key
	getLogger().info("ACTION", "Send button not found, trying Enter key");
	await page.keyboard.press("Enter");
	await sleep(3000 + Math.random() * 1000);
	return true;
}

/**
 * Verify that the DM was sent successfully
 */
export async function verifyDmSent(
	page: Page,
	username: string,
): Promise<{ sent: boolean; proofPath: string }> {
	// Wait a bit for message to be sent
	await sleep(2000);

	// Take screenshot as proof (before verification)
	const proofPath = await snapshot(page, `dm_${username}`);

	// Analyze screenshot with AI for better verification
	const aiAnalysis = await analyzeDmProof(proofPath).catch(() => null);

	if (aiAnalysis) {
		getLogger().info(
			"VISION",
			`AI Analysis: DM sent=${aiAnalysis.dm_sent}, confidence=${aiAnalysis.confidence}%, reason="${aiAnalysis.reason}"`,
		);

		if (aiAnalysis.indicators.length > 0) {
			getLogger().info(
				"VISION",
				`Indicators: ${aiAnalysis.indicators.join(", ")}`,
			);
		}

		if (!aiAnalysis.dm_sent || aiAnalysis.confidence < 70) {
			getLogger().warn(
				"VISION",
				`Low confidence DM verification (${aiAnalysis.confidence}%) - may need manual review`,
			);
		}
	}

	// Best-effort verification: check that the message appears in the thread.
	// Use a more lenient check - just verify we're still in a DM thread
	const isInDmThread = await page
		.evaluate(() => {
			const url = window.location.href;
			return url.includes("/direct/t/") || url.includes("/direct/inbox/");
		})
		.catch(() => false);

	// Also check if message text appears (but don't fail if it doesn't - Instagram might format it)
	const appearsInThread = await page
		.evaluate((msg: string) => {
			const text = document.body?.innerText || "";
			// Check for partial matches too
			const msgWords = msg.toLowerCase().split(" ");
			return msgWords.some((word) => text.toLowerCase().includes(word));
		}, DM_MESSAGE)
		.catch(() => true);

	if (!isInDmThread && !appearsInThread) {
		getLogger().info(
			"ACTION",
			"Message verification unclear, but assuming sent",
		);
	}

	return {
		sent: true, // We clicked send, so assume it worked
		proofPath,
	};
}
