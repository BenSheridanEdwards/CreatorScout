/**
 * Modular follow functions - low-level operations for following users.
 * These functions work on any profile page and don't require navigation.
 */
import type { Page } from "puppeteer";
import { humanClick } from "../../navigation/humanInteraction/humanInteraction.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Follow state types
 */
export type FollowState =
	| "can_follow"
	| "already_following"
	| "request_sent"
	| "not_found";

/**
 * Detect the current follow state on a profile page.
 * Works on any profile page - does not require navigation.
 *
 * @param page - Puppeteer page instance (should be on a profile page)
 * @param username - Optional username for logging
 * @returns The detected follow state
 */
export async function detectFollowState(
	page: Page,
	username?: string,
): Promise<FollowState> {
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
			if (username) {
				logger.info(
					"ACTION",
					`Follow button text not found on page, waiting and retrying (attempt ${attempt + 1}/3) for @${username}...`,
				);
			}
			await shortDelay(1, 2);
		}
	}

	return (buttonText?.state as FollowState) || "not_found";
}

/**
 * Click the follow button on a profile page.
 * Works on any profile page - does not require navigation.
 * Uses human-like clicking behavior to avoid bot detection.
 *
 * @param page - Puppeteer page instance (should be on a profile page)
 * @param username - Optional username for logging
 * @returns True if button was found and clicked, false otherwise
 */
export async function clickFollowButton(
	page: Page,
	username?: string,
): Promise<boolean> {
	// Find the button using the original exact logic
	const buttons = await page.$$("button");
	for (const btn of buttons) {
		const text = await btn.evaluate((el) =>
			(el.textContent || (el as HTMLElement).innerText || "")
				.trim()
				.toLowerCase(),
		);
		// Match "Follow" or "Follow Back" but not "Following" or "Unfollow"
		if (
			(text === "follow" || text === "follow back") &&
			!text.includes("following") &&
			!text.includes("unfollow")
		) {
			await humanClick(page, btn);
			return true;
		}
	}

	if (username) {
		logger.warn(
			"ACTION",
			`⚠️  Could not find "Follow" or "Follow Back" button for @${username}. Profile may be private or button structure changed.`,
		);
	}

	return false;
}

/**
 * Verify that a follow action succeeded by checking if the button changed.
 * Works on any profile page - does not require navigation.
 *
 * @param page - Puppeteer page instance (should be on a profile page)
 * @param username - Optional username for logging
 * @param maxAttempts - Maximum number of retry attempts (default: 5)
 * @returns The new button state ("following" or "requested") if successful, null otherwise
 */
export async function verifyFollowSucceeded(
	page: Page,
	username?: string,
	maxAttempts: number = 5,
): Promise<string | null> {
	const initialWait = 3000; // Start with 3 seconds

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		// Wait before checking (longer wait for first attempt, then shorter)
		const waitTime = attempt === 0 ? initialWait : 2000;
		await sleep(waitTime);

		const newButtonText = await page.evaluate(() => {
			// Simple text search on the entire page
			const bodyText = (document.body.textContent || "").toLowerCase();

			// Check for "Following" first
			if (bodyText.includes("following")) {
				const followingIndex = bodyText.indexOf("following");
				const context = bodyText.substring(
					Math.max(0, followingIndex - 10),
					Math.min(bodyText.length, followingIndex + 20),
				);
				if (!context.includes("unfollow") && !context.includes("remove")) {
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
			return newButtonText; // Success - button changed
		}

		if (attempt < maxAttempts - 1) {
			// Debug: log what buttons we found (only on first retry to avoid spam)
			if (attempt === 0 && username) {
				const buttonTexts = await page.evaluate(() => {
					const buttons = Array.from(document.querySelectorAll("button"));
					return buttons
						.map((btn) =>
							(btn.textContent || (btn as HTMLElement).innerText || "").trim(),
						)
						.filter((text) => text.length > 0 && text.length < 50)
						.slice(0, 10); // Limit to first 10
				});
				logger.info(
					"ACTION",
					`⏳ Waiting for button state to update (attempt ${attempt + 1}/${maxAttempts}) for @${username}. Found buttons: ${buttonTexts.slice(0, 5).join(", ")}${buttonTexts.length > 5 ? "..." : ""}`,
				);
			} else if (username) {
				logger.info(
					"ACTION",
					`⏳ Still waiting for button state to update (attempt ${attempt + 1}/${maxAttempts}) for @${username}...`,
				);
			}
		}
	}

	return null; // Failed to verify
}
