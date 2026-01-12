/**
 * Profile navigation and status checking utilities.
 * Uses human-like interactions via ghost-cursor to avoid bot detection.
 */
import type { Page } from "puppeteer";
import { parseProfileStatus } from "../../profile/profileStatus/profileStatus.ts";
import { humanTypeText, shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanClick } from "../humanInteraction/humanInteraction.ts";

export interface ProfileStatus {
	isPrivate: boolean;
	notFound: boolean;
	isAccessible: boolean;
}

/**
 * Wait for frame stability after navigation (critical for Browserless)
 * This ensures any detached frames from previous navigation are cleared
 * Returns true if frame is stable, throws recoverable error if permanently detached
 */
// biome-ignore lint/correctness/noUnusedVariables: Kept for future use
async function waitForFrameStability(
	page: Page,
	timeout: number = 5000,
): Promise<boolean> {
	try {
		// Wait for the main frame to be ready
		await page.waitForFunction(() => document.readyState === "complete", {
			timeout,
		});

		// Additional wait for frame stability in Browserless
		await shortDelay(0.5, 1);

		// Verify the main frame is accessible by checking page URL
		try {
			page.url(); // This will throw if frame is detached
			return true; // Frame is stable
		} catch (frameError) {
			const errorMsg =
				frameError instanceof Error ? frameError.message : String(frameError);

			// Wait a bit more and try again
			await shortDelay(1, 2);

			try {
				page.url(); // Verify again
				return true; // Frame recovered
			} catch (retryError) {
				// Frame is permanently detached - throw recoverable error
				const retryMsg =
					retryError instanceof Error ? retryError.message : String(retryError);
				throw new Error(
					`Frame remains detached after retry: ${retryMsg}. Original error: ${errorMsg}`,
				);
			}
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);

		// If it's a detached frame error, throw it as a recoverable error
		if (errorMsg.includes("detached Frame")) {
			throw new Error(`Frame is permanently detached: ${errorMsg}`);
		}

		// For timeout or other errors, log and throw recoverable error
		console.warn(`Frame stability check timed out or failed: ${err}`);
		throw new Error(`Frame stability check failed: ${errorMsg}`);
	}
}

/**
 * Navigate to a profile using search (more human-like, avoids detection)
 */
