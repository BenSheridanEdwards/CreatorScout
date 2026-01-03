/**
 * Navigation logic for DM flow - navigating to profile and clicking message button
 * Uses ghost-cursor for human-like interactions to avoid bot detection.
 */
import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { handleInstagramPopups } from "./popupHandler.ts";
import {
	humanClick,
	humanScroll,
	getGhostCursor,
} from "../../navigation/humanInteraction/humanInteraction.ts";

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
 * Navigate to user's profile using search (more human-like, avoids detection)
 */
async function navigateToProfileViaSearch(
	page: Page,
	username: string,
): Promise<void> {
	const u = username.toLowerCase().trim();
	getLogger().info("ACTION", `Navigating to profile via search: @${u}`);

	// Ensure we're on Instagram homepage (or any Instagram page) using UI
	const currentUrl = page.url();
	if (!currentUrl.includes("instagram.com")) {
		getLogger().info(
			"ACTION",
			"Not on Instagram, navigating to homepage via UI",
		);
		try {
			const { navigateToHomeViaUI, verifyHomePageLoaded } = await import(
				"../../shared/pageVerification/pageVerification.ts"
			);
			await navigateToHomeViaUI(page);
			await verifyHomePageLoaded(page);
		} catch (err) {
			getLogger().warn(
				"ACTION",
				`UI navigation to homepage failed (may already be on Instagram): ${err}`,
			);
		}
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
				const tagName = await page.evaluate(
					(el) => el.tagName.toLowerCase(),
					element,
				);
				if (tagName === "input") {
					await humanClick(page, element, { elementType: "input" });
					searchClicked = true;
					getLogger().info(
						"ACTION",
						`Found and clicked search input: ${selector} (human-like)`,
					);
					break;
				} else {
					// It's a link/icon - click to navigate to search page
					await humanClick(page, element, { elementType: "link" });
					await sleep(1500 + Math.random() * 1000);
					// Now look for the search input on the search page
					const searchInput = await page.$(
						'input[placeholder*="Search"], input[aria-label*="Search"]',
					);
					if (searchInput) {
						await humanClick(page, searchInput, { elementType: "input" });
						searchClicked = true;
						getLogger().info(
							"ACTION",
							`Opened search page and clicked input (human-like)`,
						);
						break;
					}
				}
			}
		} catch {}
	}

	if (!searchClicked) {
		// Fallback: try navigating to explore/search page directly via UI
		getLogger().info(
			"ACTION",
			"Search icon not found, navigating to explore page via UI",
		);
		try {
			const exploreLink = await page.$('a[href="/explore/"]');
			if (exploreLink) {
				await humanClick(page, exploreLink, { elementType: "link" });
				getLogger().info("ACTION", "✅ Clicked explore link (human-like)");
				await sleep(2000);
				const { verifyExplorePageLoaded } = await import(
					"../../shared/pageVerification/pageVerification.ts"
				);
				await verifyExplorePageLoaded(page);
			} else {
				throw new Error("Could not find explore link");
			}
		} catch (err) {
			getLogger().warn(
				"ACTION",
				`UI navigation to explore page failed: ${err}`,
			);
		}
		await sleep(2000);
		const searchInput = await page.$(
			'input[placeholder*="Search"], input[aria-label*="Search"]',
		);
		if (searchInput) {
			await humanClick(page, searchInput, { elementType: "input" });
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

	// Find the profile in search results and click it with human-like behavior
	getLogger().info("ACTION", "Looking for profile in search results");
	const profileLinkInfo = await page.evaluate((targetUsername) => {
		// Look for profile links in search results
		const links = Array.from(document.querySelectorAll('a[href*="/"]'));
		for (let i = 0; i < links.length; i++) {
			const link = links[i];
			const href = link.getAttribute("href") || "";
			const text = (link.textContent || "").toLowerCase();
			// Match exact username in href or text
			if (
				href.includes(`/${targetUsername}/`) ||
				text.includes(targetUsername) ||
				text.includes(`@${targetUsername}`)
			) {
				// Make sure it's a profile link, not something else
				if (
					href.match(/^\/[^/]+\/?$/) ||
					href.includes(`/${targetUsername}/`)
				) {
					return { found: true, href, index: i };
				}
			}
		}
		return { found: false };
	}, u);

	if (profileLinkInfo.found && profileLinkInfo.href) {
		// Find the element again and click it with human-like behavior
		const profileLink = await page.$(`a[href="${profileLinkInfo.href}"]`);
		if (profileLink) {
			await humanClick(page, profileLink, { elementType: "link" });
		} else {
			throw new Error(`Could not re-find profile link for @${u}`);
		}
	} else {
		// Try alternative: look for divs with role="link" or buttons
		const altLinkInfo = await page.evaluate((targetUsername) => {
			const clickableElements = Array.from(
				document.querySelectorAll('div[role="link"], div[role="button"], a'),
			);
			for (let i = 0; i < clickableElements.length; i++) {
				const el = clickableElements[i];
				const text = (el.textContent || "").toLowerCase();
				const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
				if (
					text.includes(targetUsername) ||
					text.includes(`@${targetUsername}`) ||
					ariaLabel.includes(targetUsername)
				) {
					return { found: true, index: i };
				}
			}
			return { found: false };
		}, u);

		if (altLinkInfo.found && typeof altLinkInfo.index === "number") {
			const elements = await page.$$('div[role="link"], div[role="button"], a');
			const targetElement = elements[altLinkInfo.index];
			if (targetElement) {
				await humanClick(page, targetElement, { elementType: "link" });
			} else {
				throw new Error(`Could not find profile @${u} in search results`);
			}
		} else {
			throw new Error(`Could not find profile @${u} in search results`);
		}
	}

	// Wait for profile page to load
	getLogger().info("ACTION", "Waiting for profile page to load");
	await sleep(2000 + Math.random() * 2000);

	// Verify profile page is loaded with content checks
	try {
		const { verifyProfilePageLoaded } = await import(
			"../../shared/pageVerification/pageVerification.ts"
		);
		await verifyProfilePageLoaded(page, username);
	} catch (err) {
		getLogger().warn("ACTION", `Profile page verification failed: ${err}`);
	}

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

	// Simulate reading the profile using ghost-cursor for natural movement
	const cursor = await getGhostCursor(page);
	await cursor.moveTo({
		x: Math.random() * 500 + 200,
		y: Math.random() * 300 + 200,
	});
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
	// Use ONLY search-based navigation - no fallback to direct URL
	// This is more human-like and avoids frame detachment issues
	await navigateToProfileViaSearch(page, username);
}

/**
 * Simulate natural user behavior before clicking message button
 * Uses ghost-cursor for human-like mouse movements
 */
export async function simulateNaturalBehavior(page: Page): Promise<void> {
	// 1. Scroll page naturally to see the button using ghost-cursor
	getLogger().info("ACTION", "Scrolling page naturally like a real user");
	await humanScroll(page, { deltaY: Math.random() * 200 + 100 });

	// 2. Move mouse around naturally using ghost-cursor (looking at profile)
	getLogger().info("ACTION", "Moving mouse naturally around the page");
	const cursor = await getGhostCursor(page);
	for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
		const randomX = Math.random() * 800 + 200;
		const randomY = Math.random() * 600 + 200;
		await cursor.moveTo({ x: randomX, y: randomY });
		await sleep(200 + Math.random() * 400);
	}
}

