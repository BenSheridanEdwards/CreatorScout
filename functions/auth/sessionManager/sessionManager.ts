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
const logger = createLogger(process.env.DEBUG_LOGS === "true");

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
		// Use page.evaluate for more reliable detection
		const loggedIn = await page.evaluate(() => {
			// Check for multiple logged-in indicators
			const inboxLink = !!document.querySelector('a[href="/direct/inbox/"]');
			const profileLink = !!document.querySelector('[aria-label*="profile"]');
			const createButton = !!document.querySelector('[aria-label*="create"]');
			const homeIcon = !!document.querySelector('svg[aria-label="Home"]');
			const feed = !!document.querySelector('[role="main"]');
			const navigation = !!document.querySelector("nav");

			// Check for login form (if present, we're NOT logged in)
			const loginForm = !!document.querySelector('input[name="username"]');
			const loginButton = Array.from(document.querySelectorAll("button")).some(
				(btn) => btn.textContent?.toLowerCase().includes("log in"),
			);

			// We're logged in if we have any logged-in indicators AND no login form
			return (
				(inboxLink ||
					profileLink ||
					createButton ||
					homeIcon ||
					feed ||
					navigation) &&
				!loginForm &&
				!loginButton
			);
		});
		return loggedIn;
	} catch {
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
