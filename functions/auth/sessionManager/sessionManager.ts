/**
 * Session management for Instagram - saves and reuses cookies to avoid repeated logins.
 * This helps prevent Instagram from flagging the account for suspicious activity.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const SESSION_DIR = join(process.cwd(), ".sessions");
const COOKIES_FILE = join(SESSION_DIR, "instagram_cookies.json");
const logger = createLogger();

/**
 * Ensure session directory exists
 */
function ensureSessionDir(): void {
	if (!existsSync(SESSION_DIR)) {
		mkdirSync(SESSION_DIR, { recursive: true });
	}
}

/**
 * Save cookies from a page to disk
 */
export async function saveCookies(page: Page): Promise<void> {
	try {
		ensureSessionDir();
		const cookies = await page.cookies();
		writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
		logger.info("ACTION", `Saved ${cookies.length} cookies to session file`);
	} catch (error) {
		logger.error("ERROR", `Failed to save cookies: ${error}`);
	}
}

/**
 * Load cookies from disk and set them on a page
 */
export async function loadCookies(page: Page): Promise<boolean> {
	try {
		if (!existsSync(COOKIES_FILE)) {
			return false;
		}

		const cookiesJson = readFileSync(COOKIES_FILE, "utf-8");
		const cookies = JSON.parse(cookiesJson);

		if (!Array.isArray(cookies) || cookies.length === 0) {
			return false;
		}

		// Set cookies before navigating
		await page.setCookie(...cookies);
		logger.info("ACTION", `Loaded ${cookies.length} cookies from session file`);
		return true;
	} catch (error) {
		logger.error("ERROR", `Failed to load cookies: ${error}`);
		return false;
	}
}

/**
 * Check if we're already logged in by checking for multiple indicators
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
	try {
		// First check: Are we on a login page? If not on login page and on instagram.com, likely logged in
		const currentUrl = page.url();
		const isOnLoginPage = currentUrl.includes("/accounts/login");

		// Use page.evaluate for more reliable detection
		const result = await page.evaluate(() => {
			// Check for multiple logged-in indicators
			const inboxLink = !!document.querySelector('a[href="/direct/inbox/"]');
			const profileLink = !!document.querySelector('[aria-label*="profile"]');
			const createButton = !!document.querySelector('[aria-label*="create"]');
			const homeIcon = !!document.querySelector('svg[aria-label="Home"]');
			const feed = !!document.querySelector('[role="main"]');
			const navigation = !!document.querySelector("nav");
			const homeLink = !!document.querySelector('a[href="/"]');

			// Check for login form (if present, we're NOT logged in)
			const loginForm = !!document.querySelector('input[name="username"]');
			const loginButton = Array.from(document.querySelectorAll("button")).some(
				(btn) => btn.textContent?.toLowerCase().includes("log in"),
			);

			// Check if we have any logged-in indicators
			const hasLoggedInIndicators =
				inboxLink ||
				profileLink ||
				createButton ||
				homeIcon ||
				feed ||
				navigation ||
				homeLink;

			// We're logged in if we have any logged-in indicators AND no login form
			const hasLoginForm = loginForm || loginButton;

			return {
				hasLoggedInIndicators,
				hasLoginForm,
				indicators: {
					inboxLink,
					profileLink,
					createButton,
					homeIcon,
					feed,
					navigation,
					homeLink,
				},
			};
		});

		// If we're on instagram.com and NOT on login page, and no login form, assume logged in
		if (
			currentUrl.includes("instagram.com") &&
			!isOnLoginPage &&
			!result.hasLoginForm
		) {
			// Even if we don't see logged-in indicators yet, if we're on homepage without login form,
			// we're likely logged in (page might still be loading)
			if (result.hasLoggedInIndicators) {
				logger.debug("AUTH", "Logged in: Found logged-in indicators");
				return true;
			} else {
				// On homepage, no login form, but no indicators yet - might be loading
				// Be lenient: if we're on homepage and not login page, assume logged in
				logger.debug(
					"AUTH",
					"On homepage without login form - assuming logged in (page may still be loading)",
				);
				return true;
			}
		}

		// Traditional check: logged-in indicators AND no login form
		const loggedIn = result.hasLoggedInIndicators && !result.hasLoginForm;

		if (loggedIn) {
			logger.debug(
				"AUTH",
				`Logged in: Found indicators: ${Object.entries(result.indicators)
					.filter(([_, v]) => v)
					.map(([k]) => k)
					.join(", ")}`,
			);
		} else {
			logger.debug(
				"AUTH",
				`Not logged in: hasIndicators=${result.hasLoggedInIndicators}, hasLoginForm=${result.hasLoginForm}, url=${currentUrl}`,
			);
		}

		return loggedIn;
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		logger.warn("AUTH", `Error checking login status: ${errorMsg}`);
		return false;
	}
}

/**
 * Clear saved cookies (useful when session expires)
 */
export function clearCookies(): void {
	try {
		if (existsSync(COOKIES_FILE)) {
			unlinkSync(COOKIES_FILE);
			logger.info("ACTION", "Cleared saved cookies");
		}
	} catch (error) {
		const err = error instanceof Error ? error.message : String(error);
		logger.error("ERROR", `Failed to clear cookies: ${err}`);
	}
}

/**
 * Get user data directory path for persistent browser profile
 */
export function getUserDataDir(): string {
	return join(SESSION_DIR, "browser_profile");
}
