import type { Page } from "puppeteer";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Wait for Instagram content to actually appear on the page
 * This is more reliable than just waiting for networkidle
 */
export async function waitForInstagramContent(
	page: Page,
	timeout: number = 30000,
): Promise<boolean> {
	const startTime = Date.now();
	logger.info("WAIT", "⏳ Waiting for Instagram content to load...");

	while (Date.now() - startTime < timeout) {
		try {
			if (page.isClosed()) {
				logger.warn("WAIT", "Page closed while waiting for content");
				return false;
			}

			// Check for various Instagram content indicators
			const hasContent = await page.evaluate(() => {
				// Check for Instagram-specific elements
				const hasInstagramLogo =
					document.querySelector('svg[aria-label="Instagram"]') !== null ||
					document.querySelector('a[href="/"]') !== null ||
					document.querySelector('img[alt*="Instagram"]') !== null;

				const hasNavElements =
					document.querySelector("nav") !== null ||
					document.querySelector('div[role="navigation"]') !== null ||
					document.querySelector('a[href="/explore/"]') !== null;

				const hasMainContent =
					document.querySelector("main") !== null ||
					document.querySelector("article") !== null ||
					document.querySelector('div[role="main"]') !== null;

				const hasLoginForm =
					document.querySelector('input[name="username"]') !== null ||
					document.querySelector('input[type="password"]') !== null;

				const hasAnyText = document.body?.innerText?.trim().length > 50;

				if (
					hasInstagramLogo ||
					hasNavElements ||
					hasMainContent ||
					hasLoginForm ||
					hasAnyText
				) {
					logger.info("SUCCESS", "✅ Instagram content detected!");
				} else {
					logger.info(
						"ERROR",
						"⚠️  Instagram content did not load within timeout",
					);
				}

				return {
					hasInstagramLogo,
					hasNavElements,
					hasMainContent,
					hasLoginForm,
					hasAnyText,
					bodyTextLength: document.body?.innerText?.trim().length || 0,
					htmlLength: document.documentElement.innerHTML.length,
				};
			});

			// If we have substantial content, we're good
			if (
				hasContent.hasInstagramLogo ||
				hasContent.hasNavElements ||
				hasContent.hasMainContent ||
				hasContent.hasLoginForm ||
				hasContent.hasAnyText
			) {
				logger.info(
					"WAIT",
					`✅ Instagram content detected: Logo=${hasContent.hasInstagramLogo}, Nav=${hasContent.hasNavElements}, Main=${hasContent.hasMainContent}, Login=${hasContent.hasLoginForm}, Text=${hasContent.hasAnyText}, BodyLength=${hasContent.bodyTextLength}, HTMLLength=${hasContent.htmlLength}`,
				);
				return true;
			}

			// If HTML is very small, page might not have loaded
			if (hasContent.htmlLength < 1000) {
				logger.warn(
					"WAIT",
					`⚠️  Page HTML is very small (${hasContent.htmlLength} chars), still loading...`,
				);
			}

			// Wait a bit before checking again
			await new Promise((resolve) => setTimeout(resolve, 1000));
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (
				errorMsg.includes("detached Frame") ||
				errorMsg.includes("Target closed")
			) {
				logger.warn(
					"WAIT",
					`Frame detached while waiting for content: ${errorMsg}`,
				);
				return false;
			}
			// Continue waiting for other errors
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}

	logger.warn("WAIT", "Timeout waiting for Instagram content to load");
	return false;
}

/**
 * Wait for page to be fully interactive with content
 */
export async function waitForPageInteractive(
	page: Page,
	timeout: number = 30000,
): Promise<void> {
	try {
		// Wait for DOM to be ready
		await page
			.waitForFunction(() => document.readyState === "complete", {
				timeout: Math.min(timeout, 10000),
			})
			.catch(() => {
				logger.warn("WAIT", "readyState check timed out, continuing...");
			});

		// Wait for network to be idle
		await page.waitForLoadState?.("networkidle").catch(() => {
			// Fallback if waitForLoadState doesn't exist
		});

		// Wait for Instagram-specific content
		await waitForInstagramContent(page, timeout);
	} catch (err) {
		logger.warn("WAIT", `Error waiting for page interactive: ${err}`);
	}
}

export async function detectIfOnInstagramLogin(page: Page): Promise<boolean> {
	const isLoginPage = await page.evaluate(() => {
		return (
			window.location.href.includes("/accounts/login") ||
			document.querySelector('input[name="username"]') !== null ||
			document.querySelector('input[type="password"]') !== null ||
			document.body?.innerText?.toLowerCase().includes("log in") ||
			document.body?.innerText?.toLowerCase().includes("sign up")
		);
	});

	if (isLoginPage)
		logger.info("SUCCESS", "🔐 Detected: You are on the LOGIN PAGE");

	return isLoginPage;
}