/**
 * Find the Message button on the profile page
 */
export async function findMessageButton(
	page: Page,
): Promise<ButtonInfo | null> {
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
 * Scroll to make button visible if needed (uses smooth scrolling)
 */
export async function scrollToButtonIfNeeded(
	page: Page,
	buttonInfo: ButtonInfo,
): Promise<ButtonInfo> {
	if (!buttonInfo.isVisible) {
		getLogger().info("ACTION", "Button not visible, scrolling to it naturally");
		const currentScroll = await page.evaluate(() => window.pageYOffset);
		const distance = buttonInfo.y - currentScroll - 300; // Scroll to show button
		await humanScroll(page, { deltaY: distance });
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
 * Uses ghost-cursor for sophisticated human-like movement
 */
export async function clickMessageButton(
	page: Page,
	buttonInfo: ButtonInfo,
): Promise<void> {
	getLogger().info(
		"ACTION",
		"Moving mouse in natural curved path to Message button using ghost-cursor",
	);

	const cursor = await getGhostCursor(page);

	// Move to target with ghost-cursor's natural bezier curves
	// Add a small random offset for natural clicking
	const targetX =
		buttonInfo.x + (Math.random() - 0.5) * (buttonInfo.width * 0.3);
	const targetY =
		buttonInfo.y + (Math.random() - 0.5) * (buttonInfo.height * 0.3);

	await cursor.moveTo({ x: targetX, y: targetY });

	// Hover over button (real user pauses before clicking)
	await sleep(400 + Math.random() * 600);

	// Click using ghost-cursor's natural click method
	getLogger().info("ACTION", "Clicking Message button with ghost-cursor");
	await cursor.click();

	getLogger().info(
		"ACTION",
		"Message button clicked - mimicked real user with ghost-cursor",
	);
	await sleep(1000 + Math.random() * 1000);
}

/**
 * Navigate to DM thread after clicking message button
 */
export async function navigateToDmThread(
	page: Page,
	_username: string,
	messageButtonClicked: boolean,
): Promise<void> {
	if (!messageButtonClicked) {
		// Fallback: try direct navigation to DM thread
		getLogger().info(
			"ACTION",
			"Message button not found, trying direct DM URL",
		);
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

		// Simulate reading the DM interface using ghost-cursor
		const cursor = await getGhostCursor(page);
		await cursor.moveTo({
			x: Math.random() * 400 + 300,
			y: Math.random() * 200 + 200,
		});
		await sleep(1000 + Math.random() * 1000);
	}

	// Handle any remaining popups before proceeding
	await handleInstagramPopups(page);
}
