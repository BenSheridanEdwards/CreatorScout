/**
 * Profile actions - DM sending, following, queue expansion.
 */
import type { Page } from "puppeteer";
import {
	extractFollowingUsernames,
	openFollowingModal,
} from "../../navigation/modalOperations/modalOperations.ts";
import { DM_MESSAGE } from "../../shared/config/config.ts";
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
		// Navigate to DM page
		await page.goto(`https://www.instagram.com/direct/inbox/`, {
			waitUntil: "networkidle2",
			timeout: 15000,
		});

		// Click "New Message" or search for user
		await sleep(2000);

		// Try to find existing conversation or start new one
		const searchSuccess = await humanTypeText(
			page,
			'input[placeholder*="Search"]',
			username,
			{
				typeDelay: 80,
				wordPause: 200,
			},
		);
		if (searchSuccess) {
			await sleep(2000);

			// Click first result with human-like movement
			const clickSuccess = await humanClickElement(
				page,
				'div[role="button"]:first-child',
				{
					hoverDelay: 500, // Pause like reading the result
				},
			);
			if (clickSuccess) {
				await sleep(2000);
			}
		}

		// Check if conversation already has messages
		const messages = await page.$$('div[role="textbox"]');
		if (messages.length > 0) {
			logger.warn(
				"ACTION",
				`Conversation with @${username} already exists, skipping DM`,
			);
			return false;
		}

		// Type message with human-like timing
		const typeSuccess = await humanTypeText(
			page,
			'div[role="textbox"]',
			DM_MESSAGE,
			{
				typeDelay: 120, // Realistic typing speed
				wordPause: 400, // Pause between words
			},
		);
		if (typeSuccess) {
			await sleep(1000);

			// Send with Enter key (or could click send button)
			await page.keyboard.press("Enter");
			await sleep(2000);

			// Take screenshot as proof
			const proofPath = await snapshot(page, `dm_${username}`);
			markDmSent(username, proofPath);

			logger.info("ACTION", `DM sent to @${username}`);
			return true;
		}

		return false;
	} catch (err) {
		logger.error("ERROR", `Failed to send DM to @${username}: ${err}`);
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
		await page.goto(`https://www.instagram.com/${username}/`, {
			waitUntil: "networkidle2",
			timeout: 15000,
		});
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
			markFollowed(username);
			logger.info("ACTION", `Followed @${username}`);
			return true;
		} else {
			logger.info(
				"ACTION",
				`Already following @${username} or button not found`,
			);
			return false;
		}
	} catch (err) {
		logger.error("ERROR", `Failed to follow @${username}: ${err}`);
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
		if (!wasVisited(followingUsername)) {
			queueAdd(followingUsername, 50, source);
			added++;
		}
	}

	await page.keyboard.press("Escape"); // Close modal
	await sleep(1000);

	return added;
}
