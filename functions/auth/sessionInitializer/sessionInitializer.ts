/**
 * Unified Instagram Session Initializer
 *
 * Provides a single, consistent way to initialize Instagram sessions across all scripts.
 * Encapsulates browser creation, navigation, content verification, and authentication.
 *
 * Supports both AdsPower (production) and local browsers (development).
 */

import type { Browser, Page } from "puppeteer";
import { createBrowser, createPage } from "../../navigation/browser/browser.ts";
import { IG_PASS, IG_USER } from "../../shared/config/config.ts";
import { createLogger, type Logger } from "../../shared/logger/logger.ts";
import {
	detectIfOnInstagramLogin,
	waitForInstagramContent,
} from "../../shared/waitForContent/waitForContent.ts";
import { type Credentials, login } from "../login/login.ts";
import { isLoggedIn } from "../sessionManager/sessionManager.ts";

export interface SessionOptions {
	/**
	 * Whether to run browser in headless mode
	 * @default true for production, false for local development
	 */
	headless?: boolean;

	/**
	 * Browser viewport dimensions
	 * @default { width: 1440, height: 900 }
	 */
	viewport?: {
		width: number;
		height: number;
	};

	/**
	 * Enable debug logging
	 * @default false
	 */
	debug?: boolean;

	/**
	 * Skip login step (useful for diagnostic scripts)
	 * @default false
	 */
	skipLogin?: boolean;

	/**
	 * Custom credentials (if not using environment variables)
	 */
	credentials?: Credentials;

	/**
	 * Login options to pass through to login function
	 */
	loginOptions?: {
		skipSubmit?: boolean;
		skipCookies?: boolean;
	};

	/**
	 * AdsPower profile ID (for multi-profile support)
	 * If provided, will connect to AdsPower instead of using local browser
	 */
	adsPowerProfileId?: string;

	/**
	 * Profile ID for tracking (for multi-profile automation)
	 */
	profileId?: string;
}

export interface SessionResult {
	browser: Browser;
	page: Page;
	logger: Logger;
}

/**
 * Initialize a complete Instagram session with browser, page, and authentication.
 *
 * This function:
 * 1. Creates a logger with consistent configuration
 * 2. Creates and configures a browser instance
 * 3. Creates a page with proper viewport
 * 4. Navigates to Instagram
 * 5. Waits for content to load
 * 6. Detects if on login page
 * 7. Authenticates if needed (using cookies or credentials)
 * 8. Verifies session is stable
 * 9. Returns ready-to-use browser, page, and logger
 *
 * @param options - Configuration options for session initialization
 * @returns Object containing browser, page, and logger instances
 * @throws Error if session initialization fails
 *
 * @example
 * ```typescript
 * // Basic usage
 * const { browser, page, logger } = await initializeInstagramSession();
 *
 * // With custom options
 * const { browser, page, logger } = await initializeInstagramSession({
 *   headless: false,
 *   debug: true,
 *   viewport: { width: 1920, height: 1080 }
 * });
 *
 * // For diagnostic scripts (skip login)
 * const { browser, page, logger } = await initializeInstagramSession({
 *   skipLogin: true
 * });
 * ```
 */
