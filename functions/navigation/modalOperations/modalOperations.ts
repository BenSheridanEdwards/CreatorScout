/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import {
	humanLikeClickAt,
	humanLikeClickHandle,
} from "../humanClick/humanClick.ts";

/**
 * Open the "Following" modal for a profile.
 * Uses ghost-cursor for human-like clicking.
 */
export async function openFollowingModal(page: Page): Promise<boolean> {
	console.log("[MODAL] Attempting to open following modal...");

	// Wait for page to stabilize
	await sleep(2000);

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
				await humanLikeClickHandle(page, handle, { elementType: "link" });
				await sleep(3000);

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
			console.log(`[MODAL] Found following link via evaluate: ${linkInfo.href}`);
			console.log(
				`[MODAL] Clicking at coordinates: (${linkInfo.x}, ${linkInfo.y})`,
			);

			// Click at coordinates using ghost-cursor
			await humanLikeClickAt(page, linkInfo.x, linkInfo.y, {
				elementType: "link",
			});

			await sleep(3000);

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
	await sleep(1500);

	// Scroll to load content
	await scrollFollowingModal(page, 600);
	await sleep(1000);

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
		await sleep(400);
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
		await sleep(1000);
		return true;
	} catch {
		return false;
	}
}
