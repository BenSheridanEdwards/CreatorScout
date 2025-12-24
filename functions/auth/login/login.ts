import fs from "node:fs/promises";
import type { Page } from "puppeteer";
import { clickAny } from "../../navigation/clickAny/clickAny.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import {
	navigateToHomeViaUI,
	verifyHomePageLoaded,
} from "../../shared/pageVerification/pageVerification.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { humanClickElement } from "../../timing/humanize/humanize.ts";
import {
	isLoggedIn,
	loadCookies,
	saveCookies,
} from "../sessionManager/sessionManager.ts";

export type Credentials = {
	username: string;
	password: string;
};

const logger = createLogger(process.env.DEBUG_LOGS === "true");

const IS_TEST =
	process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

// When true, capture a screenshot at key points in the login flow to aid
// debugging local-browser issues without impacting normal runs or tests.
const DEBUG_LOGIN_SNAPSHOTS =
	process.env.DEBUG_LOGIN_SNAPSHOTS === "true" && !IS_TEST;

async function debugSnapshot(page: Page, label: string): Promise<void> {
	if (!DEBUG_LOGIN_SNAPSHOTS) return;
	try {
		await snapshot(page, label);
	} catch {
		// Debug snapshots should never break the main flow
	}
}

function delay(ms: number): Promise<void> {
	if (IS_TEST) return Promise.resolve();
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure the page frame is ready and accessible before attempting navigation.
 * Throws a recoverable error if frame is permanently detached.
 */
async function ensureFrameReady(page: Page): Promise<void> {
	try {
		// Check if page is closed
		if (page?.isClosed()) {
			throw new Error("Page is closed");
		}

		// Try to access frame - this will throw if detached
		page.url();

		// If we get here, frame is accessible
		return;
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);

		// If frame is detached, wait and retry
		if (errorMsg.includes("detached Frame")) {
			logger.warn("ACTION", "Frame is detached, waiting for stability...");
			await delay(2000);

			// Try again
			try {
				page.url();
				return;
			} catch (retryErr) {
				throw new Error(
					`Frame remains detached after retry: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
				);
			}
		}

		// Re-throw other errors
		throw err;
	}
}

/**
 * Safely navigate to a URL with frame stability checks and retry logic.
 * Handles detached frame errors gracefully by checking frame state before navigation.
 */
async function safeNavigate(
	page: Page,
	url: string,
	options: {
		waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
		timeout?: number;
	} = {},
): Promise<void> {
	// Ensure frame is ready before navigation
	await ensureFrameReady(page);

	try {
		await page.goto(url, options);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);

		if (errorMsg.includes("detached Frame")) {
			logger.warn(
				"ACTION",
				"Navigation failed due to detached frame, retrying...",
			);
			await delay(2000);
			await ensureFrameReady(page);
			await page.goto(url, options);
		} else {
			throw err;
		}
	}
}

// Helper function to wait for frame stability after navigation (critical for Browserless)
// Returns true if frame is stable, throws recoverable error if permanently detached
async function waitForFrameStability(
	page: Page,
	timeout: number = 5000,
): Promise<boolean> {
	try {
		// Check if page is closed before starting
		if (page?.isClosed()) {
			throw new Error("Page is closed, cannot check frame stability");
		}

		// Wait for the main frame to be ready
		await page.waitForFunction(() => document.readyState === "complete", {
			timeout,
		});

		// Check again after waitForFunction (page might have closed during wait)
		if (page?.isClosed()) {
			throw new Error("Page closed during frame stability check");
		}

		// Additional wait for frame stability in Browserless
		// This ensures any detached frames from previous navigation are cleared
		await delay(1000);

		// Verify the main frame is accessible by checking page URL
		try {
			page.url(); // This will throw if frame is detached
			return true; // Frame is stable
		} catch (frameError) {
			const errorMsg =
				frameError instanceof Error ? frameError.message : String(frameError);

			// Check if page closed
			if (page?.isClosed()) {
				throw new Error("Page closed while checking frame stability");
			}

			logger.warn(
				"ACTION",
				`Frame stability check failed, retrying: ${frameError}`,
			);
			// Wait a bit more and try again
			await delay(2000);

			// Check again before retry
			if (page?.isClosed()) {
				throw new Error("Page closed during frame stability retry");
			}

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

		// Check if page closed
		if (
			page?.isClosed() ||
			errorMsg.includes("Page is closed") ||
			errorMsg.includes("Page closed")
		) {
			throw new Error(`Page closed during frame stability check: ${errorMsg}`);
		}

		// If it's a detached frame error, throw it as a recoverable error
		if (errorMsg.includes("detached Frame")) {
			throw new Error(`Frame is permanently detached: ${errorMsg}`);
		}

		// For timeout or other errors, log and throw recoverable error
		logger.warn("ACTION", `Frame stability check timed out or failed: ${err}`);
		throw new Error(`Frame stability check failed: ${errorMsg}`);
	}
}

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
		/**
		 * Internal: retry counter for handling transient login detection issues.
		 */
		attempt?: number;
	},
): Promise<string | undefined> {
	const attempt = options?.attempt ?? 1;
	logger.info("ACTION", `Starting login process for user: ${creds.username}`);

	// Navigate to Instagram first (required before setting cookies) using UI
	logger.info("ACTION", "Navigating to Instagram homepage via UI");
	try {
		// Check if frame is accessible before attempting UI navigation
		try {
			page.url();
		} catch (frameErr) {
			const frameMsg =
				frameErr instanceof Error ? frameErr.message : String(frameErr);
			if (frameMsg.includes("detached Frame")) {
				logger.warn(
					"ACTION",
					`Frame is detached, cannot navigate via UI. Waiting for frame to recover...`,
				);
				// Wait a bit and check if frame recovers
				await delay(2000);
				try {
					page.url();
					logger.info("ACTION", "Frame recovered, continuing with navigation");
				} catch {
					throw new Error(
						`Frame remains detached and cannot navigate: ${frameMsg}`,
					);
				}
			} else {
				throw frameErr;
			}
		}

		await navigateToHomeViaUI(page);
		logger.info(
			"ACTION",
			"Successfully navigated to Instagram homepage via UI",
		);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);

		// If frame is detached, this is a fatal error - don't try to verify
		if (errorMsg.includes("detached Frame")) {
			throw new Error(
				`Cannot navigate to homepage: frame is detached. ${errorMsg}`,
			);
		}

		// If UI navigation fails for other reasons, we might not be on Instagram yet
		// The browser should already be on Instagram if it was opened with a URL
		logger.warn(
			"ACTION",
			`UI navigation to homepage failed (may already be on homepage): ${err}`,
		);
		// Try to verify we're on the homepage (this will handle detached frame gracefully)
		try {
			await verifyHomePageLoaded(page);
		} catch (verifyErr) {
			const verifyMsg =
				verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
			// If verification fails due to detached frame, that's okay - we'll continue
			if (!verifyMsg.includes("detached Frame")) {
				logger.warn(
					"ACTION",
					`Homepage verification also failed: ${verifyErr}`,
				);
			}
		}
	}
	await debugSnapshot(page, `login_after_navigate_${Date.now()}`);

	// Try to load saved cookies after navigation (unless skipped)
	let cookiesLoaded = false;
	if (!options?.skipCookies) {
		logger.info("ACTION", "Attempting to load saved cookies");
		cookiesLoaded = await loadCookies(page);
		logger.info("ACTION", `Cookies loaded: ${cookiesLoaded}`);
	} else {
		logger.info("ACTION", "Skipping cookie loading as requested");
	}

	// If cookies were loaded, reload the page so they take effect using UI
	if (cookiesLoaded) {
		logger.info(
			"ACTION",
			"Cookies loaded, reloading page via UI to apply them...",
		);
		try {
			await navigateToHomeViaUI(page);
			logger.info("ACTION", "Page reloaded with cookies applied via UI");
		} catch (err) {
			logger.warn(
				"ACTION",
				`UI reload failed, cookies may still apply: ${err}`,
			);
			// Verify we're still on homepage
			await verifyHomePageLoaded(page);
		}

		// Wait for page to fully load and hydrate
		await delay(3000);

		// Handle any popups that appeared
		await clickAny(page, ["OK", "Got it", "Got It", "Dismiss"]);
		await debugSnapshot(page, `login_after_cookies_${Date.now()}`);
	}

	// Check if we're already logged in (either from cookies or previous session)
	// Give cookies a moment to apply, then check current session
	logger.info(
		"ACTION",
		"Waiting for cookies to apply and checking login status",
	);
	await delay(2000);

	// Use comprehensive check for logged-in state
	const alreadyLoggedIn = await isLoggedIn(page);
	logger.info("ACTION", `Already logged in check: ${alreadyLoggedIn}`);
	await debugSnapshot(page, `login_after_status_check_${Date.now()}`);

	if (alreadyLoggedIn) {
		logger.info("ACTION", "Already logged in (using saved session)");
		// Refresh cookies to extend expiration
		await saveCookies(page);
		logger.info("ACTION", "Cookies refreshed for existing session");
		return;
	}

	// If cookies were loaded but we're still not logged in, they may be expired
	if (cookiesLoaded && !alreadyLoggedIn) {
		logger.warn(
			"ACTION",
			"Cookies loaded but session appears expired, will attempt fresh login...",
		);
	}

	logger.info("ACTION", "Handling cookie consent and popups");

	// Check if page is still open before trying to interact
	if (page?.isClosed()) {
		throw new Error("Page is closed, cannot handle cookie consent");
	}

	try {
		await clickAny(page, [
			"Allow all cookies",
			"Allow essential and optional cookies",
			"Decline optional cookies",
			"Accept All",
			"Accept",
			"OK",
			"Continue",
		]);

		// Handle "The messaging tab has a new look" popup that often appears
		await clickAny(page, ["OK", "Got it", "Got It", "Dismiss"]);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);

		// If target is closed, this is a fatal error - rethrow
		if (
			errorMsg.includes("Target closed") ||
			errorMsg.includes("TargetCloseError")
		) {
			throw new Error(
				`Page target closed while handling cookie consent: ${errorMsg}`,
			);
		}

		// For other errors (like element not found), log and continue
		logger.warn("ACTION", `Error handling cookie consent popups: ${errorMsg}`);
	}

	logger.info("ACTION", "Popups handled");

	await debugSnapshot(page, `login_after_popups_${Date.now()}`);

	// Add a brief pause to let any animations settle
	await delay(1000);

	// Wait for login form or already logged in state with multiple selectors
	logger.info("ACTION", "Waiting for login form to appear");
	try {
		// Try multiple login form selectors (Instagram changes them frequently)
		const loginSelectors = [
			'input[name="username"]',
			'input[aria-label*="Phone number, username, or email"]',
			'input[aria-label*="Username"]',
			'input[placeholder*="Phone number, username, or email"]',
			'input[placeholder*="Username"]',
			'#loginForm input[type="text"]',
			'form input[type="text"]',
		];

		let formFound = false;
		for (const selector of loginSelectors) {
			try {
				// Instagram often hydrates the login UI asynchronously; give it time.
				await page.waitForSelector(selector, { timeout: 15000 });
				logger.info("ACTION", `Login form found with selector: ${selector}`);
				formFound = true;
				break;
			} catch {}
		}

		if (!formFound) {
			logger.warn(
				"ACTION",
				"No login form selectors found, checking if already logged in",
			);

			// Check if we're already logged in with multiple indicators
			const loggedInIndicators = await page.evaluate(() => {
				const inboxLink = !!document.querySelector('a[href="/direct/inbox/"]');
				const profileLink = !!document.querySelector('[aria-label*="profile"]');
				const createButton = !!document.querySelector('[aria-label*="create"]');
				const homeIcon = !!document.querySelector('[aria-label*="home"]');
				const feed = !!document.querySelector('[role="main"]');

				return { inboxLink, profileLink, createButton, homeIcon, feed };
			});

			const isLoggedIn = Object.values(loggedInIndicators).some(Boolean);

			if (isLoggedIn) {
				logger.info(
					"ACTION",
					"Already logged in - found user interface elements",
				);
				logger.info(
					"ACTION",
					`UI elements found: ${Object.entries(loggedInIndicators)
						.filter(([_, v]) => v)
						.map(([k]) => k)
						.join(", ")}`,
				);

				// Save cookies again to refresh expiration
				await saveCookies(page);
				logger.info("ACTION", "Cookies refreshed for existing session");
				await debugSnapshot(page, `login_already_logged_in_${Date.now()}`);
				return;
			}

			// Take debug screenshot
			try {
				await snapshot(page, `login_form_not_found_${Date.now()}`);
				logger.info(
					"ACTION",
					`Debug screenshot saved for login form detection failure`,
				);
			} catch (screenshotError) {
				logger.error(
					"ERROR",
					`Could not take debug screenshot: ${screenshotError}`,
				);
			}

			// Also log some page information for debugging
			try {
				const pageTitle = await page.title();
				const pageUrl = page.url();
				const bodyText = await page.evaluate(() => {
					const body = document.body;
					return body ? body.innerText.substring(0, 500) : "No body found";
				});

				logger.info(
					"ACTION",
					`Page debug info - Title: "${pageTitle}", URL: ${pageUrl}`,
				);
				logger.info(
					"ACTION",
					`Page content preview: ${bodyText.replace(/\n/g, " ").substring(0, 200)}...`,
				);

				// Persist full HTML/text to disk for troubleshooting in restricted environments.
				await fs.mkdir("tmp", { recursive: true });
				const ts = Date.now();
				const html = await page.content();
				await fs.writeFile(`tmp/login_debug_${ts}.html`, html, "utf8");
				await fs.writeFile(`tmp/login_debug_${ts}.txt`, bodyText, "utf8");
				logger.info(
					"ACTION",
					`Login debug saved: tmp/login_debug_${ts}.html and tmp/login_debug_${ts}.txt`,
				);
			} catch (debugError) {
				logger.error("ERROR", `Could not gather debug info: ${debugError}`);
			}

			logger.error(
				"ACTION",
				"Could not find login form or logged-in interface",
			);
			throw new Error("Could not find login form or determine login status");
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error ?? "Unknown error");

		if (message.includes("Could not find")) {
			// Surface deterministic "could not find login UI" errors to callers as-is
			throw error;
		}

		// Handle transient "detached Frame" errors more gracefully by retrying
		if (message.includes("detached Frame") && attempt < 3) {
			logger.warn(
				"ACTION",
				`Login form detection failed due to detached frame (attempt ${attempt}). Attempting to recover frame and retrying...`,
			);

			// Try to recover from detached frame by navigating to a fresh page
			// This will create a new frame context
			try {
				// Skip frame check since frame is already detached - UI navigation might recover it
				logger.info(
					"ACTION",
					"Attempting to recover frame by navigating to fresh page via UI...",
				);
				await navigateToHomeViaUI(page);
				// Wait for page to stabilize after navigation
				await delay(3000);

				// Now check if frame is stable
				try {
					await waitForFrameStability(page, 5000);
					logger.info("ACTION", "Frame recovered successfully");
				} catch (stabilityError) {
					// Frame still not stable, but continue with retry anyway
					logger.warn(
						"ACTION",
						`Frame stability check failed after recovery attempt: ${stabilityError}. Continuing with retry...`,
					);
				}
			} catch (navError) {
				// If navigation fails, log but continue with retry attempt
				// The retry might work if the frame recovers on its own
				logger.warn(
					"ACTION",
					`Could not recover frame by navigation: ${navError}. Continuing with retry attempt...`,
				);
			}

			// Short backoff before retrying detection
			await delay(1000);
			return await login(page, creds, {
				...options,
				// prevent unbounded growth and mark next attempt
				attempt: attempt + 1,
				// cookies were already handled on the first attempt
				skipCookies: true,
			});
		}

		logger.error("ACTION", `Login form detection failed: ${message}`);
		throw new Error(`Login form detection failed: ${message}`);
	}

	logger.info("ACTION", `Filling in credentials for user: ${creds.username}`);

	// Add human-like delay before typing
	await delay(1000 + Math.random() * 2000);

	// Find and fill username field
	const usernameSelectors = [
		'input[name="username"]',
		'input[aria-label*="Phone number, username, or email"]',
		'input[aria-label*="Username"]',
		'input[placeholder*="Phone number, username, or email"]',
		'input[placeholder*="Username"]',
		'#loginForm input[type="text"]',
		'form input[type="text"]:first-of-type',
	];

	let usernameField = null;
	let usernameSelectorUsed: string | null = null;
	for (const selector of usernameSelectors) {
		try {
			usernameField = await page.$(selector);
			if (usernameField) {
				usernameSelectorUsed = selector;
				logger.info(
					"ACTION",
					`Username field found with selector: ${selector}`,
				);
				break;
			}
		} catch {}
	}

	if (!usernameField) {
		throw new Error("Could not find username input field");
	}

	// Focus the field (click can fail if the node is covered/animated)
	try {
		await usernameField.click();
	} catch {
		try {
			// Scroll into view and focus as a fallback
			await page.evaluate((el) => {
				(el as HTMLElement | null)?.scrollIntoView?.({
					block: "center",
					inline: "center",
				});
			}, usernameField);
		} catch {
			// ignore
		}

		// Try focusing by selector if we have one
		if (usernameSelectorUsed) {
			try {
				await page.focus(usernameSelectorUsed);
			} catch {
				// ignore
			}
		}
	}

	// Type username with more realistic delays (type on the element handle itself)
	await usernameField.type(creds.username, { delay: 100 + Math.random() * 50 });
	logger.info("ACTION", "Username entered");

	// Add pause between fields (like a human would)
	await delay(500 + Math.random() * 1000);

	// Find and fill password field
	const passwordSelectors = [
		'input[name="password"]',
		'input[type="password"]',
		'input[aria-label*="Password"]',
		'input[placeholder*="Password"]',
		'#loginForm input[type="password"]',
		'form input[type="password"]',
	];

	let passwordField = null;
	for (const selector of passwordSelectors) {
		try {
			passwordField = await page.$(selector);
			if (passwordField) {
				logger.info(
					"ACTION",
					`Password field found with selector: ${selector}`,
				);
				break;
			}
		} catch {}
	}

	if (!passwordField) {
		throw new Error("Could not find password input field");
	}

	// Type password with realistic delays
	await passwordField.type(creds.password, { delay: 120 + Math.random() * 80 });
	logger.info("ACTION", "Password entered");

	// Add another pause before clicking submit (human hesitation)
	await delay(800 + Math.random() * 1200);

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
			await delay(20000);
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

	// Try multiple submit button selectors
	const submitSelectors = [
		'button[type="submit"]',
		'button:has-text("Log in")',
		'button:has-text("Log In")',
		'[data-testid*="login"] button',
		'[role="button"]:has-text("Log in")',
		'form button[type="submit"]',
		'button[class*="login"]',
	];

	let submitClicked = false;
	for (const selector of submitSelectors) {
		try {
			const submitButton = await page.$(selector);
			if (submitButton) {
				await submitButton.click();
				logger.info(
					"ACTION",
					`Submit button clicked with selector: ${selector}`,
				);
				submitClicked = true;
				break;
			}
		} catch {}
	}

	if (!submitClicked) {
		logger.warn(
			"ACTION",
			"Submit button not found with standard selectors, trying keyboard enter",
		);
		// Try pressing Enter on the password field
		await page.keyboard.press("Enter");
	}

	logger.info("ACTION", "Login form submitted");

	// Wait a moment for any immediate modals to appear
	await delay(2000);

	// Handle "Save your login info?" modal that may appear immediately after submission
	// Use human-like mouse movement to click the button
	const saveInfoButtonFound = await page.evaluate(() => {
		const buttons = Array.from(document.querySelectorAll("button"));
		for (const btn of buttons) {
			const text = (btn.textContent || "").trim();
			if (text === "Save info" || text === "Save Info" || text === "Save") {
				(btn as HTMLElement).setAttribute("data-scout-save-info", "true");
				return true;
			}
		}
		return false;
	});

	if (saveInfoButtonFound) {
		const clicked = await humanClickElement(
			page,
			'button[data-scout-save-info="true"]',
			{
				elementType: "button",
				hoverDelay: 200 + Math.random() * 300,
			},
		).catch(async () => {
			// Fallback to clickAny if humanClickElement doesn't work
			return await clickAny(page, ["Save info", "Save Info", "Save"]);
		});
		if (clicked) {
			logger.info(
				"ACTION",
				"Clicked 'Save info' on login modal with actual mouse cursor movement (early)",
			);
			await delay(1000);
		}
	}

	// Wait for navigation after login with longer timeout and better detection
	logger.info("ACTION", "Waiting for login to complete and page to load");
	try {
		// Check if we're on the onetap page (one-tap login confirmation)
		const currentUrl = page.url();
		if (currentUrl.includes("/accounts/onetap/")) {
			logger.info(
				"ACTION",
				"Detected onetap page - waiting up to 20 seconds for processing",
			);

			// Try to click "Continue" or "Use this account" button on onetap page
			const onetapClicked = await clickAny(page, [
				"Continue",
				"Use this account",
				"Use Account",
				"Not you?",
			]);

			if (onetapClicked) {
				logger.info("ACTION", "Clicked onetap button, waiting for navigation");
				await delay(3000);
			}

			// Wait up to 20 seconds for Instagram to process and redirect
			logger.info(
				"ACTION",
				"Waiting for onetap page to process (up to 20 seconds)",
			);
			const startTime = Date.now();
			const maxWaitTime = 20000; // 20 seconds

			while (Date.now() - startTime < maxWaitTime) {
				await delay(2000); // Check every 2 seconds
				const currentUrlCheck = page.url();

				// If we've navigated away from onetap, break
				if (!currentUrlCheck.includes("/accounts/onetap/")) {
					logger.info(
						"ACTION",
						`Navigated away from onetap page to: ${currentUrlCheck}`,
					);
					break;
				}

				// Check if login indicators are present (page might have loaded but URL not changed)
				const hasLoginIndicators = await page.evaluate(() => {
					const inboxLink = document.querySelector('a[href="/direct/inbox/"]');
					const profileLink = document.querySelector('a[href*="/accounts/"]');
					const feedContent = document.querySelector('[role="main"]');
					return !!(inboxLink || profileLink || feedContent);
				});

				if (hasLoginIndicators) {
					logger.info("ACTION", "Login indicators found on onetap page");
					break;
				}
			}

			// Navigate to home if still on onetap page after waiting
			if (page.url().includes("/accounts/onetap/")) {
				logger.info(
					"ACTION",
					"Still on onetap page after 20 seconds, navigating to home",
				);
				await safeNavigate(page, "https://www.instagram.com/", {
					waitUntil: "networkidle0",
					timeout: 15000,
				});
				await delay(3000);
			}
		}

		// Wait for either inbox link or error indicators
		await page.waitForFunction(
			() => {
				// Check for successful login indicators
				const inboxLink = document.querySelector('a[href="/direct/inbox/"]');
				const profileLink = document.querySelector('a[href*="/accounts/"]');
				const feedContent = document.querySelector('[role="main"]');

				// Check for login failure indicators
				const errorMsg =
					document.body?.innerText?.includes("incorrect") ||
					document.body?.innerText?.includes("challenge") ||
					document.body?.innerText?.includes("verify") ||
					document.body?.innerText?.includes("suspicious");

				return inboxLink || profileLink || feedContent || errorMsg;
			},
			{ timeout: 30000 },
		);

		// Double-check login status
		await delay(3000);
		const finalUrl = page.url();

		// Check for various success indicators
		const successIndicators = await page.evaluate(() => {
			const inboxLink = !!document.querySelector('a[href="/direct/inbox/"]');
			const profileMenu = !!document.querySelector('[aria-label*="profile"]');
			const createPost = !!document.querySelector('[aria-label*="create"]');
			const feed = !!document.querySelector('[role="main"]');

			return { inboxLink, profileMenu, createPost, feed };
		});

		const isLoggedIn =
			successIndicators.inboxLink ||
			successIndicators.profileMenu ||
			successIndicators.createPost ||
			successIndicators.feed;

		if (isLoggedIn) {
			logger.info("ACTION", "Login successful - user interface detected");
			logger.info(
				"ACTION",
				`Success indicators: ${Object.entries(successIndicators)
					.filter(([_, v]) => v)
					.map(([k]) => k)
					.join(", ")}`,
			);

			// Handle "Save your login info?" modal that often appears after login
			// We click "Save info" as it's less suspicious than dismissing
			// Use human-like mouse movement to click the button
			await delay(2000); // Wait for modal to appear

			// Find the Save info button by text and mark it
			const saveInfoButtonFound = await page.evaluate(() => {
				const buttons = Array.from(document.querySelectorAll("button"));
				for (const btn of buttons) {
					const text = (btn.textContent || "").trim();
					if (text === "Save info" || text === "Save Info" || text === "Save") {
						(btn as HTMLElement).setAttribute("data-scout-save-info", "true");
						return true;
					}
				}
				return false;
			});

			if (saveInfoButtonFound) {
				const clicked = await humanClickElement(
					page,
					'button[data-scout-save-info="true"]',
					{
						elementType: "button",
						hoverDelay: 200 + Math.random() * 300,
					},
				).catch(async () => {
					// Fallback to clickAny if humanClickElement doesn't work
					return await clickAny(page, ["Save info", "Save Info", "Save"]);
				});
				if (clicked) {
					logger.info(
						"ACTION",
						"Clicked 'Save info' on login modal with actual mouse cursor movement",
					);
					await delay(1000);
				}
			} else {
				// Fallback: use clickAny if button not found
				const saveInfoClicked = await clickAny(page, [
					"Save info",
					"Save Info",
					"Save",
				]);
				if (saveInfoClicked) {
					logger.info(
						"ACTION",
						"Clicked 'Save info' on login modal (fallback)",
					);
					await delay(1000);
				} else {
					// Last resort: try "Not now" if "Save info" not found
					const notNowClicked = await clickAny(page, ["Not now", "Not Now"]);
					if (notNowClicked) {
						logger.info(
							"ACTION",
							"Clicked 'Not now' on login modal (last resort)",
						);
						await delay(1000);
					}
				}
			}

			// Handle "The messaging tab has a new look" popup that may appear after login
			await delay(1000);
			await clickAny(page, ["OK", "Got it", "Got It", "Dismiss"]);

			// Save cookies after successful login
			await saveCookies(page);
			logger.info("ACTION", "Cookies saved after successful login");
			return;
		}

		// Check for error conditions
		const errorText = await page.evaluate(() => {
			const bodyText = document.body?.innerText || "";
			return (
				bodyText.includes("couldn't connect") ||
				bodyText.includes("incorrect") ||
				bodyText.includes("Sorry") ||
				bodyText.includes("suspended") ||
				bodyText.includes("challenge") ||
				bodyText.includes("verify") ||
				bodyText.includes("suspicious") ||
				bodyText.includes("unusual activity")
			);
		});

		if (errorText) {
			logger.error("ACTION", "Login error detected on page");
			const bodyText = await page.evaluate(
				() => document.body?.innerText || "",
			);
			const errorPreview = bodyText.substring(0, 300).replace(/\n/g, " ");
			throw new Error(
				`Login failed - Instagram security detected. Page preview: ${errorPreview}`,
			);
		}

		logger.warn(
			"ACTION",
			`Login completed but login status uncertain. URL: ${finalUrl}`,
		);
		logger.warn(
			"ACTION",
			`Success indicators found: ${Object.entries(successIndicators)
				.filter(([_, v]) => v)
				.map(([k]) => k)
				.join(", ")}`,
		);

		// Handle "Save your login info?" modal even if login status is uncertain
		// We click "Save info" as it's less suspicious than dismissing
		// Use human-like mouse movement to click the button
		await delay(2000);

		// Find the Save info button by text and mark it
		const saveInfoButtonFound = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll("button"));
			for (const btn of buttons) {
				const text = (btn.textContent || "").trim();
				if (text === "Save info" || text === "Save Info" || text === "Save") {
					(btn as HTMLElement).setAttribute("data-scout-save-info", "true");
					return true;
				}
			}
			return false;
		});

		if (saveInfoButtonFound) {
			const clicked = await humanClickElement(
				page,
				'button[data-scout-save-info="true"]',
				{
					elementType: "button",
					hoverDelay: 200 + Math.random() * 300,
				},
			).catch(async () => {
				// Fallback to clickAny if humanClickElement doesn't work
				return await clickAny(page, ["Save info", "Save Info", "Save"]);
			});
			if (clicked) {
				logger.info(
					"ACTION",
					"Clicked 'Save info' on login modal with actual mouse cursor movement",
				);
				await delay(1000);
			}
		} else {
			// Fallback: use clickAny if button not found
			const saveInfoClicked = await clickAny(page, [
				"Save info",
				"Save Info",
				"Save",
			]);
			if (saveInfoClicked) {
				logger.info("ACTION", "Clicked 'Save info' on login modal (fallback)");
				await delay(1000);
			} else {
				// Last resort: try "Not now" if "Save info" not found
				const notNowClicked = await clickAny(page, ["Not now", "Not Now"]);
				if (notNowClicked) {
					logger.info(
						"ACTION",
						"Clicked 'Not now' on login modal (last resort)",
					);
					await delay(1000);
				}
			}
		}

		// Try to continue anyway - Instagram might be using a different UI
		return;
	} catch (_waitError) {
		const currentUrl = page.url();
		logger.error("ACTION", `Login timeout - current URL: ${currentUrl}`);

		// Take screenshot for debugging
		try {
			await snapshot(page, `login_timeout_debug_${Date.now()}`);
		} catch (screenshotError) {
			logger.error(
				"ERROR",
				`Could not take debug screenshot: ${screenshotError}`,
			);
		}

		// If we can detect a login failure message, surface that instead of a generic timeout.
		try {
			const bodyText = await page.evaluate(
				() => document.body?.innerText || "",
			);
			if (
				bodyText.includes("incorrect") ||
				bodyText.includes("Sorry") ||
				bodyText.includes("challenge") ||
				bodyText.includes("verify") ||
				bodyText.includes("suspicious") ||
				bodyText.includes("unusual activity")
			) {
				const errorPreview = bodyText.substring(0, 300).replace(/\n/g, " ");
				throw new Error(
					`Login failed - Instagram security detected. Page preview: ${errorPreview}`,
				);
			}
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("Login failed")) {
				throw e;
			}
		}

		throw new Error(
			`Login timeout after 30 seconds. Instagram may be blocking automated access or requiring manual verification. Current URL: ${currentUrl}`,
		);
	}
}
