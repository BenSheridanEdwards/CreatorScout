import type { Page } from "puppeteer";
import { clickAny } from "../../navigation/clickAny/clickAny.ts";
import {
	isLoggedIn,
	loadCookies,
	saveCookies,
} from "../sessionManager/sessionManager.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";

export type Credentials = {
	username: string;
	password: string;
};

const logger = createLogger(process.env.DEBUG_LOGS === "true");

export async function login(
	page: Page,
	creds: Credentials,
	options?: {
		/**
		 * When true, fill credentials, optionally screenshot, and return without submitting.
		 */
		skipSubmit?: boolean;
		/**
		 * When true, skip loading saved cookies from persistent profile.
		 */
		skipCookies?: boolean;
	},
): Promise<string | void> {
	logger.info("ACTION", `Starting login process for user: ${creds.username}`);

	// Navigate to Instagram first (required before setting cookies)
	logger.info("ACTION", "Navigating to Instagram homepage");
	await page.goto("https://www.instagram.com/", {
		waitUntil: "domcontentloaded",
		timeout: 15000,
	});
	logger.info("ACTION", "Successfully navigated to Instagram homepage");

	// Try to load saved cookies after navigation (unless skipped)
	let cookiesLoaded = false;
	if (!options?.skipCookies) {
		logger.info("ACTION", "Attempting to load saved cookies");
		cookiesLoaded = await loadCookies(page);
		logger.info("ACTION", `Cookies loaded: ${cookiesLoaded}`);
	} else {
		logger.info("ACTION", "Skipping cookie loading as requested");
	}

	// Check if we're already logged in (either from cookies or previous session)
	// Give cookies a moment to apply, then check current session
	logger.info(
		"ACTION",
		"Waiting for cookies to apply and checking login status",
	);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const alreadyLoggedIn = await isLoggedIn(page);
	logger.info("ACTION", `Already logged in check: ${alreadyLoggedIn}`);

	if (alreadyLoggedIn) {
		logger.info("ACTION", "Already logged in (using saved session)");
		// Refresh cookies to extend expiration
		await saveCookies(page);
		logger.info("ACTION", "Cookies refreshed for existing session");
		return;
	}

	// If cookies were loaded but we're not logged in, they may be expired
	if (cookiesLoaded) {
		logger.warn(
			"ACTION",
			"Cookies loaded but session expired, reloading page for fresh login...",
		);
		// Only reload if cookies were loaded but session expired
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle2",
			timeout: 15000,
		});
		logger.info("ACTION", "Page reloaded successfully");
	} else {
		logger.info("ACTION", "No cookies loaded, proceeding with fresh login on current page");
	}

	logger.info("ACTION", "Handling cookie consent dialog");
	await clickAny(page, [
		"Allow all cookies",
		"Allow essential and optional cookies",
		"Decline optional cookies",
	]);
	logger.info("ACTION", "Cookie consent handled");

	// Wait for login form or already logged in state
	logger.info("ACTION", "Waiting for login form to appear");
	try {
		await page.waitForSelector('input[name="username"]', { timeout: 5000 });
		logger.info("ACTION", "Login form found and ready");
	} catch {
		logger.warn(
			"ACTION",
			"Login form selector timeout, checking if already logged in",
		);
		// Check if we're already logged in (maybe cookies worked)
		const loggedIn = await page.$('a[href="/direct/inbox/"]');
		if (loggedIn) {
			logger.info("ACTION", "Already logged in (cookies restored session)");
			// Save cookies again to refresh expiration
			await saveCookies(page);
			logger.info("ACTION", "Cookies refreshed for restored session");
			return;
		}
		logger.error("ACTION", "Could not find login form");
		throw new Error("Could not find login form");
	}

	logger.info("ACTION", `Filling in credentials for user: ${creds.username}`);
	await page.type('input[name="username"]', creds.username, { delay: 5 });
	logger.info("ACTION", "Username entered");
	await page.type('input[name="password"]', creds.password, { delay: 5 });
	logger.info("ACTION", "Password entered");

	if (options?.skipSubmit) {
		logger.info(
			"ACTION",
			"Skip submit requested - checking if already logged in before taking screenshot",
		);
		if (!alreadyLoggedIn) {
			logger.info(
				"ACTION",
				"Not logged in, taking screenshot before skip submit",
			);
			logger.info("ACTION", "Waiting 20 seconds before taking screenshot...");
			await new Promise((resolve) => setTimeout(resolve, 20000));
			logger.info("ACTION", "20 second wait completed, taking screenshot now");
			const savedPath = await snapshot(
				page,
				`instagram-login-filled-${creds.username}-${Date.now()}`,
			);
			logger.info(
				"ACTION",
				`Skip submit completed; captured screenshot at ${savedPath}`,
			);
		} else {
			logger.info(
				"ACTION",
				"Already logged in, skipping screenshot on skip submit",
			);
		}
		return;
	}

	logger.info("ACTION", "Submitting login form");
	await page.click('button[type="submit"]');
	logger.info("ACTION", "Login form submitted");

	// Wait for navigation after login
	logger.info("ACTION", "Waiting for login to complete and inbox to load");
	try {
		await page.waitForSelector('a[href="/direct/inbox/"]', { timeout: 15000 });
		logger.info("ACTION", "Login successful - inbox link found");

		// Save cookies after successful login
		await saveCookies(page);
		logger.info("ACTION", "Cookies saved after successful login");
	} catch {
		const currentUrl = page.url();
		logger.warn("ACTION", `Login timeout - current URL: ${currentUrl}`);

		// Check if login failed with an error message
		logger.info("ACTION", "Checking for error messages on page");
		const errorText = await page.evaluate(() => {
			const el = document.body;
			return (
				el?.innerText?.includes("couldn't connect") ||
				el?.innerText?.includes("incorrect") ||
				el?.innerText?.includes("Sorry") ||
				el?.innerText?.includes("suspended") ||
				el?.innerText?.includes("challenge") ||
				el?.innerText?.includes("verify") ||
				el?.innerText?.includes("suspicious")
			);
		});
		if (errorText) {
			logger.error("ACTION", "Login error detected on page");
			const bodyText = await page.evaluate(() => document.body.innerText || "");
			const errorPreview = bodyText.substring(0, 300).replace(/\n/g, " ");
			throw new Error(
				`Login failed - Instagram may be showing an error or challenge. Page preview: ${errorPreview}`,
			);
		}
		// Check if we're already on a different page (maybe logged in but different UI)
		if (
			currentUrl.includes("instagram.com") &&
			!currentUrl.includes("/accounts/login")
		) {
			logger.warn(
				"ACTION",
				"Login may have succeeded but inbox link not found. Continuing anyway...",
			);
			// Try to continue - might be logged in but UI changed
			return;
		}
		logger.error("ACTION", "Login timeout - could not complete login process");
		throw new Error(
			"Login timeout - could not find inbox link after 15 seconds. Instagram may be blocking headless browsers or requiring verification.",
		);
	}

	// Dismiss popups
	logger.info("ACTION", "Dismissing post-login popups");
	await clickAny(page, ["Not Now", "Not now", "Skip"]);
	logger.info("ACTION", "First popup dismissed");
	await clickAny(page, ["Not Now", "Not now", "Skip"]);
	logger.info("ACTION", "Second popup dismissed");
	logger.info("ACTION", "Login process completed successfully");
}
