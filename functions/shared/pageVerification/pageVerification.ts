import type { Page } from "puppeteer";
import { createLogger } from "../logger/logger.ts";
import { waitForInstagramContent } from "../waitForContent/waitForContent.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Verify that the Instagram homepage is fully loaded by checking for key content elements
 */
export async function verifyHomePageLoaded(page: Page): Promise<boolean> {
	try {
		if (page.isClosed()) {
			logger.warn("VERIFY", "Page is closed, cannot verify homepage");
			return false;
		}

		// Check for multiple indicators that homepage is loaded
		const indicators = await page.evaluate(() => {
			const hasHomeIcon =
				Array.from(document.querySelectorAll("svg")).some(
					(svg) => svg.getAttribute("aria-label") === "Home",
				) ||
				document.querySelector('a[href="/"]') !== null ||
				document.querySelector('a[aria-label*="Home"]') !== null;

			const hasNavBar =
				document.querySelector("nav") !== null ||
				document.querySelector('div[role="navigation"]') !== null;

			const hasMainContent =
				document.querySelector("main") !== null ||
				document.querySelector('article') !== null ||
				document.querySelector('div[role="main"]') !== null;

			const hasSearchOrExplore =
				document.querySelector('a[href="/explore/"]') !== null ||
				document.querySelector('input[placeholder*="Search"]') !== null ||
				document.querySelector('input[aria-label*="Search"]') !== null;

			return {
				hasHomeIcon,
				hasNavBar,
				hasMainContent,
				hasSearchOrExplore,
			};
		});

		const isLoaded =
			indicators.hasHomeIcon &&
			indicators.hasNavBar &&
			(indicators.hasMainContent || indicators.hasSearchOrExplore);

		if (isLoaded) {
			logger.info(
				"VERIFY",
				`✅ Homepage verified: Home icon=${indicators.hasHomeIcon}, Nav bar=${indicators.hasNavBar}, Main content=${indicators.hasMainContent}, Search/Explore=${indicators.hasSearchOrExplore}`,
			);
		} else {
			logger.warn(
				"VERIFY",
				`⚠️ Homepage verification incomplete: Home icon=${indicators.hasHomeIcon}, Nav bar=${indicators.hasNavBar}, Main content=${indicators.hasMainContent}, Search/Explore=${indicators.hasSearchOrExplore}`,
			);
		}

		return isLoaded;
	} catch (err) {
		logger.warn("VERIFY", `Error verifying homepage: ${err}`);
		return false;
	}
}

/**
 * Verify that a profile page is fully loaded by checking for key content elements
 */
export async function verifyProfilePageLoaded(
	page: Page,
	username: string,
): Promise<boolean> {
	try {
		if (page.isClosed()) {
			logger.warn("VERIFY", "Page is closed, cannot verify profile page");
			return false;
		}

		// Check if frame is accessible
		try {
			page.url();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (errorMsg.includes("detached Frame")) {
				logger.warn("VERIFY", `Frame is detached, cannot verify profile page: ${errorMsg}`);
				return false;
			}
			throw err;
		}

		const u = username.toLowerCase().trim();

		// Check for multiple indicators that profile page is loaded
		const indicators = await page.evaluate((targetUsername) => {
			const url = window.location.href.toLowerCase();
			const hasCorrectUrl = url.includes(`/${targetUsername}/`);

			const hasProfileHeader =
				document.querySelector('header') !== null ||
				document.querySelector('section[role="region"]') !== null;

			const hasProfileImage =
				document.querySelector('img[alt*="profile picture"]') !== null ||
				document.querySelector('img[alt*="Profile picture"]') !== null ||
				document.querySelector('img[alt*="' + targetUsername + '"]') !== null;

			const hasBio =
				document.querySelector('div[dir="auto"]') !== null ||
				document.querySelector('span[dir="auto"]') !== null ||
				document.querySelector('h1') !== null;

			const hasPostsOrTabs =
				document.querySelector('article') !== null ||
				document.querySelector('div[role="tablist"]') !== null ||
				document.querySelector('a[href*="/p/"]') !== null;

			return {
				hasCorrectUrl,
				hasProfileHeader,
				hasProfileImage,
				hasBio,
				hasPostsOrTabs,
			};
		}, u);

		const isLoaded =
			indicators.hasCorrectUrl &&
			indicators.hasProfileHeader &&
			(indicators.hasProfileImage || indicators.hasBio) &&
			indicators.hasPostsOrTabs;

		if (isLoaded) {
			logger.info(
				"VERIFY",
				`✅ Profile @${username} verified: URL=${indicators.hasCorrectUrl}, Header=${indicators.hasProfileHeader}, Image=${indicators.hasProfileImage}, Bio=${indicators.hasBio}, Posts/Tabs=${indicators.hasPostsOrTabs}`,
			);
		} else {
			logger.warn(
				"VERIFY",
				`⚠️ Profile @${username} verification incomplete: URL=${indicators.hasCorrectUrl}, Header=${indicators.hasProfileHeader}, Image=${indicators.hasProfileImage}, Bio=${indicators.hasBio}, Posts/Tabs=${indicators.hasPostsOrTabs}`,
			);
		}

		return isLoaded;
	} catch (err) {
		logger.warn("VERIFY", `Error verifying profile page: ${err}`);
		return false;
	}
}

