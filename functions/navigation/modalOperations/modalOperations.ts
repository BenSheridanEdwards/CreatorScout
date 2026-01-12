/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";
import { microDelay, shortDelay } from "../../timing/humanize/humanize.ts";
import {
	humanClick,
	humanClickAt,
} from "../humanInteraction/humanInteraction.ts";

const logger = createLogger();

/**
 * Open the "Following" modal for a profile.
 * Uses ghost-cursor for human-like clicking.
 */
export async function openFollowingModal(page: Page): Promise<boolean> {
	// Wait for page to stabilize
	await shortDelay(1, 2);

	// Get current URL to construct the following link selector
	const currentUrl = page.url();
	const usernameMatch = currentUrl.match(/instagram\.com\/([^/?]+)/);
	const username = usernameMatch ? usernameMatch[1] : null;

	// Build selector list - most specific first
	const selectors: string[] = [];
	if (username) {
		selectors.push(`a[href="/${username}/following/"]`);
		selectors.push(`a[href="/${username}/following"]`);
	}
	selectors.push('a[href$="/following/"]');
	selectors.push('a[href$="/following"]');
	selectors.push('li a[href*="/following"]');

	// Try each selector with ghost-cursor click
	for (const sel of selectors) {
		try {
			const handle = await page.$(sel);

			if (handle) {
				// Verify it's a following link (not followers)
				const href = await handle.evaluate((el: Element) =>
					el.getAttribute("href"),
				);
				const text = await handle.evaluate(
					(el: Element) => el.textContent || "",
				);

				// Skip if it's a followers link
				if (
					href?.includes("/followers") ||
					text.toLowerCase().includes("followers")
				) {
					continue;
				}

				// Click with ghost-cursor
				await humanClick(page, handle, { elementType: "link" });
				await shortDelay(1.5, 2.5);

				// Check if modal opened
				const modalOpened = await page
					.$('div[role="dialog"]')
					.then((el) => el !== null);

				if (modalOpened) {
					logger.info("MODAL", "Following modal opened");
					return true;
				}
			}
		} catch {
			// Try next selector
		}
	}

	// Fallback: Find by evaluating page content and click at coordinates
	try {
		const linkInfo = await page.evaluate(() => {
			const links = Array.from(document.querySelectorAll("a"));
			for (const link of links) {
				const href = link.getAttribute("href") || "";
				const text = (link.textContent || "").toLowerCase();

				// Must contain "following" in href but NOT "followers"
				if (
					href.includes("/following") &&
					!href.includes("/followers") &&
					!text.includes("followers")
				) {
					// Get center coordinates
					const rect = link.getBoundingClientRect();
					return {
						href,
						text: link.textContent,
						x: rect.x + rect.width / 2,
						y: rect.y + rect.height / 2,
						found: true,
					};
				}
			}
			return { found: false };
		});

		if (linkInfo.found && linkInfo.x && linkInfo.y) {
			// Click at coordinates using ghost-cursor
			await humanClickAt(page, linkInfo.x, linkInfo.y, {
				elementType: "link",
			});

			await shortDelay(1.5, 2.5);

			const modalOpened = await page
				.$('div[role="dialog"]')
				.then((el) => el !== null);

			if (modalOpened) {
				logger.info("MODAL", "Following modal opened");
				return true;
			}
		}
	} catch {
		// Fallback failed
	}

	// Take debug screenshot on failure
	try {
		const { snapshot } = await import("../../shared/snapshot/snapshot.ts");
		await snapshot(page, "modal_open_failed");
	} catch {
		// Ignore
	}

	logger.warn("MODAL", "Failed to open following modal");
	return false;
}

/**
 * Check if the following modal is in an empty state (no people followed).
 * Returns true if the modal shows the empty state message.
 */
export async function isFollowingModalEmpty(page: Page): Promise<boolean> {
	try {
		const isEmpty = await page.evaluate(() => {
			const dialog = document.querySelector('div[role="dialog"]');
			if (!dialog) return false;

			const text = (dialog.textContent || "").toLowerCase();

			// Check for various empty state indicators
			const emptyIndicators = [
				// Primary empty state
				text.includes("people you follow") &&
					text.includes("once you follow people"),
				// Alternative phrasing
				text.includes("no one") && text.includes("follow"),
				// Check if only "Suggested for you" exists with no actual users
				text.includes("suggested for you") &&
					!dialog.querySelector('a[href^="/"]:not([href*="explore"])'),
			];

			// Also check if there are any user links in the modal (excluding system links)
			const userLinks = dialog.querySelectorAll('a[href^="/"]');
			let actualUserCount = 0;
			for (const link of userLinks) {
				const href = link.getAttribute("href") || "";
				const parts = href.split("/").filter(Boolean);
				if (parts.length === 1) {
					const name = parts[0].toLowerCase();
					const systemPages = [
						"explore",
						"direct",
						"accounts",
						"stories",
						"reels",
						"p",
						"tv",
						"reel",
					];
					if (!systemPages.includes(name)) {
						actualUserCount++;
					}
				}
			}

			// Empty if we have empty indicators OR if there are no actual user links
			return emptyIndicators.some(Boolean) || actualUserCount === 0;
		});

		return isEmpty;
	} catch {
		return false;
	}
}

/**
 * Extract usernames from the following modal.
 * Returns array of usernames (without @ symbol).
 */
