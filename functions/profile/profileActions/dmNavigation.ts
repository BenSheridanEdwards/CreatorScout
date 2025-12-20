/**
 * Navigation logic for DM flow - navigating to profile and clicking message button
 */
import type { Page } from "puppeteer";
import { executeWithCircuitBreaker } from "../../shared/circuitBreaker/circuitBreaker.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { handleInstagramPopups } from "./popupHandler.ts";

// Lazy logger creation to prevent memory issues in tests
let logger: ReturnType<typeof createLogger> | null = null;
function getLogger() {
	if (!logger) {
		logger = createLogger(process.env.DEBUG_LOGS === "true");
	}
	return logger;
}

export interface ButtonInfo {
	x: number;
	y: number;
	width: number;
	height: number;
	isVisible: boolean;
}

/**
 * Wait for frame stability after navigation (critical for Browserless)
 * This ensures any detached frames from previous navigation are cleared
 */
async function waitForFrameStability(page: Page, timeout: number = 5000): Promise<void> {
	try {
		// Wait for the main frame to be ready
		await page.waitForFunction(
			() => document.readyState === "complete",
			{ timeout }
		);
		
		// Additional wait for frame stability in Browserless
		await sleep(1000);
		
		// Verify the main frame is accessible by checking page URL
		try {
			page.url(); // This will throw if frame is detached
		} catch (frameError) {
			// Wait a bit more and try again
			await sleep(2000);
			page.url(); // Verify again
		}
	} catch (err) {
		// If frame stability check fails, log but continue
		// The next operation will catch the actual error
		getLogger().warn("ACTION", `Frame stability check timed out or failed: ${err}`);
	}
}

/**
 * Navigate to user's profile using search (more human-like, avoids detection)
 */
