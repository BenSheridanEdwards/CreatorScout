/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanLikeClickHandle } from "../humanClick/humanClick.ts";

/**
 * Try to click an element using ghost-cursor first, then fallback to direct click
 */
async function clickWithFallback(
	page: Page,
	handle: ElementHandle,
	description: string,
): Promise<boolean> {
	// Strategy 1: Ghost cursor (primary - most human-like)
	try {
		console.log(`[MODAL] Clicking ${description} with ghost-cursor...`);
		await humanLikeClickHandle(page, handle, { elementType: "link" });
		await sleep(2000);

		// Check if modal opened
		const modalOpened = await page
			.$('div[role="dialog"]')
			.then((el) => el !== null);
		if (modalOpened) {
			console.log(`[MODAL] Ghost-cursor click worked for ${description}`);
			return true;
		}
		console.log(`[MODAL] Ghost-cursor click didn't open modal, trying fallback...`);
	} catch (e) {
		console.log(`[MODAL] Ghost-cursor failed: ${e}`);
	}

	// Strategy 2: Direct element.click() as fallback
	try {
		console.log(`[MODAL] Trying direct element.click() for ${description}...`);
		await handle.evaluate((el: Element) => {
			// Ensure element is in view
			(el as HTMLElement).scrollIntoView({ block: "center" });
		});
		await sleep(500);

		await handle.click({ delay: 100 + Math.random() * 100 });
		await sleep(2000);

		const modalOpened = await page
			.$('div[role="dialog"]')
			.then((el) => el !== null);
		if (modalOpened) {
			console.log(`[MODAL] Direct click worked for ${description}`);
			return true;
		}
	} catch (e) {
		console.log(`[MODAL] Direct click failed: ${e}`);
	}

	// Strategy 3: Dispatch click event manually
	try {
		console.log(`[MODAL] Trying dispatched click event for ${description}...`);
		await handle.evaluate((el: Element) => {
			const event = new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				view: window,
			});
			el.dispatchEvent(event);
		});
		await sleep(2000);

		const modalOpened = await page
			.$('div[role="dialog"]')
			.then((el) => el !== null);
		if (modalOpened) {
			console.log(`[MODAL] Dispatched click worked for ${description}`);
			return true;
		}
	} catch (e) {
		console.log(`[MODAL] Dispatched click failed: ${e}`);
	}

	return false;
}

/**
 * Open the "Following" modal for a profile.
 * Uses ghost-cursor for human-like clicking with fallbacks.
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

	// Strategy 1: Try each selector with ghost-cursor click
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

				console.log(`[MODAL] Found element - href: ${href}, text: ${text.trim()}`);

				// Skip if it's a followers link
				if (href?.includes("/followers") || text.toLowerCase().includes("followers")) {
					console.log(`[MODAL] Skipping - this is a followers link`);
					continue;
				}

				// Try clicking with fallback strategies
				const success = await clickWithFallback(page, handle, `following link (${sel})`);
				if (success) {
					// Verify modal has content
					await sleep(1000);
					const hasContent = await page.$('div[role="dialog"] a[href^="/"]');
					if (hasContent) {
						console.log("[MODAL] Modal opened with content!");
						return true;
					}
					console.log("[MODAL] Modal opened but no content yet, waiting...");
					await sleep(2000);
					return true;
				}
			}
		} catch (e) {
			console.log(`[MODAL] Selector ${sel} failed: ${e}`);
		}
	}

	// Strategy 2: Find by evaluating page content
	console.log("[MODAL] Trying page.evaluate to find following link...");
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
					// Get bounding rect for clicking
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
			console.log(`[MODAL] Clicking at coordinates: (${linkInfo.x}, ${linkInfo.y})`);

			// Click at the coordinates using ghost-cursor approach
			const { createCursor } = await import("ghost-cursor");
			const cursor = createCursor(page);

			await cursor.moveTo({ x: linkInfo.x, y: linkInfo.y });
			await sleep(100 + Math.random() * 200);
			await page.mouse.down();
			await sleep(50 + Math.random() * 50);
			await page.mouse.up();

			await sleep(3000);

			const modalOpened = await page
				.$('div[role="dialog"]')
				.then((el) => el !== null);
			if (modalOpened) {
				console.log("[MODAL] Modal opened via coordinate click!");
				return true;
			}

			// Fallback: direct click via evaluate
			console.log("[MODAL] Coordinate click didn't work, trying direct click...");
			await page.evaluate(() => {
				const links = Array.from(document.querySelectorAll("a"));
				for (const link of links) {
					const href = link.getAttribute("href") || "";
					if (href.includes("/following") && !href.includes("/followers")) {
						(link as HTMLElement).click();
						return;
					}
				}
			});

			await sleep(3000);
			const modalOpenedFallback = await page
				.$('div[role="dialog"]')
				.then((el) => el !== null);
			if (modalOpenedFallback) {
				console.log("[MODAL] Modal opened via direct evaluate click!");
				return true;
			}
		}
	} catch (e) {
		console.log(`[MODAL] Evaluate strategy failed: ${e}`);
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

	console.log(`[MODAL] Extracted ${usernames.length} usernames: ${usernames.join(", ")}`);
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
			const scrollable = dialog.querySelector('div[style*="overflow"]') ||
				dialog.querySelector('ul')?.parentElement ||
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
