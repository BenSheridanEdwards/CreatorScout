/**
 * Profile navigation and status checking utilities.
 */
import type { Page } from "puppeteer";
import { login } from "../../auth/login/login.ts";
import { parseProfileStatus } from "../../profile/profileStatus/profileStatus.ts";
import { IG_PASS, IG_USER } from "../../shared/config/config.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

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
		await sleep(1000);

		// Verify the main frame is accessible by checking page URL
		try {
			page.url(); // This will throw if frame is detached
			return true; // Frame is stable
		} catch (frameError) {
			const errorMsg =
				frameError instanceof Error ? frameError.message : String(frameError);

			// Wait a bit more and try again
			await sleep(2000);

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
	options?: { timeout?: number },
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
				const tagName = await page.evaluate(
					(el) => el.tagName.toLowerCase(),
					element,
				);
				if (tagName === "input") {
					await element.click({ delay: 100 + Math.random() * 100 });
					searchClicked = true;
					break;
				} else {
					await element.click({ delay: 100 + Math.random() * 100 });
					await sleep(1500 + Math.random() * 1000);
					const searchInput = await page.$(
						'input[placeholder*="Search"], input[aria-label*="Search"]',
					);
					if (searchInput) {
						await searchInput.click({ delay: 100 + Math.random() * 100 });
						searchClicked = true;
						break;
					}
				}
			}
		} catch {
			continue;
		}
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
				await exploreLink.click({ delay: 100 + Math.random() * 100 });
				console.log("NAVIGATE", "✅ Clicked explore link");
				await sleep(2000);
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
		await sleep(2000);
		const searchInput = await page.$(
			'input[placeholder*="Search"], input[aria-label*="Search"]',
		);
		if (searchInput) {
			await searchInput.click({ delay: 100 + Math.random() * 100 });
			searchClicked = true;
		}
	}

	if (!searchClicked) {
		throw new Error("Could not find or click search input");
	}

	await sleep(500 + Math.random() * 500);

	// Type the username character by character
	for (const char of u) {
		await page.keyboard.type(char, { delay: 100 + Math.random() * 150 });
		await sleep(50 + Math.random() * 100);
	}

	await sleep(1500 + Math.random() * 1000);

	// Find and click the profile in search results
	const profileFound = await page.evaluate((targetUsername) => {
		const links = Array.from(document.querySelectorAll('a[href*="/"]'));
		for (const link of links) {
			const href = link.getAttribute("href") || "";
			const text = (link.textContent || "").toLowerCase();
			if (
				href.includes(`/${targetUsername}/`) ||
				text.includes(targetUsername) ||
				text.includes(`@${targetUsername}`)
			) {
				if (
					href.match(/^\/[^\/]+\/?$/) ||
					href.includes(`/${targetUsername}/`)
				) {
					(link as HTMLElement).click();
					return true;
				}
			}
		}
		return false;
	}, u);

	if (!profileFound) {
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

	await sleep(2000 + Math.random() * 2000);
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
 * Ensure we're logged in, re-logging if necessary.
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
	// Check if logged in by looking for multiple indicators.
	// Use element queries instead of page.evaluate so unit tests can mock easily.
	const inboxLink = await page.$('a[href="/direct/inbox/"]');
	if (inboxLink) return; // Strong signal we're logged in

	const [profileLink, createButton, homeIcon, loginButton] = await Promise.all([
		page.$('[aria-label*="profile"]'),
		page.$('[aria-label*="create"]'),
		page.$('[aria-label*="home"]'),
		page.$('a[href*="/accounts/login"]'),
	]);

	const isLoggedIn = (profileLink || createButton || homeIcon) && !loginButton;

	if (isLoggedIn) {
		return; // Already logged in
	}

	// Need to log in - add realistic human delay before attempting
	console.log("🔐 Not logged in, preparing to login...");
	await sleep(2000 + Math.random() * 3000); // 2-5 second human-like pause

	if (!IG_USER || !IG_PASS) {
		throw new Error(
			"Instagram credentials not configured. Set IG_USER and IG_PASS environment variables.",
		);
	}

	// Ensure frame is stable before attempting login (prevents detached frame errors)
	try {
		// Check if page is closed
		if (page?.isClosed()) {
			throw new Error("Page is closed, cannot login");
		}

		// Try to access frame - this will throw if detached
		page.url();
	} catch (frameError) {
		const errorMsg =
			frameError instanceof Error ? frameError.message : String(frameError);

		// If frame is detached, wait for stability before proceeding
		if (errorMsg.includes("detached Frame")) {
			console.warn(
				"⚠️ Frame is detached, waiting for stability before login...",
			);
			await waitForFrameStability(page, 5000);

			// Verify frame is now accessible
			try {
				page.url();
			} catch (retryError) {
				throw new Error(
					`Frame remains detached after stability wait: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
				);
			}
		} else {
			// Re-throw other errors
			throw frameError;
		}
	}

	await login(page, { username: IG_USER, password: IG_PASS });
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
