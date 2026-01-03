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
import { saveScreenshot, snapshot } from "../../shared/snapshot/snapshot.ts";
import { mediumDelay, shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { findMessageInput, typeMessage } from "./dmInput.ts";
import {
	clickMessageButton,
	findMessageButton,
	navigateToDmThread,
	navigateToProfile,
	scrollToButtonIfNeeded,
	simulateNaturalBehavior,
} from "./dmNavigation.ts";
import { sendMessage, verifyDmSent } from "./dmSending.ts";
import {
	clickFollowButton,
	detectFollowState,
	verifyFollowSucceeded,
} from "./follow.ts";

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
 * @param page - Puppeteer page instance
 * @param username - Instagram username to message
 * @param skipNavigation - If true, assumes already on the user's profile (default: false)
 */
export async function sendDMToUser(
	page: Page,
	username: string,
	skipNavigation: boolean = false,
): Promise<boolean> {
	try {
		// Navigate to profile (skip if already on profile)
		if (!skipNavigation) {
			await navigateToProfile(page, username);
		}

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

		// Get current logged-in username
		const { getCurrentUsername } = await import(
			"../../shared/username/getCurrentUsername.ts"
		);
		const currentUsername = await getCurrentUsername(page);

		await markDmSent(username, proofPath, currentUsername || undefined);

		logger.info("ACTION", `DM sent to @${username}`);
		recordActivity("dm_sent", username, "success");
		return true;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error("ERROR", `Failed to send DM to @${username}: ${errorMessage}`);
		recordActivity("dm_error", username, "error", errorMessage);
		return false;
	}
}

/**
 * Follow a user (full flow with navigation).
 * Navigates to the profile and performs the follow action.
 *
 * @param page - Puppeteer page instance
 * @param username - Instagram username to follow
 * @returns True if successfully followed, false otherwise
 */
export async function followUserAccount(
	page: Page,
	username: string,
): Promise<boolean> {
	try {
		// Navigate to profile using search-based navigation (more human-like)
		await navigateToProfile(page, username);

		await mediumDelay(1.5, 2.5); // Wait for page to fully load

		// Detect follow state using modular function
		const followState = await detectFollowState(page, username);

		// Handle different states
		if (followState === "can_follow") {
			// Take "before" screenshot to show initial state
			const beforePath = await saveScreenshot(
				page,
				"follow",
				username,
				"before",
			);
			logger.info(
				"SCREENSHOT",
				`📸 Before follow screenshot saved: ${beforePath}`,
			);

			// Click the follow button using modular function
			const clicked = await clickFollowButton(page, username);

			if (!clicked) {
				recordActivity("follow_button_not_found", username, "error");
				return false;
			}

			// Verify follow succeeded using modular function
			const newButtonText = await verifyFollowSucceeded(page, username);

			if (newButtonText === "following" || newButtonText === "requested") {
				// Take "after" screenshot to show final state
				const afterPath = await saveScreenshot(
					page,
					"follow",
					username,
					"after",
				);
				logger.info(
					"SCREENSHOT",
					`📸 After follow screenshot saved: ${afterPath}`,
				);

				await markFollowed(username);
				const statusText =
					newButtonText === "following" ? "Following" : "Requested";
				logger.info(
					"ACTION",
					`✅ Successfully followed @${username} - button now shows "${statusText}"`,
				);
				recordActivity("followed", username, "success");
				return true;
			} else {
				// Wait a moment for page to stabilize
				await shortDelay(0.5, 1);

				// Verify we're still on the profile page
				const currentUrl = page.url();
				const isOnProfile =
					currentUrl.includes(`/${username}/`) ||
					currentUrl.includes(`/${username.toLowerCase()}/`);

				if (!isOnProfile) {
					logger.warn(
						"NAVIGATION",
						`⚠️  Page navigated away from profile during follow verification for @${username}. Current URL: ${currentUrl}`,
					);
					// Try to navigate back to profile using search
					try {
						await navigateToProfile(page, username);
					} catch (navError) {
						logger.error(
							"NAVIGATION",
							`⚠️  Could not navigate back to profile: ${navError}`,
						);
					}
				}

				// Take screenshot of failed state for debugging
				const failedPath = await saveScreenshot(
					page,
					"follow",
					username,
					"verification_failed",
				);
				logger.info(
					"SCREENSHOT",
					`📸 Follow verification failed screenshot saved: ${failedPath}`,
				);
				logger.warn(
					"ACTION",
					`⚠️  Follow button clicked but did not change to "Following" or "Requested" for @${username}. Button may not have updated in time.`,
				);
				recordActivity("follow_verification_failed", username, "warning");
				return false;
			}
		} else if (followState === "already_following") {
			logger.info(
				"ACTION",
				`ℹ️  Already following @${username} (button shows "Following")`,
			);
			recordActivity("already_following", username, "success");
			await markFollowed(username).catch(() => {
				// Ignore errors - best effort
			});
			return false;
		} else if (followState === "request_sent") {
			logger.info(
				"ACTION",
				`ℹ️  Follow request already sent to @${username} (button shows "Requested")`,
			);
			recordActivity("follow_request_sent", username, "success");
			await markFollowed(username).catch(() => {
				// Ignore errors - best effort
			});
			return false;
		} else {
			// Wait a moment for page to stabilize
			await shortDelay(0.5, 1);

			// Verify we're still on the profile page before taking screenshot
			const currentUrl = page.url();
			const isOnProfile =
				currentUrl.includes(`/${username}/`) ||
				currentUrl.includes(`/${username.toLowerCase()}/`);

			if (!isOnProfile) {
				logger.warn(
					"NAVIGATION",
					`⚠️  Page navigated away from profile for @${username}. Current URL: ${currentUrl}`,
				);
				// Try to navigate back to profile using search
				try {
					await navigateToProfile(page, username);
				} catch (navError) {
					logger.error(
						"NAVIGATION",
						`⚠️  Could not navigate back to profile: ${navError}`,
					);
				}
			}

			// Take screenshot for debugging
			const failedPath = await saveScreenshot(
				page,
				"follow",
				username,
				"failed",
			);
			logger.info(
				"SCREENSHOT",
				`📸 Follow button not found screenshot saved: ${failedPath}`,
			);

			logger.warn(
				"ACTION",
				`⚠️  Could not determine follow button state for @${username}. Button may not be visible or page structure changed.`,
			);
			recordActivity("follow_button_not_found", username, "warning");
			return false;
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		logger.error("ERROR", `Failed to follow @${username}: ${errorMessage}`);
		recordActivity("follow_failed", username, "error", errorMessage);
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
	await shortDelay(0.5, 1);

	return added;
}