export async function extractFollowingUsernames(
	page: Page,
	batchSize: number = 10,
): Promise<string[]> {
	try {
		await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
	} catch {
		return [];
	}

	// Wait for content to load
	await shortDelay(0.8, 1.5);

	// Scroll to load content
	await scrollFollowingModal(page, 600);
	await shortDelay(0.5, 1);

	// Extract usernames from links in the modal
	const usernames = await page.evaluate((maxCount: number) => {
		const dialog = document.querySelector('div[role="dialog"]');
		if (!dialog) return [];

		const links = dialog.querySelectorAll('a[href^="/"]');
		const found: string[] = [];
		const seen = new Set<string>();

		for (const link of links) {
			const href = link.getAttribute("href") || "";
			const parts = href.split("/").filter(Boolean);

			// Username links are /{username}/ format (single path segment)
			if (parts.length === 1) {
				const username = parts[0].toLowerCase();

				// Filter out system pages
				const systemPages = [
					"explore",
					"direct",
					"accounts",
					"stories",
					"reels",
					"p",
					"tv",
					"reel",
				];

				if (!systemPages.includes(username) && !seen.has(username)) {
					seen.add(username);
					found.push(username);
					if (found.length >= maxCount) break;
				}
			}
		}

		return found;
	}, batchSize);

	if (usernames.length > 0) {
		logger.info("BATCH", `Extracted ${usernames.length} profiles from modal`);
	}
	return usernames;
}

/**
 * Click on a username link directly in the open following modal.
 * This navigates to the profile without closing the modal first.
 * Returns true if successful, false if username not found or click failed.
 */
export async function clickUsernameInModal(
	page: Page,
	username: string,
): Promise<boolean> {
	const targetUsername = username.toLowerCase().trim();

	try {
		// Ensure modal is open
		await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
	} catch {
		return false;
	}

	// Wait for content to load
	await shortDelay(0.5, 1);

	try {
		// Find the link element for this username within the modal
		// First, try direct selector approach
		const directSelector = `div[role="dialog"] a[href="/${targetUsername}/"]`;
		let linkHandle = await page.$(directSelector);

		// If not found, search within modal using evaluate
		if (!linkHandle) {
			const linkIndex = await page.evaluate((targetUser: string) => {
				const dialog = document.querySelector('div[role="dialog"]');
				if (!dialog) return -1;

				const links = dialog.querySelectorAll('a[href^="/"]');
				for (let i = 0; i < links.length; i++) {
					const link = links[i];
					const href = link.getAttribute("href") || "";
					const parts = href.split("/").filter(Boolean);

					// Username links are /{username}/ format (single path segment)
					if (parts.length === 1) {
						const linkUsername = parts[0].toLowerCase();
						if (linkUsername === targetUser) {
							return i;
						}
					}
				}
				return -1;
			}, targetUsername);

			if (linkIndex === -1) {
				return false;
			}

			// Get the link by index
			const links = await page.$$('div[role="dialog"] a[href^="/"]');
			if (linkIndex >= 0 && linkIndex < links.length) {
				linkHandle = links[linkIndex];
			}
		}

		if (!linkHandle) {
			return false;
		}

		// Click with ghost-cursor for human-like behavior
		await humanClick(page, linkHandle, { elementType: "link" });

		// Wait for navigation to start
		await shortDelay(1, 2);

		// Check if navigation occurred by waiting for URL change or modal to close
		// The modal should close automatically when clicking a username link
		try {
			// Wait a bit to see if modal closes (indicates navigation started)
			await page.waitForFunction(
				() => {
					const dialog = document.querySelector('div[role="dialog"]');
					return dialog === null;
				},
				{ timeout: 3000 },
			);
			return true;
		} catch {
			// Modal might not close immediately, or navigation might be delayed
			// Check if URL changed instead
			const currentUrl = page.url();
			if (currentUrl.includes(`/${targetUsername}/`)) {
				return true;
			}

			// Give it a bit more time
			await shortDelay(1, 2);
			const finalUrl = page.url();
			if (finalUrl.includes(`/${targetUsername}/`)) {
				return true;
			}

			return false;
		}
	} catch {
		return false;
	}
}

/**
 * Scroll the following modal to load more profiles.
 * Returns the new scroll height for flatline detection.
 */
export async function scrollFollowingModal(
	page: Page,
	scrollAmount: number = 600,
): Promise<{ scrolled: boolean; scrollHeight: number }> {
	try {
		const result = await page.evaluate((amount) => {
			const dialog = document.querySelector('div[role="dialog"]');
			if (!dialog) return { scrolled: false, scrollHeight: 0 };

			// Find scrollable container within dialog
			const scrollable =
				dialog.querySelector('div[style*="overflow"]') ||
				dialog.querySelector("ul")?.parentElement ||
				dialog;

			// Try to scroll it
			if (scrollable && "scrollTop" in scrollable) {
				const el = scrollable as HTMLElement;
				const beforeScroll = el.scrollTop;
				el.scrollTop += amount;
				const afterScroll = el.scrollTop;
				return {
					scrolled: afterScroll > beforeScroll,
					scrollHeight: el.scrollHeight,
				};
			}
			return { scrolled: false, scrollHeight: 0 };
		}, scrollAmount);
		await microDelay(0.2, 0.5);
		return result;
	} catch {
		return { scrolled: false, scrollHeight: 0 };
	}
}

/**
 * Close the currently open modal
 */
export async function closeModal(page: Page): Promise<boolean> {
	try {
		await page.keyboard.press("Escape");
		await shortDelay(0.5, 1);
		return true;
	} catch {
		return false;
	}
}