async function navigateToProfileViaSearch(
	page: Page,
	username: string,
): Promise<void> {
	const u = username.toLowerCase().trim();
	getLogger().info("ACTION", `Navigating to profile via search: @${u}`);

	// Ensure we're on Instagram homepage (or any Instagram page)
	const currentUrl = page.url();
	if (!currentUrl.includes("instagram.com")) {
		getLogger().info("ACTION", "Not on Instagram, navigating to homepage");
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle2",
			timeout: 15000,
		});
		// Wait for frame stability after navigation (critical for Browserless)
		await waitForFrameStability(page, 5000);
		await sleep(2000 + Math.random() * 2000);
	}

	// Handle any popups
	await handleInstagramPopups(page);

	// Find and click the search icon/input
	getLogger().info("ACTION", "Looking for search icon/input");
	const searchSelectors = [
		'a[href="/explore/"]',
		'input[placeholder*="Search"]',
		'input[aria-label*="Search"]',
		'svg[aria-label="Search"]',
		'a[aria-label="Search"]',
		'div[role="link"][href="/explore/"]',
	];

	let searchClicked = false;
	for (const selector of searchSelectors) {
		try {
			const element = await page.$(selector);
			if (element) {
				// If it's an input, just click it. If it's a link/icon, click to open search
				const tagName = await page.evaluate((el) => el.tagName.toLowerCase(), element);
				if (tagName === "input") {
					await element.click({ delay: 100 + Math.random() * 100 });
					searchClicked = true;
					getLogger().info("ACTION", `Found and clicked search input: ${selector}`);
					break;
				} else {
					// It's a link/icon - click to navigate to search page
					await element.click({ delay: 100 + Math.random() * 100 });
					await sleep(1500 + Math.random() * 1000);
					// Now look for the search input on the search page
					const searchInput = await page.$('input[placeholder*="Search"], input[aria-label*="Search"]');
					if (searchInput) {
						await searchInput.click({ delay: 100 + Math.random() * 100 });
						searchClicked = true;
						getLogger().info("ACTION", `Opened search page and clicked input`);
						break;
					}
				}
			}
		} catch (err) {
			continue;
		}
	}

	if (!searchClicked) {
		// Fallback: try navigating to explore/search page directly
		getLogger().info("ACTION", "Search icon not found, navigating to explore page");
		await page.goto("https://www.instagram.com/explore/", {
			waitUntil: "networkidle2",
			timeout: 15000,
		});
		// Wait for frame stability after navigation (critical for Browserless)
		await waitForFrameStability(page, 5000);
		await sleep(2000);
		const searchInput = await page.$('input[placeholder*="Search"], input[aria-label*="Search"]');
		if (searchInput) {
			await searchInput.click({ delay: 100 + Math.random() * 100 });
			searchClicked = true;
		}
	}

	if (!searchClicked) {
		throw new Error("Could not find or click search input");
	}

	// Wait a moment for search input to be ready
	await sleep(500 + Math.random() * 500);

	// Type the username character by character (human-like)
	getLogger().info("ACTION", `Typing username: @${u}`);
	for (const char of u) {
		await page.keyboard.type(char, { delay: 100 + Math.random() * 150 });
		await sleep(50 + Math.random() * 100);
	}

	// Wait for search results to appear
	getLogger().info("ACTION", "Waiting for search results");
	await sleep(1500 + Math.random() * 1000);

	// Find and click the profile in search results
	getLogger().info("ACTION", "Looking for profile in search results");
	const profileFound = await page.evaluate((targetUsername) => {
		// Look for profile links in search results
		const links = Array.from(document.querySelectorAll('a[href*="/"]'));
		for (const link of links) {
			const href = link.getAttribute("href") || "";
			const text = (link.textContent || "").toLowerCase();
			// Match exact username in href or text
			if (
				href.includes(`/${targetUsername}/`) ||
				text.includes(targetUsername) ||
				text.includes(`@${targetUsername}`)
			) {
				// Make sure it's a profile link, not something else
				if (href.match(/^\/[^\/]+\/?$/) || href.includes(`/${targetUsername}/`)) {
					(link as HTMLElement).click();
					return true;
				}
			}
		}
		return false;
	}, u);

	if (!profileFound) {
		// Try alternative: look for divs with role="link" or buttons
		const altFound = await page.evaluate((targetUsername) => {
			const clickableElements = Array.from(
				document.querySelectorAll('div[role="link"], div[role="button"], a'),
			);
			for (const el of clickableElements) {
				const text = (el.textContent || "").toLowerCase();
				const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
				if (
					text.includes(targetUsername) ||
					text.includes(`@${targetUsername}`) ||
					ariaLabel.includes(targetUsername)
				) {
					(el as HTMLElement).click();
					return true;
				}
			}
			return false;
		}, u);

		if (!altFound) {
			throw new Error(`Could not find profile @${u} in search results`);
		}
	}

	// Wait for profile page to load
	getLogger().info("ACTION", "Waiting for profile page to load");
	await sleep(2000 + Math.random() * 2000);

	// Verify we're on the profile page
	const finalUrl = page.url();
	if (!finalUrl.includes(`/${u}/`)) {
		// Wait a bit more and check again
		await sleep(2000);
		const finalUrl2 = page.url();
		if (!finalUrl2.includes(`/${u}/`)) {
			getLogger().warn(
				"ACTION",
				`Expected to be on profile @${u}, but URL is: ${finalUrl2}`,
			);
		}
	}

	getLogger().info("ACTION", `Current URL: ${page.url()}`);

	// Handle any popups that appeared during navigation
	await handleInstagramPopups(page);

	// Simulate reading the profile (mouse movement)
	await page.mouse.move(
		Math.random() * 500 + 200,
		Math.random() * 300 + 200,
		{ steps: 10 },
	);
	await sleep(1000 + Math.random() * 1000);

	// Check if we're logged in (reuse finalUrl or get current URL)
	const checkUrl = page.url();
	const isLoginPage = checkUrl.includes("/accounts/login/");

	if (isLoginPage) {
		getLogger().info(
			"ACTION",
			"Redirected to login page - session may have expired",
		);
		throw new Error("Not logged in - redirected to login page");
	}

	// Take debug screenshot
	await snapshot(page, `dm_profile_debug_${username}`);
}

/**
 * Navigate to user's profile and wait for it to load
 * Uses ONLY search-based navigation (no direct URL navigation) to avoid detection
 */
export async function navigateToProfile(
	page: Page,
	username: string,
): Promise<void> {
	const u = username.toLowerCase().trim();
	
	// Use ONLY search-based navigation - no fallback to direct URL
	// This is more human-like and avoids frame detachment issues
	await navigateToProfileViaSearch(page, username);
}

/**
 * Simulate natural user behavior before clicking message button
 */
export async function simulateNaturalBehavior(page: Page): Promise<void> {
	// 1. Scroll page naturally to see the button
	getLogger().info("ACTION", "Scrolling page naturally like a real user");
	await page.evaluate(() => {
		window.scrollBy(0, Math.random() * 200 + 100);
	});
	await sleep(500 + Math.random() * 500);

	// 2. Move mouse around naturally (looking at profile)
	getLogger().info("ACTION", "Moving mouse naturally around the page");
	for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
		const randomX = Math.random() * 800 + 200;
		const randomY = Math.random() * 600 + 200;
		await page.mouse.move(randomX, randomY, {
			steps: 20 + Math.floor(Math.random() * 20),
		});
		await sleep(200 + Math.random() * 400);
	}
}

