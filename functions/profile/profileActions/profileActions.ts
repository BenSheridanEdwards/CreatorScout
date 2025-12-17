/**
 * Profile actions - DM sending, following, queue expansion.
 */
import type { Page } from "puppeteer";
import {
	extractFollowingUsernames,
	openFollowingModal,
} from "../../navigation/modalOperations/modalOperations.ts";
import { DM_MESSAGE } from "../../shared/config/config.ts";
import { executeWithCircuitBreaker } from "../../shared/circuitBreaker/circuitBreaker.ts";
import { recordActivity } from "../../shared/dashboard/dashboard.ts";
import {
	markDmSent,
	markFollowed,
	queueAdd,
	wasVisited,
} from "../../shared/database/database.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import {
	humanClickElement,
	humanTypeText,
} from "../../timing/humanize/humanize.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Check if a DM thread is empty (no previous messages).
 * Returns true if thread is empty or has only one element (header).
 */
export async function checkDmThreadEmpty(page: Page): Promise<boolean> {
	const selectors = [
		'div[role="row"]',
		'div[role="listitem"]',
		'div[data-scope="messages_table"] > div',
	];
	for (const sel of selectors) {
		const nodes = await page.$$(sel);
		if (nodes?.length) return nodes.length <= 1;
	}
	return true;
}

/**
 * Send a DM to a user.
 */
