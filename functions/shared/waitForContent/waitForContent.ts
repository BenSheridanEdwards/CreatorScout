import type { Page } from "puppeteer";
import { humanClick } from "../../navigation/humanInteraction/humanInteraction.ts";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

/**
 * Dismiss cookie banner if present using human-like clicking
 */
export async function dismissCookieBanner(page: Page): Promise<boolean> {
	try {
		// Find the cookie button without clicking it in DOM
		const buttonInfo = await page.evaluate(() => {
			const buttons = document.querySelectorAll("button, a, [role='button']");
			for (let i = 0; i < buttons.length; i++) {
				const btn = buttons[i];
				const text = btn.textContent?.trim().toLowerCase();
				if (
					text === "allow all cookies" ||
					text === "accept all" ||
					text === "accept" ||
					text === "decline optional cookies"
				) {
					return { found: true, index: i, text };
				}
			}
			return { found: false };
		});

		if (buttonInfo.found && typeof buttonInfo.index === "number") {
			// Re-select and click with human-like behavior
			const buttons = await page.$$("button, a, [role='button']");
			const targetButton = buttons[buttonInfo.index];
			if (targetButton) {
				await humanClick(page, targetButton, { elementType: "button" });
				logger.info(
					"WAIT",
					`✅ Cookie banner dismissed (human-like): ${buttonInfo.text}`,
				);
				await new Promise((r) => setTimeout(r, 1000));
				return true;
			}
		}
		return false;
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
