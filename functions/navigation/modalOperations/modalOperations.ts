/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { Page } from "puppeteer";
import { microDelay, shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import {
	humanClick,
	humanClickAt,
} from "../humanInteraction/humanInteraction.ts";

/**
 * Open the "Following" modal for a profile.
 * Uses ghost-cursor for human-like clicking.
 */
export async function openFollowingModal(page: Page): Promise<boolean> {
	console.log("[MODAL] Attempting to open following modal...");

	// Wait for page to stabilize
	await shortDelay(1, 2);

	// Get current URL to construct the following link selector
	const currentUrl = page.url();
	const usernameMatch = currentUrl.match(/instagram\.com\/([^/?]+)/);
	const username = usernameMatch ? usernameMatch[1] : null;

	console.log(`[MODAL] Current URL: ${currentUrl}`);
	console.log(`[MODAL] Detected username: ${username}`);

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
			console.log(`[MODAL] Looking for selector: ${sel}`);
			const handle = await page.$(sel);

			if (handle) {
				// Verify it's a following link (not followers)
				const href = await handle.evaluate((el: Element) =>
					el.getAttribute("href"),
				);
				const text = await handle.evaluate(
					(el: Element) => el.textContent || "",
				);

				console.log(
					`[MODAL] Found element - href: ${href}, text: ${text.trim()}`,
				);

				// Skip if it's a followers link
				if (
					href?.includes("/followers") ||
					text.toLowerCase().includes("followers")
				) {
					console.log(`[MODAL] Skipping - this is a followers link`);
					continue;
				}

				// Click with ghost-cursor
				console.log(`[MODAL] Clicking with ghost-cursor...`);
				await humanClick(page, handle, { elementType: "link" });
				await shortDelay(1.5, 2.5);

				// Check if modal opened
				const modalOpened = await page
					.$('div[role="dialog"]')
					.then((el) => el !== null);

				if (modalOpened) {
					console.log("[MODAL] Modal opened successfully!");
					return true;
				}

				console.log("[MODAL] Modal did not open, trying next selector...");
			}
		} catch (e) {
			console.log(`[MODAL] Selector ${sel} failed: ${e}`);
		}
	}

	// Fallback: Find by evaluating page content and click at coordinates
	console.log("[MODAL] Trying coordinate-based click...");
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
			console.log(
				`[MODAL] Found following link via evaluate: ${linkInfo.href}`,
			);
			console.log(
				`[MODAL] Clicking at coordinates: (${linkInfo.x}, ${linkInfo.y})`,
			);

			// Click at coordinates using ghost-cursor
			await humanClickAt(page, linkInfo.x, linkInfo.y, {
				elementType: "link",
			});

			await shortDelay(1.5, 2.5);

			const modalOpened = await page
				.$('div[role="dialog"]')
				.then((el) => el !== null);

			if (modalOpened) {
				console.log("[MODAL] Modal opened via coordinate click!");
				return true;
			}
		}
	} catch (e) {
		console.log(`[MODAL] Coordinate click failed: ${e}`);
	}

	// Take debug screenshot on failure
	console.log("[MODAL] All strategies failed, taking debug screenshot...");
	try {
		const { snapshot } = await import("../../shared/snapshot/snapshot.ts");
		await snapshot(page, "modal_open_failed");
	} catch {
		// Ignore
	}

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
				text.includes("people you follow") && text.includes("once you follow people"),
				// Alternative phrasing
				text.includes("no one") && text.includes("follow"),
				// Check if only "Suggested for you" exists with no actual users
				text.includes("suggested for you") && !dialog.querySelector('a[href^="/"]:not([href*="explore"])'),
			];
			
			// Also check if there are any user links in the modal (excluding system links)
			const userLinks = dialog.querySelectorAll('a[href^="/"]');
			let actualUserCount = 0;
			for (const link of userLinks) {
				const href = link.getAttribute("href") || "";
				const parts = href.split("/").filter(Boolean);
				if (parts.length === 1) {
					const name = parts[0].toLowerCase();
					const systemPages = ["explore", "direct", "accounts", "stories", "reels", "p", "tv", "reel"];
					if (!systemPages.includes(name)) {
						actualUserCount++;
					}
				}
			}
			
			// Empty if we have empty indicators OR if there are no actual user links
			return emptyIndicators.some(Boolean) || actualUserCount === 0;
		});

		if (isEmpty) {
			console.log("[MODAL] Following modal is empty - no people followed");
		}
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
	console.log(`[MODAL] Extracting up to ${batchSize} usernames from modal...`);

	try {
		await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
		console.log("[MODAL] Modal dialog found");
	} catch {
		console.log("[MODAL] No modal dialog found");
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

	console.log(
		`[MODAL] Extracted ${usernames.length} usernames: ${usernames.join(", ")}`,
	);
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
	console.log(`[MODAL] Attempting to click username @${targetUsername} in modal...`);

	try {
		// Ensure modal is open
		await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });
		console.log("[MODAL] Modal dialog found");
	} catch {
		console.log("[MODAL] No modal dialog found");
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
			const linkIndex = await page.evaluate(
				(targetUser: string) => {
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
				},
				targetUsername,
			);

			if (linkIndex === -1) {
				console.log(
					`[MODAL] Username @${targetUsername} not found in modal`,
				);
				return false;
			}

			// Get the link by index
			const links = await page.$$('div[role="dialog"] a[href^="/"]');
			if (linkIndex >= 0 && linkIndex < links.length) {
				linkHandle = links[linkIndex];
			}
		}

		if (!linkHandle) {
			console.log(
				`[MODAL] Username @${targetUsername} not found in modal`,
			);
			return false;
		}

		// Click with ghost-cursor for human-like behavior
		console.log(`[MODAL] Clicking on @${targetUsername} link in modal...`);
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
			console.log(`[MODAL] Modal closed, navigation to @${targetUsername} started`);
			return true;
		} catch {
			// Modal might not close immediately, or navigation might be delayed
			// Check if URL changed instead
			const currentUrl = page.url();
			if (currentUrl.includes(`/${targetUsername}/`)) {
				console.log(
					`[MODAL] Successfully navigated to @${targetUsername} profile`,
				);
				return true;
			}

			// Give it a bit more time
			await shortDelay(1, 2);
			const finalUrl = page.url();
			if (finalUrl.includes(`/${targetUsername}/`)) {
				console.log(
					`[MODAL] Successfully navigated to @${targetUsername} profile (delayed)`,
				);
				return true;
			}

			console.log(
				`[MODAL] Click succeeded but navigation not confirmed for @${targetUsername}`,
			);
			return false;
		}
	} catch (error) {
		const errorMsg =
			error instanceof Error ? error.message : String(error);
		console.log(`[MODAL] Failed to click @${targetUsername}: ${errorMsg}`);
		return false;
	}
}

/**
 * Scroll the following modal to load more profiles.
 */
export async function scrollFollowingModal(
	page: Page,
	scrollAmount: number = 600,
): Promise<void> {
	try {
		await page.evaluate((amount) => {
			const dialog = document.querySelector('div[role="dialog"]');
			if (!dialog) return;

			// Find scrollable container within dialog
			const scrollable =
				dialog.querySelector('div[style*="overflow"]') ||
				dialog.querySelector("ul")?.parentElement ||
				dialog;

			// Try to scroll it
			if (scrollable && "scrollTop" in scrollable) {
				(scrollable as HTMLElement).scrollTop += amount;
			}
		}, scrollAmount);
		await microDelay(0.2, 0.5);
	} catch (e) {
		console.log(`[MODAL] Could not scroll modal: ${e}`);
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