async function navigateToProfileViaSearch(
	page: Page,
	username: string,
	_options?: { timeout?: number },
): Promise<void> {
	const u = username.toLowerCase().trim();

	// Ensure we're on Instagram homepage (or any Instagram page) using UI
	const currentUrl = page.url();
	if (!currentUrl.includes("instagram.com")) {
		console.log("NAVIGATE", "Not on Instagram, navigating to homepage via UI");
		try {
			const { navigateToHomeViaUI, verifyHomePageLoaded } = await import(
				"../../shared/pageVerification/pageVerification.ts"
			);
			await navigateToHomeViaUI(page);
			await verifyHomePageLoaded(page);
		} catch (err) {
			console.warn(
				`UI navigation to homepage failed (may already be on Instagram): ${err}`,
			);
		}
		await sleep(2000 + Math.random() * 2000);
	}

	// Find and click the search icon/input
	// IMPORTANT: Prioritize actual search elements over explore link
	// On modern Instagram, the search icon opens a search panel directly
	const searchSelectors = [
		'svg[aria-label="Search"]',           // Search icon in sidebar (primary)
		'a[aria-label="Search"]',             // Search link
		'input[placeholder*="Search"]',       // Direct search input
		'input[aria-label*="Search"]',        // Search input by aria-label
		'a[href="/explore/"]',                // Explore page (last resort - opens different page)
		'div[role="link"][href="/explore/"]', // Explore link variant
	];

	let searchClicked = false;
	for (const selector of searchSelectors) {
		try {
			const element = await page.$(selector);
			if (element) {
				const tagName = await page.evaluate(
					(el) => el.tagName.toLowerCase(),
					element,
				);
				if (tagName === "input") {
					await humanClick(page, element, { elementType: "input" });
					searchClicked = true;
					break;
				} else {
					await humanClick(page, element, { elementType: "link" });
					await sleep(1500 + Math.random() * 1000);
					const searchInput = await page.$(
						'input[placeholder*="Search"], input[aria-label*="Search"]',
					);
					if (searchInput) {
						await humanClick(page, searchInput, { elementType: "input" });
						searchClicked = true;
						break;
					}
				}
			}
		} catch {}
	}

	if (!searchClicked) {
		// Navigate to explore page via UI (clicking explore link)
		console.log(
			"NAVIGATE",
			"Search icon not found, navigating to explore page via UI",
		);
		try {
			const exploreLink = await page.$('a[href="/explore/"]');
			if (exploreLink) {
				await humanClick(page, exploreLink, { elementType: "link" });
				console.log("NAVIGATE", "✅ Clicked explore link (human-like)");
				await shortDelay(1, 2);
				const { verifyExplorePageLoaded } = await import(
					"../../shared/pageVerification/pageVerification.ts"
				);
				await verifyExplorePageLoaded(page);
			} else {
				throw new Error("Could not find explore link");
			}
		} catch (err) {
			console.warn(`UI navigation to explore page failed: ${err}`);
		}
		await shortDelay(1, 2);
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

	// Use humanTypeText for stealth - handles clicking and typing with human-like patterns
	const searchSelector =
		'input[placeholder*="Search"], input[aria-label*="Search"]';
	const typed = await humanTypeText(page, searchSelector, u, {
		clearFirst: true,
		typeDelay: 100 + Math.random() * 50, // 100-150ms per character
		wordPause: 200 + Math.random() * 100,
		mistakeRate: 0.01, // Very low typo rate for usernames (1%)
		correctionDelay: 300 + Math.random() * 200,
	});

	if (!typed) {
		throw new Error("Failed to type username in search");
	}

	await sleep(1500 + Math.random() * 1000);

	// Find the profile in search results and click it using human-like click
	const profileLinkInfo = await page.evaluate((targetUsername) => {
		const links = Array.from(document.querySelectorAll('a[href*="/"]'));
		for (let i = 0; i < links.length; i++) {
			const link = links[i];
			const href = link.getAttribute("href") || "";
			const text = (link.textContent || "").toLowerCase();
			if (
				href.includes(`/${targetUsername}/`) ||
				text.includes(targetUsername) ||
				text.includes(`@${targetUsername}`)
			) {
				if (
					href.match(/^\/[^/]+\/?$/) ||
					href.includes(`/${targetUsername}/`)
				) {
					// Return the href so we can find and click it properly
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
		// Try alternative search for clickable elements
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
					// Return identifying info
					const tagName = el.tagName.toLowerCase();
					const href = el.getAttribute("href");
					return { found: true, index: i, tagName, href };
				}
			}
			return { found: false };
		}, u);

		if (altLinkInfo.found && typeof altLinkInfo.index === "number") {
			// Re-select and click with human-like behavior
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

	await sleep(2000 + Math.random() * 2000);

	// Check if we've been logged out during navigation
	const checkUrl = page.url();
	const isLoginPage = checkUrl.includes("/accounts/login/");
	if (isLoginPage) {
		const { clearCookies } = await import(
			"../../auth/sessionManager/sessionManager.ts"
		);
		clearCookies();
		throw new Error(
			"Session expired - redirected to login page during navigation",
		);
	}
}

/**
 * Navigate to a profile and wait for it to load.
 * Uses ONLY search-based navigation (no direct URL navigation) to avoid detection.
 */
export async function navigateToProfile(
	page: Page,
	username: string,
	options?: { timeout?: number; waitForHeader?: boolean },
): Promise<void> {
	const { timeout = 20000, waitForHeader = false } = options || {};

	// Use ONLY search-based navigation - no fallback to direct URL
	// This is more human-like and avoids frame detachment issues
	await navigateToProfileViaSearch(page, username, { timeout });

	// Double-check we're still logged in after navigation
	const finalUrl = page.url();
	if (finalUrl.includes("/accounts/login/")) {
		const { clearCookies } = await import(
			"../../auth/sessionManager/sessionManager.ts"
		);
		clearCookies();
		throw new Error(
			"Session expired - redirected to login page after navigation",
		);
	}

	// Verify profile page is loaded
	try {
		const { verifyProfilePageLoaded } = await import(
			"../../shared/pageVerification/pageVerification.ts"
		);
		await verifyProfilePageLoaded(page, username);
	} catch (err) {
		console.warn(`Profile page verification failed: ${err}`);
	}

	if (waitForHeader) {
		try {
			await page.waitForSelector("header", { timeout: 5000 });
		} catch {
			// Header not found, but continue anyway
		}
	}
}

/**
 * Check profile status (private, not found, accessible).
 */
export async function checkProfileStatus(page: Page): Promise<ProfileStatus> {
	const bodyText = await page.evaluate(() => document.body.innerText || "");
	const status = parseProfileStatus(bodyText);

	return {
		isPrivate: status.isPrivate,
		notFound: status.notFound,
		isAccessible: !status.isPrivate && !status.notFound,
	};
}

/**
 * Verify if user is logged in to Instagram.
 * Returns true if logged in, false otherwise.
 */
export async function verifyLoggedIn(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const hasInbox =
			document.querySelector('a[href="/direct/inbox/"]') !== null;
		const hasHomeIcon = Array.from(document.querySelectorAll("svg")).some(
			(svg) => svg.getAttribute("aria-label") === "Home",
		);
		const hasLoginButton = Array.from(document.querySelectorAll("button")).some(
			(btn) => btn.textContent?.includes("Log in"),
		);
		return hasInbox || hasHomeIcon || !hasLoginButton;
	});
}

/**
 * Navigate to profile and ensure it's accessible.
 * Returns status information.
 */
export async function navigateToProfileAndCheck(
	page: Page,
	username: string,
	options?: { timeout?: number; waitForHeader?: boolean },
): Promise<ProfileStatus> {
	await navigateToProfile(page, username, options);
	return await checkProfileStatus(page);
}