/**
 * Find the Message button on the profile page
 */
export async function findMessageButton(page: Page): Promise<ButtonInfo | null> {
	return await page.evaluate(() => {
		// Modern IG often uses <div role="button"> for the Message control.
		const buttons = Array.from(
			document.querySelectorAll('button, a, div[role="button"]'),
		);
		for (const btn of buttons) {
			const text = (btn.textContent || "").trim().toLowerCase();
			// Allow variants like "message", "message again", etc.
			if (text.includes("message")) {
				const rect = btn.getBoundingClientRect();
				// Check if button is visible in viewport
				const isVisible =
					rect.top >= 0 &&
					rect.left >= 0 &&
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
}

/**
 * Scroll to make button visible if needed
 */
export async function scrollToButtonIfNeeded(
	page: Page,
	buttonInfo: ButtonInfo,
): Promise<ButtonInfo> {
	if (!buttonInfo.isVisible) {
		getLogger().info("ACTION", "Button not visible, scrolling to it naturally");
		await page.evaluate((targetY) => {
			const currentScroll = window.pageYOffset;
			const distance = targetY - currentScroll - 300; // Scroll to show button
			window.scrollBy({
				top: distance,
				behavior: "smooth",
			});
		}, buttonInfo.y);
		await sleep(1000 + Math.random() * 1000);

		// Re-get coordinates after scroll
		const newButtonInfo = await findMessageButton(page);
		if (newButtonInfo) {
			return newButtonInfo;
		}
	}
	return buttonInfo;
}

/**
 * Move mouse in natural curved path to button and click it
 */
export async function clickMessageButton(
	page: Page,
	buttonInfo: ButtonInfo,
): Promise<void> {
	// 5. Move mouse in NATURAL CURVED PATH to button (not straight line)
	getLogger().info(
		"ACTION",
		"Moving mouse in natural curved path to Message button",
	);
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
		const midX =
			currentPos.x +
			(buttonInfo.x - currentPos.x) * t +
			(Math.random() - 0.5) * 100;
		const midY =
			currentPos.y +
			(buttonInfo.y - currentPos.y) * t +
			(Math.random() - 0.5) * 50;
		waypoints.push({ x: midX, y: midY });
	}

	// Move through waypoints (natural path)
	for (const waypoint of waypoints) {
		await page.mouse.move(waypoint.x, waypoint.y, {
			steps: 15 + Math.floor(Math.random() * 10),
		});
		await sleep(50 + Math.random() * 100);
	}

	// 6. Move near button, pause, then move to it (human behavior)
	const nearX = buttonInfo.x - 30 + Math.random() * 60;
	const nearY = buttonInfo.y - 20 + Math.random() * 40;
	await page.mouse.move(nearX, nearY, { steps: 10 });
	await sleep(300 + Math.random() * 500); // Pause like reading

	// 7. Final movement to button center with small random offset
	const finalX =
		buttonInfo.x + (Math.random() - 0.5) * (buttonInfo.width * 0.2);
	const finalY =
		buttonInfo.y + (Math.random() - 0.5) * (buttonInfo.height * 0.2);
	await page.mouse.move(finalX, finalY, {
		steps: 8 + Math.floor(Math.random() * 5),
	});

	// 8. Hover over button (real user pauses before clicking)
	await sleep(400 + Math.random() * 600);

	// 9. Click with natural timing
	getLogger().info(
		"ACTION",
		"Clicking Message button with natural cursor movement",
	);
	await page.mouse.down();
	await sleep(80 + Math.random() * 120); // Natural click hold time
	await page.mouse.up();

	getLogger().info(
		"ACTION",
		"Message button clicked - mimicked real user exactly",
	);
	await sleep(1000 + Math.random() * 1000);
}

/**
 * Navigate to DM thread after clicking message button
 */
export async function navigateToDmThread(
	page: Page,
	username: string,
	messageButtonClicked: boolean,
): Promise<void> {
	if (!messageButtonClicked) {
		// Fallback: try direct navigation to DM thread
		getLogger().info("ACTION", "Message button not found, trying direct DM URL");
		// await page.goto(`https://www.instagram.com/direct/t/${u}/`, {
		// 	waitUntil: "networkidle2",
		// 	timeout: 15000,
		// });
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
			{ steps: 15 },
		);
		await sleep(1000 + Math.random() * 1000);
	}

	// Handle any remaining popups before proceeding
	await handleInstagramPopups(page);
}

