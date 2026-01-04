import fs from "node:fs/promises";
import type { Page } from "puppeteer";
import { DEBUG_SCREENSHOTS, LOCAL_BROWSER } from "../config/config.ts";
import { addScreenshotToRun, getCurrentRunId } from "../runs/runs.ts";

/**
 * Check if the page is still open and accessible
 */
function isPageOpen(page: Page): boolean {
	try {
		// Try to access a property that will throw if page is closed
		return !page.isClosed();
	} catch {
		return false;
	}
}

/**
 * Wait for the page to be in a stable state (not loading, not on login page)
 */
async function waitForPageReady(
	page: Page,
	timeout: number = 5000,
): Promise<void> {
	if (!isPageOpen(page)) {
		return;
	}

	try {
		// Wait for page to not be loading
		await page.waitForFunction(() => document.readyState === "complete", {
			timeout,
		});

		// Check if we're on Instagram login page and wait for it to potentially redirect
		const isLoginPage = await page.evaluate(() => {
			return (
				window.location.href.includes("/accounts/login") ||
				document.querySelector('input[name="username"]') !== null ||
				document.querySelector('input[type="password"]') !== null
			);
		});

		if (isLoginPage) {
			// If on login page, wait a bit more in case of redirect
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	} catch (_err) {
		// Timeout or page closed is okay, just continue
	}
}

/**
 * Check if screenshot should be taken based on DEBUG_SCREENSHOTS flag
 * @param force - If true, bypass debug flag check (for functional screenshots)
 * @returns true if screenshot should be taken
 */
function shouldTakeScreenshot(force: boolean = false): boolean {
	if (force) {
		return true; // Functional screenshots always enabled
	}
	return DEBUG_SCREENSHOTS; // Debug screenshots gated by flag
}

export async function snapshot(
	page: Page,
	label: string,
	force: boolean = false,
): Promise<string> {
	// Check if screenshots are enabled (unless forced for functional screenshots)
	if (!shouldTakeScreenshot(force)) {
		// Return a dummy path to maintain API compatibility
		// Callers should check if screenshot was actually taken
		return "";
	}

	// Organize screenshots into date-based folders under a top-level screenshots directory:
	// screenshots/YYYY-MM-DD/<label>-<timestamp>.png
	const now = new Date();
	const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

	const baseDir = "screenshots";
	const dateDir = `${baseDir}/${date}`;

	await fs.mkdir(dateDir, { recursive: true });

	const ts = Date.now();
	const file = `${dateDir}/${label}-${ts}.png`;

	// Check if page is still open
	if (!isPageOpen(page)) {
		throw new Error("Cannot take screenshot: page is closed");
	}

	// Wait for page to be ready before taking screenshot
	await waitForPageReady(page);

	// Check again after waiting (page might have closed during wait)
	if (!isPageOpen(page)) {
		throw new Error("Cannot take screenshot: page was closed while waiting");
	}

	try {
		// For Browserless, try using CDP screenshot API directly as a fallback
		if (!LOCAL_BROWSER) {
			try {
				await page.screenshot({ path: file, fullPage: true });
				console.log(`📸 Snapshot saved: ${file}`);

				// Associate with current run if available
				const runId = getCurrentRunId();
				if (runId) {
					await addScreenshotToRun(runId, file);
				}

				return file;
			} catch (puppeteerErr) {
				// If Puppeteer screenshot fails, try CDP directly
				if (
					puppeteerErr instanceof Error &&
					(puppeteerErr.message.includes("Target closed") ||
						puppeteerErr.message.includes("Session closed"))
				) {
					// Try CDP screenshot as fallback for Browserless
					try {
						const pageWithCDP = page as unknown as {
							createCDPSession?: () => Promise<{
								send: (method: string, params?: unknown) => Promise<unknown>;
							}>;
						};
						if (typeof pageWithCDP.createCDPSession === "function") {
							const cdp = await pageWithCDP.createCDPSession();
							const screenshotData = (await cdp.send("Page.captureScreenshot", {
								format: "png",
								fromSurface: true,
							})) as { data?: string };

							if (screenshotData?.data) {
								const buffer = Buffer.from(screenshotData.data, "base64");
								await fs.writeFile(file, buffer);
								console.log(`📸 Snapshot saved via CDP: ${file}`);

								// Associate with current run if available
								const runId = getCurrentRunId();
								if (runId) {
									await addScreenshotToRun(runId, file);
								}

								return file;
							}
						}
					} catch (_cdpErr) {
						// CDP also failed, throw original error
						throw new Error(
							`Cannot take screenshot: page was closed. Original error: ${puppeteerErr.message}`,
						);
					}
				}
				throw puppeteerErr;
			}
		} else {
			// For local browser, use standard Puppeteer screenshot
			await page.screenshot({ path: file, fullPage: true });
			console.log(`📸 Snapshot saved: ${file}`);

			// Associate with current run if available
			const runId = getCurrentRunId();
			if (runId) {
				await addScreenshotToRun(runId, file);
			}

			return file;
		}
	} catch (err) {
		// If screenshot fails due to page being closed, throw a more helpful error
		if (err instanceof Error && err.message.includes("Target closed")) {
			throw new Error(
				"Cannot take screenshot: page was closed during screenshot capture",
			);
		}
		throw err;
	}
}

/**
 * Wait for profile page to be loaded and ready
 */
async function waitForProfilePage(
	page: Page,
	username: string,
	_timeout: number = 10000,
): Promise<boolean> {
	if (!isPageOpen(page)) {
		return false;
	}

	try {
		// Wait for page to be ready
		await waitForPageReady(page, 3000);

		// Check again after waiting
		if (!isPageOpen(page)) {
			return false;
		}

		// Check if we're on the profile page
		const currentUrl = page.url();
		const isOnProfile =
			currentUrl.includes(`/${username}/`) ||
			currentUrl.includes(`/${username.toLowerCase()}/`);

		if (!isOnProfile) {
			return false;
		}

		// Wait for profile-specific elements to be visible
		// Try multiple selectors that indicate a profile page is loaded
		const selectors = [
			"header", // Profile header
			'article[role="main"]', // Main content area
			'section[role="main"]', // Alternative main content
		];

		for (const selector of selectors) {
			try {
				if (!isPageOpen(page)) {
					return false;
				}
				await page.waitForSelector(selector, { timeout: 2000 });
				return true;
			} catch {}
		}

		// If no selector matched, check if page has loaded content
		if (!isPageOpen(page)) {
			return false;
		}

		const hasContent = await page.evaluate(() => {
			return Boolean(
				document.body.textContent && document.body.textContent.length > 100,
			);
		});

		return hasContent;
	} catch (_err) {
		return false;
	}
}

/**
 * Save a screenshot with a structured naming convention:
 * screenshots/YYYY-MM-DD/YYYY-MM-DD_TYPE_USERNAME_ACTION.png
 *
 * For profile-related screenshots, waits for the profile page to be loaded.
 * For other types, waits for the page to be in a ready state.
 *
 * @param page - Puppeteer page instance
 * @param type - Type of action (e.g., "follow", "dm", "login")
 * @param username - Instagram username
 * @param action - Action result (e.g., "success", "failed", "error", "state")
 * @returns Path to the saved screenshot
 * @throws Error if page is closed or screenshot cannot be taken
 */
export async function saveScreenshot(
	page: Page,
	type: string,
	username: string,
	action: string,
	force: boolean = false,
): Promise<string> {
	// Check if screenshots are enabled (unless forced for functional screenshots)
	if (!shouldTakeScreenshot(force)) {
		// Return a dummy path to maintain API compatibility
		return "";
	}

	// Check if page is still open before doing anything
	if (!isPageOpen(page)) {
		throw new Error("Cannot take screenshot: page is closed");
	}

	const now = new Date();
	const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

	const baseDir = "screenshots";
	const dateDir = `${baseDir}/${date}`;

	await fs.mkdir(dateDir, { recursive: true });

	// Format: YYYY-MM-DD_TYPE_USERNAME_ACTION.png
	const filename = `${date}_${type}_${username}_${action}.png`;
	const file = `${dateDir}/${filename}`;

	// For profile-related actions, wait for profile page to be ready
	if (type === "follow" || type === "dm") {
		const profileReady = await waitForProfilePage(page, username, 10000);
		if (!profileReady) {
			// Check if page is still open before warning
			if (isPageOpen(page)) {
				const currentUrl = page.url();
				console.warn(
					`⚠️  Profile page not ready for @${username}. Current URL: ${currentUrl}. Taking screenshot anyway.`,
				);
			} else {
				throw new Error(
					"Cannot take screenshot: page was closed while waiting for profile",
				);
			}
		}
	} else {
		// For other types, just wait for page to be ready
		await waitForPageReady(page);
	}

	// Final check before taking screenshot
	if (!isPageOpen(page)) {
		throw new Error(
			"Cannot take screenshot: page was closed before screenshot",
		);
	}

	// Log current URL for debugging
	let currentUrl = "unknown";
	try {
		currentUrl = page.url();
	} catch {
		// URL access failed, page might be closing
		if (!isPageOpen(page)) {
			throw new Error("Cannot take screenshot: page is closed");
		}
	}

	console.log(
		`📸 Taking screenshot at: ${currentUrl} (type: ${type}, action: ${action}, user: @${username})`,
	);

	try {
		// For Browserless, try using CDP screenshot API directly as a fallback
		if (!LOCAL_BROWSER) {
			try {
				await page.screenshot({ path: file, fullPage: true });
				return file;
			} catch (puppeteerErr) {
				// If Puppeteer screenshot fails, try CDP directly
				if (
					puppeteerErr instanceof Error &&
					(puppeteerErr.message.includes("Target closed") ||
						puppeteerErr.message.includes("Session closed"))
				) {
					// Try CDP screenshot as fallback for Browserless
					try {
						const pageWithCDP = page as unknown as {
							createCDPSession?: () => Promise<{
								send: (method: string, params?: unknown) => Promise<unknown>;
							}>;
						};
						if (typeof pageWithCDP.createCDPSession === "function") {
							const cdp = await pageWithCDP.createCDPSession();
							const screenshotData = (await cdp.send("Page.captureScreenshot", {
								format: "png",
								fromSurface: true,
							})) as { data?: string };

							if (screenshotData?.data) {
								const buffer = Buffer.from(screenshotData.data, "base64");
								await fs.writeFile(file, buffer);
								console.log(`📸 Screenshot saved via CDP: ${file}`);
								return file;
							}
						}
					} catch (_cdpErr) {
						// CDP also failed, throw original error
						throw new Error(
							`Cannot take screenshot: page was closed. Original error: ${puppeteerErr.message}`,
						);
					}
				}
				throw puppeteerErr;
			}
		} else {
			// For local browser, use standard Puppeteer screenshot
			await page.screenshot({ path: file, fullPage: true });
			return file;
		}
	} catch (err) {
		// If screenshot fails due to page being closed, throw a more helpful error
		if (
			err instanceof Error &&
			(err.message.includes("Target closed") ||
				err.message.includes("Session closed"))
		) {
			throw new Error(
				"Cannot take screenshot: page was closed during screenshot capture",
			);
		}
		throw err;
	}
}