export async function initializeInstagramSession(
	options: SessionOptions = {},
): Promise<SessionResult> {
	const {
		headless = true,
		viewport = { width: 1440, height: 900 },
		debug = false,
		skipLogin = false,
		credentials,
		loginOptions,
		adsPowerProfileId,
		profileId,
	} = options;

	// 1. Create logger
	const logger = createLogger();
	logger.info("SESSION", "🚀 Initializing Instagram session...");

	if (profileId) {
		logger.info("SESSION", `Profile ID: ${profileId}`);
	}

	// 2. Create browser with proper options
	const browserMode = adsPowerProfileId ? "AdsPower" : "local browser";
	logger.info(
		"SESSION",
		`Creating browser (${browserMode}, headless: ${headless})...`,
	);

	const browser = await createBrowser({
		headless,
		adsPowerProfileId,
	});
	logger.info("SESSION", "✅ Browser created successfully");

	// 3. Create page with viewport
	logger.info(
		"SESSION",
		`Creating page (viewport: ${viewport.width}x${viewport.height})...`,
	);
	const page = await createPage(browser, {
		viewport,
		applyStealth: !adsPowerProfileId,
	});
	logger.info("SESSION", "✅ Page created successfully");

	try {
		// 4. Navigate to Instagram with networkidle0 (proven to work with browserless)
		// Add a small random delay before navigation (humans don't instantly navigate)
		const preNavDelay = 500 + Math.random() * 1000;
		logger.info(
			"SESSION",
			`📱 Navigating to Instagram (after ${Math.round(preNavDelay)}ms delay)...`,
		);
		await new Promise((r) => setTimeout(r, preNavDelay));

		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle0",
			timeout: 30000,
		});
		logger.info("SESSION", "✅ Navigation completed");

		// 5. Wait for Instagram content to load
		logger.info("SESSION", "⏳ Waiting for Instagram content to load...");
		const contentLoaded = await waitForInstagramContent(page, 30000);
		if (!contentLoaded) {
			throw new Error("Instagram content failed to load within timeout");
		}
		logger.info("SESSION", "✅ Instagram content loaded");

		// 6. Detect if on login page
		const onLoginPage = await detectIfOnInstagramLogin(page);
		if (onLoginPage) {
			logger.info("SESSION", "🔐 Detected login page");
		}

		// Skip login if requested (for diagnostic scripts)
		if (skipLogin) {
			logger.info("SESSION", "⚠️  Skipping login as requested");
			logger.info("SESSION", "✅ Session initialization complete (no auth)");
			return { browser, page, logger };
		}

		// 7. Check if already logged in (via cookies)
		logger.info("SESSION", "🔍 Checking login status...");
		const currentUrl = page.url();
		logger.info("SESSION", `Current URL: ${currentUrl}`);

		// Log what indicators we can find
		const pageState = await page.evaluate(() => {
			// Comprehensive login form detection - Instagram uses various input names/attributes
			const loginFormIndicators = [
				'input[name="username"]',
				'input[name="email"]',
				'input[aria-label*="Phone number"]',
				'input[aria-label*="username"]',
				'input[aria-label*="email"]',
				'input[placeholder*="Phone number"]',
				'input[placeholder*="username"]',
				'input[placeholder*="email"]',
				'input[type="password"]', // Password field is a strong indicator
			];
			const hasLoginForm = loginFormIndicators.some(
				(selector) => !!document.querySelector(selector),
			);

			// Also check for login-specific text
			const pageText = document.body?.innerText?.toLowerCase() || "";
			const hasLoginText =
				pageText.includes("log in") &&
				pageText.includes("password") &&
				!pageText.includes("reels");

			// Strong logged-in indicators (these don't appear on login page)
			const loggedInIndicators = [
				'a[href="/direct/inbox/"]', // DM inbox link
				'a[href*="/explore/"]', // Explore link in nav
				'svg[aria-label="Home"]', // Home icon in nav
				'svg[aria-label="New post"]', // New post icon
				'a[href*="/accounts/edit/"]', // Profile settings
			];
			const hasStrongLoggedInIndicator = loggedInIndicators.some(
				(selector) => !!document.querySelector(selector),
			);

			return {
				hasLoginForm: hasLoginForm || hasLoginText,
				hasInbox: hasStrongLoggedInIndicator,
				hasNav: !!document.querySelector("nav"),
				hasMain: !!document.querySelector('[role="main"]'),
				bodyTextLength: pageText.length,
			};
		});
		logger.info(
			"SESSION",
			`Page state: loginForm=${pageState.hasLoginForm}, loggedInIndicator=${pageState.hasInbox}, nav=${pageState.hasNav}, main=${pageState.hasMain}, bodyText=${pageState.bodyTextLength}`,
		);

		// SIMPLE RULE: If there's a login form, we need to log in. Period.
		// Don't overthink it - if the form is there, fill it in.
		if (pageState.hasLoginForm) {
			logger.info("SESSION", "🔐 Login form detected - will authenticate");
			// Continue to login flow below
		} else if (adsPowerProfileId) {
			// No login form = we're logged in, trust AdsPower session
			logger.info("SESSION", "✅ No login form found - trusting session");
			logger.info("SESSION", "🎉 Instagram session initialized successfully");
			return { browser, page, logger };
		}

		const alreadyLoggedIn = await isLoggedIn(page);
		logger.info("SESSION", `isLoggedIn() returned: ${alreadyLoggedIn}`);

		if (alreadyLoggedIn) {
			logger.info("SESSION", "✅ Already logged in (using saved session)");
		} else {
			// 8. Authenticate if needed
			logger.info("SESSION", "🔐 Not logged in, authenticating...");

			// Get credentials from options or environment
			const username = credentials?.username || IG_USER;
			const password = credentials?.password || IG_PASS;

			if (!username || !password) {
				throw new Error(
					"Instagram credentials not configured. Set IG_USER and IG_PASS environment variables or provide credentials option.",
				);
			}

			const creds: Credentials = { username, password };

			logger.info("SESSION", `Logging in as @${creds.username}...`);
			await login(page, creds, loginOptions);
			logger.info("SESSION", "✅ Login successful");
		}

		// 9. Verify session is stable
		logger.info("SESSION", "⏳ Verifying session stability...");
		await verifySessionStable(page, logger);
		logger.info("SESSION", "✅ Session verified and stable");

		logger.info("SESSION", "🎉 Instagram session initialized successfully");
		return { browser, page, logger };
	} catch (error) {
		logger.error("SESSION", `❌ Session initialization failed: ${error}`);
		logger.warn(
			"SESSION",
			"⚠️  Browser kept open for 3 minutes for manual inspection",
		);
		logger.info(
			"SESSION",
			"💡 Please check the browser window - you may need to solve a CAPTCHA, complete verification, or inspect the issue",
		);

		// Always wait 3 minutes before closing to allow manual intervention
		const waitTimeMs = 3 * 60 * 1000; // 3 minutes
		logger.info("SESSION", `⏳ Waiting 3 minutes before closing browser...`);

		await new Promise((resolve) => setTimeout(resolve, waitTimeMs));

		logger.info("SESSION", "⏰ 3 minute wait period ended, closing browser");
		try {
			await browser.close();
		} catch (closeError) {
			logger.error("SESSION", `Failed to close browser: ${closeError}`);
		}

		throw error;
	}
}

