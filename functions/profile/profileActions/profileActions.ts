/**
 * Profile actions - DM sending, following, queue expansion.
 */
import type { Page } from "puppeteer";
import {
	extractFollowingUsernames,
	openFollowingModal,
} from "../../navigation/modalOperations/modalOperations.ts";
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
	navigateToProfile,
	simulateNaturalBehavior,
	findMessageButton,
	scrollToButtonIfNeeded,
	clickMessageButton,
	navigateToDmThread,
} from "./dmNavigation.ts";
import { findMessageInput, typeMessage } from "./dmInput.ts";
import { sendMessage, verifyDmSent } from "./dmSending.ts";

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
 * Send a DM to a user by navigating to their profile and clicking Message.
 */
export async function sendDMToUser(
	page: Page,
	username: string,
): Promise<boolean> {
	try {
		// Navigate to profile
		await navigateToProfile(page, username);

		// Simulate natural behavior
		await simulateNaturalBehavior(page);

		// Find and click message button
		let messageButtonClicked = false;
		const buttonInfo = await findMessageButton(page);

		if (buttonInfo) {
			const visibleButtonInfo = await scrollToButtonIfNeeded(page, buttonInfo);
			await clickMessageButton(page, visibleButtonInfo);
			messageButtonClicked = true;
		}

		// Navigate to DM thread
		await navigateToDmThread(page, username, messageButtonClicked);

		// Take screenshot of DM thread
		await snapshot(page, `dm_thread_${username}`);

		// Safety: do not message if conversation already exists.
		const threadEmpty = await checkDmThreadEmpty(page);
		if (!threadEmpty) {
			logger.info(
				"ACTION",
				`DM thread for @${username} is not empty; skipping to avoid spamming`,
			);
			recordActivity("dm_skipped_existing_thread", username, "warning");
			await snapshot(page, `dm_skipped_existing_${username}`);
			return false;
		}

		// Find and type message
		const inputSelector = await findMessageInput(page);
		if (!inputSelector) {
			await snapshot(page, `dm_no_input_${username}`);
			throw new Error("Could not find message input field");
		}

		const typed = await typeMessage(page, inputSelector, username);
		if (!typed) {
			return false;
		}

		// Send message
		const messageSent = await sendMessage(page);
		if (!messageSent) {
			return false;
		}

		// Verify and record
		const { proofPath } = await verifyDmSent(page, username);
		await markDmSent(username, proofPath);

		logger.info("ACTION", `DM sent to @${username}`);
		recordActivity("dm_sent", username, "success");
		return true;
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