export async function sendDMToUser(
	page: Page,
	username: string,
): Promise<boolean> {
	try {
		logger.info("ACTION", `Current URL before DM navigation: ${page.url()}`);

		// Navigate to DM page with circuit breaker protection
		await executeWithCircuitBreaker(async () => {
			await page.goto(`https://www.instagram.com/direct/inbox/`, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
		}, `navigate_dm_inbox_${username}`);

		logger.info("ACTION", `Current URL after DM navigation: ${page.url()}`);

		// Check if we're logged in by looking for profile elements
		const isLoggedIn =
			(await page.$('[href*="/direct/inbox/"]')) !== null ||
			(await page.$('[aria-label*="profile"]')) !== null ||
			(await page.$('[data-testid*="user-avatar"]')) !== null;

		logger.info("ACTION", `Logged in check: ${isLoggedIn}`);

		if (!isLoggedIn) {
			throw new Error("Not logged in - cannot send DM");
		}

		// Take debug screenshot
		await snapshot(page, `dm_page_debug_${username}`);

		// Wait for page to load and look for new message button
		await sleep(3000);

		// Try multiple selectors for the "New Message" button
		const newMessageSelectors = [
			'[aria-label="New message"]',
			'[data-testid="new-message-button"]',
			'svg[aria-label="New message"]',
			'button[aria-label="New message"]',
			'[role="button"]:has-text("Send message")',
			".x1i10hfl button", // Instagram's current button class
		];

		let newMessageClicked = false;
		for (const selector of newMessageSelectors) {
			try {
				const element = await page.$(selector);
				if (element) {
					await element.click();
					await sleep(2000);
					newMessageClicked = true;
					break;
				}
			} catch (e) {
				continue;
			}
		}

		// If we can't find new message button, try direct search approach
		if (!newMessageClicked) {
			logger.info(
				"ACTION",
				"New message button not found, trying direct search approach",
			);

			// Try to find search input in DM interface
			const searchSelectors = [
				'input[placeholder*="Search"]',
				'input[aria-label*="Search"]',
				'input[type="text"]',
			];

			let searchSuccess = false;
			for (const selector of searchSelectors) {
				try {
					const searchResult = await humanTypeText(page, selector, username, {
						typeDelay: 100,
						wordPause: 300,
					});
					if (searchResult) {
						searchSuccess = true;
						await sleep(2000);
						break;
					}
				} catch (e) {
					continue;
				}
			}

			if (!searchSuccess) {
				throw new Error("Could not find or use search input in DM interface");
			}

			// Click first result
			try {
				await humanClickElement(page, '[role="button"]:first-child', {
					hoverDelay: 500,
				});
				await sleep(2000);
			} catch (e) {
				throw new Error("Could not select user from search results");
			}
		}

		// Look for message input - try multiple selectors
		const messageSelectors = [
			'[role="textbox"]',
			'[contenteditable="true"]',
			'[aria-label*="Message"]',
			'div[data-lexical-editor="true"]',
			".x1i10hfl textarea",
			".x1i10hfl div[contenteditable]",
		];

		let messageInputFound = false;
		for (const selector of messageSelectors) {
			try {
				const messageInput = await page.$(selector);
				if (messageInput) {
					// Focus the input
					await messageInput.click();
					await sleep(500);

					// Type the message
					await page.keyboard.type(DM_MESSAGE, { delay: 120 });
					await sleep(1000);

					messageInputFound = true;
					break;
				}
			} catch (e) {
				continue;
			}
		}

		if (!messageInputFound) {
			throw new Error("Could not find message input field");
		}

		// Send the message - try multiple send button selectors
		const sendSelectors = [
			'[aria-label="Send"]',
			'[data-testid="send-button"]',
			'svg[aria-label="Send"]',
			'button[type="submit"]',
			'[role="button"]:has-text("Send")',
		];

		let messageSent = false;
		for (const selector of sendSelectors) {
			try {
				const sendButton = await page.$(selector);
				if (sendButton) {
					await sendButton.click();
					await sleep(2000);
					messageSent = true;
					break;
				}
			} catch (e) {
				continue;
			}
		}

		// If send button not found, try Enter key
		if (!messageSent) {
			logger.info("ACTION", "Send button not found, trying Enter key");
			await page.keyboard.press("Enter");
			await sleep(2000);
			messageSent = true;
		}

		if (messageSent) {
			// Take screenshot as proof
			const proofPath = await snapshot(page, `dm_${username}`);
			await markDmSent(username, proofPath);

			logger.info("ACTION", `DM sent to @${username}`);
			recordActivity("dm_sent", username, "success");
			return true;
		}

		return false;
	} catch (err) {
		logger.error("ERROR", `Failed to send DM to @${username}: ${err}`);
		recordActivity("dm_error", username, "error", err.message);
		return false;
	}
}

/**
 * Follow a user.
 */
export async function followUserAccount(
	page: Page,
	username: string,
): Promise<boolean> {
	try {
		await executeWithCircuitBreaker(async () => {
			await page.goto(`https://www.instagram.com/${username}/`, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
		}, `navigate_profile_${username}`);

		await sleep(2000);

		// Find follow button
		const followButton = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll("button"));
			for (const btn of buttons) {
				const text = btn.textContent?.trim().toLowerCase() || "";
				if (text === "follow") {
					return true;
				}
			}
			return false;
		});

		if (followButton) {
			// Click the follow button (keep existing approach for compatibility)
			await page.evaluate(() => {
				const buttons = Array.from(document.querySelectorAll("button"));
				for (const btn of buttons) {
					const text = btn.textContent?.trim().toLowerCase() || "";
					if (text === "follow") {
						btn.click();
						return;
					}
				}
			});
			await sleep(2000);
			await markFollowed(username);
			logger.info("ACTION", `Followed @${username}`);
			recordActivity("followed", username, "success");
			return true;
		} else {
			logger.info(
				"ACTION",
				`Already following @${username} or button not found`,
			);
			recordActivity("already_following", username, "warning");
			return false;
		}
	} catch (err) {
		logger.error("ERROR", `Failed to follow @${username}: ${err}`);
		recordActivity("follow_failed", username, "error", err.message);
		return false;
	}
}

/**
 * Add a user's following list to the queue.
 * Note: username parameter is kept for API consistency but not used directly.
 */
export async function addFollowingToQueue(
	page: Page,
	_username: string,
	source: string,
	batchSize: number = 20,
): Promise<number> {
	const followingOpened = await openFollowingModal(page);
	if (!followingOpened) {
		return 0;
	}

	const followingUsernames = await extractFollowingUsernames(page, batchSize);
	let added = 0;

	// Use the source which includes the username
	for (const followingUsername of followingUsernames) {
		if (!(await wasVisited(followingUsername))) {
			await queueAdd(followingUsername, 50, source);
			added++;
		}
	}

	await page.keyboard.press("Escape"); // Close modal
	await sleep(1000);

	return added;
}