/**
 * Verify that the session is stable and ready for automation.
 * Checks for multiple logged-in indicators and waits for any animations to settle.
 *
 * @param page - Puppeteer page instance
 * @param logger - Logger instance
 * @throws Error if session verification fails
 */
async function verifySessionStable(page: Page, logger: Logger): Promise<void> {
	// Wait for session to stabilize (animations, hydration, etc.)
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Check for logged-in indicators
	const indicators = await page.evaluate(() => {
		const inboxLink = !!document.querySelector('a[href="/direct/inbox/"]');
		const profileLink = !!document.querySelector('[aria-label*="profile"]');
		const createButton = !!document.querySelector('[aria-label*="create"]');
		const homeIcon = !!document.querySelector('svg[aria-label="Home"]');
		const navigation = !!document.querySelector("nav");
		const feed = !!document.querySelector('[role="main"]');

		return {
			inboxLink,
			profileLink,
			createButton,
			homeIcon,
			navigation,
			feed,
			anyIndicator:
				inboxLink ||
				profileLink ||
				createButton ||
				homeIcon ||
				navigation ||
				feed,
		};
	});

	if (!indicators.anyIndicator) {
		logger.error(
			"SESSION",
			"⚠️  No logged-in indicators found - session may not be stable",
		);
		throw new Error(
			"Session verification failed: no logged-in indicators detected",
		);
	}

	// Log which indicators were found
	const foundIndicators = Object.entries(indicators)
		.filter(([key, value]) => value && key !== "anyIndicator")
		.map(([key]) => key);
	logger.info("SESSION", `Found indicators: ${foundIndicators.join(", ")}`);
}

/**
 * Quick helper to initialize a session and automatically close it when done.
 * Useful for one-off scripts.
 *
 * @param options - Session initialization options
 * @param callback - Async function to run with the session
 *
 * @example
 * ```typescript
 * await withInstagramSession({ headless: false }, async ({ page, logger }) => {
 *   logger.info("ACTION", "Doing something...");
 *   await page.goto("https://www.instagram.com/someuser/");
 *   // ... do work ...
 * });
 * // Browser automatically closed
 * ```
 */
export async function withInstagramSession<T>(
	options: SessionOptions,
	callback: (session: SessionResult) => Promise<T>,
): Promise<T> {
	const session = await initializeInstagramSession(options);
	try {
		return await callback(session);
	} finally {
		await session.browser.close();
	}
}
