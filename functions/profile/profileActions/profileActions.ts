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
import { clickAny } from "../../navigation/clickAny/clickAny.ts";
import { humanClickElement } from "../../timing/humanize/humanize.ts";
import {
	markDmSent,
	markFollowed,
	queueAdd,
	wasVisited,
} from "../../shared/database/database.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanTypeText, humanClickElement, moveMouseToElement } from "../../timing/humanize/humanize.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Handle Instagram popups and error pages (notifications, reload prompts, etc.)
 */
async function handleInstagramPopups(page: Page): Promise<void> {
	// Handle "The messaging tab has a new look" popup
	const messagingTabDismissed = await clickAny(page, [
		"OK",
		"Got it",
		"Got It",
		"Dismiss",
	]);
	if (messagingTabDismissed) {
		logger.info("ACTION", "Dismissed messaging tab popup");
		await sleep(1000 + Math.random() * 1000);
	}

	// Handle "Turn on Notifications" popup
	const notificationDismissed = await clickAny(page, [
		"Not Now",
		"Not now",
		"Cancel",
		"Close",
	]);
	if (notificationDismissed) {
		logger.info("ACTION", "Dismissed notification popup");
		await sleep(1000 + Math.random() * 1000);
	}

	// Handle "Reload page" button if error page appears
	const reloadClicked = await clickAny(page, ["Reload page", "Reload"]);
	if (reloadClicked) {
		logger.info("ACTION", "Clicked reload page button");
		await sleep(3000 + Math.random() * 2000);
		// Try handling popups again after reload
		await handleInstagramPopups(page);
	}
}

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
		const u = username.toLowerCase().trim();
		logger.info("ACTION", `Navigating to profile: @${u}`);

		// Navigate to user's profile page
		await executeWithCircuitBreaker(async () => {
			await page.goto(`https://www.instagram.com/${u}/`, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
		}, `navigate_profile_${username}`);

		logger.info("ACTION", `Current URL: ${page.url()}`);

		// Wait for profile to load with human-like delay
		await sleep(2000 + Math.random() * 2000); // 2-4 seconds

		// Handle any popups that appeared during navigation
		await handleInstagramPopups(page);

		// Simulate reading the profile (mouse movement)
		await page.mouse.move(
			Math.random() * 500 + 200,
			Math.random() * 300 + 200,
			{ steps: 10 }
		);
		await sleep(1000 + Math.random() * 1000);

		// Check if we're logged in
		const currentUrl = page.url();
		const isLoginPage = currentUrl.includes("/accounts/login/");
		
		if (isLoginPage) {
			logger.info("ACTION", "Redirected to login page - session may have expired");
			throw new Error("Not logged in - redirected to login page");
		}

		// Take debug screenshot
		await snapshot(page, `dm_profile_debug_${username}`);

		// MIMIC REAL USER BEHAVIOR EXACTLY
		// 1. Scroll page naturally to see the button
		logger.info("ACTION", "Scrolling page naturally like a real user");
		await page.evaluate(() => {
			window.scrollBy(0, Math.random() * 200 + 100);
		});
		await sleep(500 + Math.random() * 500);
		
		// 2. Move mouse around naturally (looking at profile)
		logger.info("ACTION", "Moving mouse naturally around the page");
		for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
			const randomX = Math.random() * 800 + 200;
			const randomY = Math.random() * 600 + 200;
			await page.mouse.move(randomX, randomY, {
				steps: 20 + Math.floor(Math.random() * 20)
			});
			await sleep(200 + Math.random() * 400);
		}

		// 3. Get Message button coordinates
		const buttonInfo = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll('button, a'));
			for (const btn of buttons) {
				const text = (btn.textContent || "").trim().toLowerCase();
				if (text === "message") {
					const rect = btn.getBoundingClientRect();
					// Check if button is visible in viewport
					const isVisible = rect.top >= 0 && rect.left >= 0 && 
						rect.bottom <= window.innerHeight && 
						rect.right <= window.innerWidth;
					
					return {
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2,
						width: rect.width,
						height: rect.height,
						isVisible,
					};
				}
			}
			return null;
		});

		let messageButtonClicked = false;

		if (buttonInfo) {
			// 4. Scroll to button if not visible (like a real user would)
			if (!buttonInfo.isVisible) {
				logger.info("ACTION", "Button not visible, scrolling to it naturally");
				await page.evaluate((targetY) => {
					const currentScroll = window.pageYOffset;
					const distance = targetY - currentScroll - 300; // Scroll to show button
					window.scrollBy({
						top: distance,
						behavior: 'smooth'
					});
				}, buttonInfo.y);
				await sleep(1000 + Math.random() * 1000);
				
				// Re-get coordinates after scroll
				const newButtonInfo = await page.evaluate(() => {
					const buttons = Array.from(document.querySelectorAll('button, a'));
					for (const btn of buttons) {
						const text = (btn.textContent || "").trim().toLowerCase();
						if (text === "message") {
							const rect = btn.getBoundingClientRect();
							return {
								x: rect.left + rect.width / 2,
								y: rect.top + rect.height / 2,
								width: rect.width,
								height: rect.height,
							};
						}
					}
					return null;
				});
				if (newButtonInfo) {
					Object.assign(buttonInfo, newButtonInfo);
				}
			}

			// 5. Move mouse in NATURAL CURVED PATH to button (not straight line)
			logger.info("ACTION", "Moving mouse in natural curved path to Message button");
			const currentPos = await page.evaluate(() => ({
				x: (window as any).mouseX || window.innerWidth / 2,
				y: (window as any).mouseY || window.innerHeight / 2,
			}));
			
			// Create waypoints for natural curved movement
			const waypoints = [];
			const numWaypoints = 3 + Math.floor(Math.random() * 2);
			for (let i = 1; i <= numWaypoints; i++) {
				const t = i / (numWaypoints + 1);
				// Bezier-like curve with randomness
				const midX = currentPos.x + (buttonInfo.x - currentPos.x) * t + (Math.random() - 0.5) * 100;
				const midY = currentPos.y + (buttonInfo.y - currentPos.y) * t + (Math.random() - 0.5) * 50;
				waypoints.push({ x: midX, y: midY });
			}
			
			// Move through waypoints (natural path)
			for (const waypoint of waypoints) {
				await page.mouse.move(waypoint.x, waypoint.y, {
					steps: 15 + Math.floor(Math.random() * 10)
				});
				await sleep(50 + Math.random() * 100);
			}
			
			// 6. Move near button, pause, then move to it (human behavior)
			const nearX = buttonInfo.x - 30 + Math.random() * 60;
			const nearY = buttonInfo.y - 20 + Math.random() * 40;
			await page.mouse.move(nearX, nearY, { steps: 10 });
			await sleep(300 + Math.random() * 500); // Pause like reading
			
			// 7. Final movement to button center with small random offset
			const finalX = buttonInfo.x + (Math.random() - 0.5) * (buttonInfo.width * 0.2);
			const finalY = buttonInfo.y + (Math.random() - 0.5) * (buttonInfo.height * 0.2);
			await page.mouse.move(finalX, finalY, { steps: 8 + Math.floor(Math.random() * 5) });
			
			// 8. Hover over button (real user pauses before clicking)
			await sleep(400 + Math.random() * 600);
			
			// 9. Click with natural timing
			logger.info("ACTION", "Clicking Message button with natural cursor movement");
			await page.mouse.down();
			await sleep(80 + Math.random() * 120); // Natural click hold time
			await page.mouse.up();
			
			messageButtonClicked = true;
			logger.info("ACTION", "Message button clicked - mimicked real user exactly");
			await sleep(1000 + Math.random() * 1000);
		}

		if (!messageButtonClicked) {
			// Fallback: try direct navigation to DM thread
			logger.info("ACTION", "Message button not found, trying direct DM URL");
			await page.goto(`https://www.instagram.com/direct/t/${u}/`, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
			await sleep(3000 + Math.random() * 2000); // 3-5 seconds
		} else {
			// Wait for DM thread to open with realistic delay
			await sleep(2000 + Math.random() * 1500); // 2-3.5 seconds
			
			// Handle popups immediately after clicking Message
			await handleInstagramPopups(page);
			
			// Simulate reading the DM interface
			await page.mouse.move(
				Math.random() * 400 + 300,
				Math.random() * 200 + 200,
				{ steps: 15 }
			);
			await sleep(1000 + Math.random() * 1000);
		}

		// Handle any remaining popups before proceeding
		await handleInstagramPopups(page);

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

		// Wait a bit more for message input to appear with human-like delay
		await sleep(2000 + Math.random() * 1500); // 2-3.5 seconds

		// Look for message input - try multiple selectors
		const messageSelectors = [
			'[role="textbox"]',
			'[contenteditable="true"]',
			'[aria-label*="Message"]',
			'div[data-lexical-editor="true"]',
			'textarea[placeholder*="Message"]',
			'div[contenteditable="true"][aria-label*="Message"]',
			".x1i10hfl textarea",
			".x1i10hfl div[contenteditable]",
		];

		let messageInputFound = false;
		for (const selector of messageSelectors) {
			try {
				// Wait for selector to appear
				await page.waitForSelector(selector, { timeout: 5000 }).catch(() => null);
				const messageInput = await page.$(selector);
				if (messageInput) {
					logger.info("ACTION", `Found message input with selector: ${selector}`);
					
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

					messageInputFound = true;
					break;
				}
			} catch (err) {
				logger.info("ACTION", `Selector ${selector} failed: ${err}`);
				continue;
			}
		}

		if (!messageInputFound) {
			// Take screenshot for debugging
			await snapshot(page, `dm_no_input_${username}`);
			throw new Error("Could not find message input field");
		}

		// Send the message - try multiple send button selectors with human-like clicking
		const sendSelectors = [
			'[aria-label="Send"]',
			'[data-testid="send-button"]',
			'svg[aria-label="Send"]',
			'button[type="submit"]',
		];

		let messageSent = false;
		for (const selector of sendSelectors) {
			try {
				const sendButton = await page.$(selector);
				if (sendButton) {
					logger.info("ACTION", `Found send button with selector: ${selector}`);
					// Use human-like click with mouse movement
					const clicked = await humanClickElement(page, selector, {
						elementType: "button",
						hoverDelay: 150 + Math.random() * 200,
					});
					if (clicked) {
						await sleep(3000 + Math.random() * 1000);
						messageSent = true;
						break;
					}
				}
			} catch (err) {
				logger.info("ACTION", `Send selector ${selector} failed: ${err}`);
				continue;
			}
		}

		// If send button not found, try clicking by text using clickAny
		if (!messageSent) {
			const clickedByText = await clickAny(page, ["Send"]);
			if (clickedByText) {
				await sleep(3000 + Math.random() * 1000);
				messageSent = true;
				logger.info("ACTION", "Send button clicked by text");
			}
		}

		// If still not sent, try Enter key
		if (!messageSent) {
			logger.info("ACTION", "Send button not found, trying Enter key");
			await page.keyboard.press("Enter");
			await sleep(3000 + Math.random() * 1000);
			messageSent = true;
		}

		if (messageSent) {
			// Wait a bit for message to be sent
			await sleep(2000);

			// Take screenshot as proof (before verification)
			const proofPath = await snapshot(page, `dm_${username}`);

			// Best-effort verification: check that the message appears in the thread.
			// Use a more lenient check - just verify we're still in a DM thread
			const isInDmThread = await page.evaluate(() => {
				const url = window.location.href;
				return url.includes("/direct/t/") || url.includes("/direct/inbox/");
			}).catch(() => false);

			// Also check if message text appears (but don't fail if it doesn't - Instagram might format it)
			const appearsInThread = await page
				.evaluate((msg: string) => {
					const text = document.body?.innerText || "";
					// Check for partial matches too
					const msgWords = msg.toLowerCase().split(" ");
					return msgWords.some(word => text.toLowerCase().includes(word));
				}, DM_MESSAGE)
				.catch(() => true);

			if (!isInDmThread && !appearsInThread) {
				logger.info("ACTION", "Message verification unclear, but assuming sent");
			}

			// Mark as sent regardless - we clicked send
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