/**
 * Verify that the explore/search page is fully loaded
 */
export async function verifyExplorePageLoaded(page: Page): Promise<boolean> {
	try {
		if (page.isClosed()) {
			logger.warn("VERIFY", "Page is closed, cannot verify explore page");
			return false;
		}

		// Check if frame is accessible
		try {
			page.url();
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (errorMsg.includes("detached Frame")) {
				logger.warn("VERIFY", `Frame is detached, cannot verify explore page: ${errorMsg}`);
				return false;
			}
			throw err;
		}

		const indicators = await page.evaluate(() => {
			const url = window.location.href.toLowerCase();
			const hasCorrectUrl = url.includes("/explore/");

			const hasSearchInput =
				document.querySelector('input[placeholder*="Search"]') !== null ||
				document.querySelector('input[aria-label*="Search"]') !== null;

			const hasExploreContent =
				document.querySelector('main') !== null ||
				document.querySelector('article') !== null ||
				document.querySelector('div[role="main"]') !== null;

			return {
				hasCorrectUrl,
				hasSearchInput,
				hasExploreContent,
			};
		});

		const isLoaded =
			indicators.hasCorrectUrl &&
			indicators.hasSearchInput &&
			indicators.hasExploreContent;

		if (isLoaded) {
			logger.info(
				"VERIFY",
				`✅ Explore page verified: URL=${indicators.hasCorrectUrl}, Search input=${indicators.hasSearchInput}, Content=${indicators.hasExploreContent}`,
			);
		} else {
			logger.warn(
				"VERIFY",
				`⚠️ Explore page verification incomplete: URL=${indicators.hasCorrectUrl}, Search input=${indicators.hasSearchInput}, Content=${indicators.hasExploreContent}`,
			);
		}

		return isLoaded;
	} catch (err) {
		logger.warn("VERIFY", `Error verifying explore page: ${err}`);
		return false;
	}
}

/**
 * Navigate to Instagram homepage using UI (clicking home icon/logo)
 */
export async function navigateToHomeViaUI(page: Page): Promise<void> {
	logger.info("NAVIGATE", "Navigating to homepage via UI (clicking home icon/logo)");

	// Check if page is closed
	if (page.isClosed()) {
		throw new Error("Page is closed, cannot navigate via UI");
	}

	// Check if frame is accessible
	try {
		page.url();
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		if (errorMsg.includes("detached Frame")) {
			throw new Error(
				`Frame is detached, cannot navigate via UI: ${errorMsg}`,
			);
		}
		// Re-throw other errors
		throw err;
	}

	// Try multiple selectors for home icon/logo
	const homeSelectors = [
		'a[href="/"]',
		'a[aria-label*="Home"]',
		'svg[aria-label="Home"]',
		'a[href="/"] svg',
		'div[role="link"][href="/"]',
	];

	let clicked = false;
	for (const selector of homeSelectors) {
		try {
			// Check frame again before each attempt
			if (page.isClosed()) {
				throw new Error("Page closed during navigation attempt");
			}

			const homeElement = await page.$(selector);
			if (homeElement) {
				await homeElement.click({ delay: 100 + Math.random() * 100 });
				clicked = true;
				logger.info("NAVIGATE", `✅ Clicked home icon using selector: ${selector}`);
				break;
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			// If frame is detached, rethrow immediately
			if (errorMsg.includes("detached Frame") || errorMsg.includes("Target closed")) {
				throw err;
			}
			// Continue to next selector for other errors
			continue;
		}
	}

	if (!clicked) {
		// Fallback: try clicking any element with "Home" text
		try {
			// Check frame before evaluate
			if (page.isClosed()) {
				throw new Error("Page closed during navigation attempt");
			}

			const homeByText = await page.evaluate(() => {
				const links = Array.from(document.querySelectorAll("a, div[role='link']"));
				for (const link of links) {
					const text = link.textContent?.toLowerCase() || "";
					const ariaLabel = link.getAttribute("aria-label")?.toLowerCase() || "";
					if (text.includes("home") || ariaLabel.includes("home")) {
						(link as HTMLElement).click();
						return true;
					}
				}
				return false;
			});

			if (homeByText) {
				logger.info("NAVIGATE", "✅ Clicked home via text search");
				clicked = true;
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			// If frame is detached, rethrow immediately
			if (errorMsg.includes("detached Frame") || errorMsg.includes("Target closed")) {
				throw err;
			}
		}
	}

	if (!clicked) {
		throw new Error(
			"Could not find home icon/logo to navigate to homepage via UI",
		);
	}

	// Wait for Instagram content to actually load (more reliable than fixed delay)
	logger.info("NAVIGATE", "Waiting for Instagram content to appear...");
	const contentLoaded = await waitForInstagramContent(page, 30000);
	if (!contentLoaded) {
		logger.warn("NAVIGATE", "Instagram content did not load within timeout");
	}
	
	// Check frame before verification
	try {
		if (!page.isClosed()) {
			page.url(); // Check frame is accessible
			await verifyHomePageLoaded(page);
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		if (errorMsg.includes("detached Frame")) {
			logger.warn("VERIFY", "Frame detached after navigation, skipping verification");
		} else {
			logger.warn("VERIFY", `Error verifying homepage after navigation: ${err}`);
		}
	}
}

