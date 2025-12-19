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
import { snapshot, saveScreenshot } from "../../shared/snapshot/snapshot.ts";
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

		await sleep(3000); // Wait longer for page to fully load

		// Step 3: Check the page for follow button text - simple text search
		// Search the entire page body for "Following", "Follow", or "Requested" text
		let buttonText: { state: string } | null = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			buttonText = await page.evaluate(() => {
				// Search for buttons first - more reliable than searching entire page
				const buttons = Array.from(document.querySelectorAll("button"));

				for (const btn of buttons) {
					const text = (btn.textContent || (btn as HTMLElement).innerText || "")
						.trim()
						.toLowerCase();

					// Priority 1: "Follow Back" - means we can follow
					if (text === "follow back") {
						return { state: "can_follow" };
					}

					// Priority 2: "Following" - already following
					if (text === "following") {
						return { state: "already_following" };
					}

					// Priority 3: "Requested" - request already sent
					if (text === "requested") {
						return { state: "request_sent" };
					}

					// Priority 4: "Follow" - can follow
					if (text === "follow") {
						return { state: "can_follow" };
					}
				}

				// Fallback: search page text if buttons don't work
				const bodyText = (document.body.textContent || "").toLowerCase();

				// Check for "Follow Back" in page text
				if (bodyText.includes("follow back")) {
					return { state: "can_follow" };
				}

				// Check for "Requested"
				if (bodyText.includes("requested")) {
					return { state: "request_sent" };
				}

				// Check for "Following" but exclude "Followed by" and similar
				if (bodyText.includes("following")) {
					// Look for "following" that's not part of "followed by" or "follow back"
					const followingIndex = bodyText.indexOf("following");
					const beforeContext = bodyText.substring(
						Math.max(0, followingIndex - 20),
						followingIndex,
					);
					const afterContext = bodyText.substring(
						followingIndex + 9,
						Math.min(bodyText.length, followingIndex + 30),
					);

					if (
						!beforeContext.includes("followed by") &&
						!beforeContext.includes("follow back") &&
						!afterContext.includes("by") &&
						!bodyText
							.substring(followingIndex - 5, followingIndex)
							.includes("unfollow")
					) {
						return { state: "already_following" };
					}
				}

				// Check for "Follow" but exclude "Follow Back", "Following", "Followed by"
				if (
					bodyText.includes("follow") &&
					!bodyText.includes("follow back") &&
					!bodyText.includes("following") &&
					!bodyText.includes("followed by")
				) {
					return { state: "can_follow" };
				}

				return { state: "not_found" };
			});

			if (buttonText && buttonText.state !== "not_found") {
				break; // Found a valid state
			}

			if (attempt < 2) {
				logger.info(
					"ACTION",
					`Follow button text not found on page, waiting and retrying (attempt ${attempt + 1}/3)...`,
				);
				await sleep(2000);
			}
		}

		// Safety check - if evaluate returned undefined or invalid result
		if (!buttonText || typeof buttonText !== "object" || !buttonText.state) {
			logger.error(
				"ERROR",
				`Could not determine follow state for @${username} - page may not have loaded`,
			);
			recordActivity("follow_button_state_error", username, "error");
			return false;
		}

		// Step 4: If follow or follow back, click the button
		if (buttonText.state === "can_follow") {
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

			// Click the button - find it by searching for "Follow" or "Follow Back" text
			const clicked = await page.evaluate(() => {
				const buttons = Array.from(document.querySelectorAll("button"));
				for (const btn of buttons) {
					const text = (btn.textContent || (btn as HTMLElement).innerText || "")
						.trim()
						.toLowerCase();
					// Match "Follow" or "Follow Back" but not "Following" or "Unfollow"
					if (
						(text === "follow" || text === "follow back") &&
						!text.includes("following") &&
						!text.includes("unfollow")
					) {
						btn.click();
						return true;
					}
				}
				return false;
			});

			if (clicked) {
				// Step 5: Wait and check the button has changed to either following or requested
				// Retry multiple times with increasing wait times to account for network delays
				let newButtonText: string | null = null;
				const maxAttempts = 5;
				const initialWait = 3000; // Start with 3 seconds

				for (let attempt = 0; attempt < maxAttempts; attempt++) {
					// Wait before checking (longer wait for first attempt, then shorter)
					const waitTime = attempt === 0 ? initialWait : 2000;
					await sleep(waitTime);

					newButtonText = await page.evaluate(() => {
						// Simple text search on the entire page
						const bodyText = (document.body.textContent || "").toLowerCase();

						// Check for "Following" first
						if (bodyText.includes("following")) {
							const followingIndex = bodyText.indexOf("following");
							const context = bodyText.substring(
								Math.max(0, followingIndex - 10),
								Math.min(bodyText.length, followingIndex + 20),
							);
							if (
								!context.includes("unfollow") &&
								!context.includes("remove")
							) {
								return "following";
							}
						}

						// Check for "Requested"
						if (bodyText.includes("requested")) {
							return "requested";
						}

						return null;
					});

					if (newButtonText === "following" || newButtonText === "requested") {
						break; // Success - button changed
					}

					if (attempt < maxAttempts - 1) {
						// Debug: log what buttons we found (only on first retry to avoid spam)
						if (attempt === 0) {
							const buttonTexts = await page.evaluate(() => {
								const buttons = Array.from(document.querySelectorAll("button"));
								return buttons
									.map((btn) =>
										(
											btn.textContent ||
											(btn as HTMLElement).innerText ||
											""
										).trim(),
									)
									.filter((text) => text.length > 0 && text.length < 50)
									.slice(0, 10); // Limit to first 10
							});
							logger.info(
								"ACTION",
								`⏳ Waiting for button state to update (attempt ${attempt + 1}/${maxAttempts}). Found buttons: ${buttonTexts.slice(0, 5).join(", ")}${buttonTexts.length > 5 ? "..." : ""}`,
							);
						} else {
							logger.info(
								"ACTION",
								`⏳ Still waiting for button state to update (attempt ${attempt + 1}/${maxAttempts})...`,
							);
						}
					}
				}

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
						`⚠️  Follow button clicked but did not change to "Following" or "Requested" for @${username} after ${maxAttempts} attempts. Button may not have updated in time.`,
					);
					recordActivity("follow_verification_failed", username, "warning");
					return false;
				}
			} else {
				logger.warn(
					"ACTION",
					`⚠️  Could not find "Follow" or "Follow Back" button for @${username}. Profile may be private or button structure changed.`,
				);
				recordActivity("follow_button_not_found", username, "error");
				return false;
			}
		} else if (buttonText.state === "already_following") {
			logger.info(
				"ACTION",
				`ℹ️  Already following @${username} (button shows "Following")`,
			);
			recordActivity("already_following", username, "success");
			await markFollowed(username).catch(() => {
				// Ignore errors - best effort
			});
			return false;
		} else if (buttonText.state === "request_sent") {
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
			logger.warn(
				"ACTION",
				`⚠️  Could not determine follow button state for @${username}. Button may not be visible or page structure changed.`,
			);
			recordActivity("follow_button_not_found", username, "warning");
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
