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
 * Navigate to a profile and wait for it to load.
 */
export async function navigateToProfile(
	page: Page,
	username: string,
	options?: { timeout?: number; waitForHeader?: boolean },
): Promise<void> {
	const { timeout = 20000, waitForHeader = false } = options || {};

	await page.goto(`https://www.instagram.com/${username}/`, {
		waitUntil: "networkidle2",
		timeout,
	});

	// Wait for profile content to load
	await sleep(3000);

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
	// Check if logged in by looking for multiple indicators
	const isLoggedIn = await page.evaluate(() => {
		const inboxLink = document.querySelector('a[href="/direct/inbox/"]');
		const profileLink = document.querySelector('[aria-label*="profile"]');
		const createButton = document.querySelector('[aria-label*="create"]');
		const homeIcon = document.querySelector('[aria-label*="home"]');
		const loginButton = document.querySelector('a[href*="/accounts/login"]');

		// Logged in if we have navigation elements and no login button
		return (
			(inboxLink || profileLink || createButton || homeIcon) && !loginButton
		);
	});

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
