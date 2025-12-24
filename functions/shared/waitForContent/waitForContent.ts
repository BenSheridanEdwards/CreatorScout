import type { Page } from "puppeteer";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Dismiss cookie banner if present
 */
export async function dismissCookieBanner(page: Page): Promise<boolean> {
	try {
		const clicked = await page.evaluate(() => {
			const buttons = document.querySelectorAll("button, a, [role='button']");
			for (const btn of buttons) {
				const text = btn.textContent?.trim().toLowerCase();
				if (
					text === "allow all cookies" ||
					text === "accept all" ||
					text === "accept" ||
					text === "decline optional cookies"
				) {
					(btn as HTMLElement).click();
					return true;
				}
			}
			return false;
		});

		if (clicked) {
			logger.info("WAIT", "✅ Cookie banner dismissed");
			await new Promise((r) => setTimeout(r, 1000));
		}
		return clicked;
	} catch {
		return false;
	}
}

/**
 * Wait for Instagram to be ready - either login form or logged-in state
 */
export async function waitForInstagramContent(
	page: Page,
	timeout: number = 30000,
): Promise<boolean> {
	const startTime = Date.now();

	// First, try to dismiss cookie banner
	await dismissCookieBanner(page);

	while (Date.now() - startTime < timeout) {
		try {
			if (page.isClosed()) return false;

			const state = await page.evaluate(() => {
				// Login form present?
				const hasLoginForm =
					!!document.querySelector('input[name="username"]') ||
					!!document.querySelector('input[type="password"]');

				// Already logged in?
				const hasLoggedInUI =
					!!document.querySelector('a[href="/direct/inbox/"]') ||
					!!document.querySelector('svg[aria-label="Home"]') ||
					!!document.querySelector('[aria-label="New post"]');

				// Has any substantial content?
				const bodyText = document.body?.innerText?.trim() || "";
				const hasContent = bodyText.length > 100;

				return { hasLoginForm, hasLoggedInUI, hasContent };
			});

			if (state.hasLoginForm || state.hasLoggedInUI || state.hasContent) {
				logger.info(
					"WAIT",
					`✅ Ready: login=${state.hasLoginForm}, loggedIn=${state.hasLoggedInUI}, content=${state.hasContent}`,
				);
				return true;
			}

			await new Promise((r) => setTimeout(r, 500));
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}

	logger.warn("WAIT", "Timeout waiting for Instagram");
	return false;
}

/**
 * Check if on login page
 */
export async function detectIfOnInstagramLogin(page: Page): Promise<boolean> {
	return await page.evaluate(() => {
		return (
			window.location.href.includes("/accounts/login") ||
			!!document.querySelector('input[name="username"]') ||
			!!document.querySelector('input[type="password"]')
		);
	});
}
