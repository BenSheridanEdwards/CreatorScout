import type { ElementHandle, Page } from "puppeteer";
import {
	humanClick,
	humanClickAt,
} from "../../navigation/humanInteraction/humanInteraction.ts";
import { shortDelay } from "../../timing/humanize/humanize.ts";
import {
	BLACKLISTED_DOMAINS,
	decodeInstagramRedirect,
} from "../linkExtraction/linkExtraction.ts";

/**
 * Get the bio link URL from the profile page (without clicking).
 */
export async function getLinkFromBio(page: Page): Promise<string | null> {
	const linkSelectors = [
		// Direct creator links
		'header a[href*="patreon.com"]',
		// Aggregator links
		'header a[href*="linktr.ee"]',
		'header a[href*="link.me"]',
		'header a[href*="beacons.ai"]',
		'header a[href*="allmylinks"]',
		'header a[href*="linkin.bio"]',
		'header a[href*="bio.link"]',
		'header a[href*="stan.store"]',
		'header a[href*="fanhouse"]',
		'header a[href*="juicy.bio"]',
		'header a[href*="hoo.be"]',
		// General external links
		'header a[rel*="nofollow"]',
		'header a[target="_blank"]',
		'header a[href^="http"]',
	];
	for (const sel of linkSelectors) {
		const el = await page.$(sel);
		if (el) {
			const href = await el.evaluate((node) => node.getAttribute("href"));
			if (href) return href;
		}
	}
	return null;
}

/**
 * Find the clickable bio link element on the profile page.
 */
export async function findBioLinkElement(
	page: Page,
): Promise<ElementHandle | null> {
	// Bio links are typically in the profile section (not header)
	// Look for links with external URL patterns
	const selectors = [
		// Links in the bio section with external URLs
		'section a[href*="l.instagram.com"]',
		'section a[href*="linktr.ee"]',
		'section a[href*="link.me"]',
		'section a[href*="beacons.ai"]',
		'section a[href*="allmylinks"]',
		'section a[href*="linkin.bio"]',
		'section a[href*="bio.link"]',
		'section a[href*="stan.store"]',
		'section a[href*="fanhouse"]',
		'section a[href*="patreon.com"]',
		// Generic external links in section
		'section a[rel*="nofollow"][target="_blank"]',
		// Header fallback
		'header a[href*="l.instagram.com"]',
		'header a[rel*="nofollow"][target="_blank"]',
	];

	for (const sel of selectors) {
		try {
			const el = await page.$(sel);
			if (el) {
				const href = await el.evaluate((node) => node.getAttribute("href"));
				// Skip internal Instagram links
				if (
					href &&
					!href.includes("/accounts/") &&
					!href.includes("/explore/")
				) {
					console.log(`[BIO_LINK] Found bio link with selector: ${sel}`);
					console.log(`[BIO_LINK] Link href: ${href}`);
					return el;
				}
			}
		} catch {
			// Continue trying other selectors
		}
	}

	// Fallback: find by evaluating the page
	try {
		const linkInfo = await page.evaluate(() => {
			// Look for the link icon SVG and get nearby link
			const linkIcon = document.querySelector('svg[aria-label="Link icon"]');
			if (linkIcon) {
				// Find the parent container and look for anchor
				let parent = linkIcon.parentElement;
				for (let i = 0; i < 5; i++) {
					if (!parent) break;
					const link = parent.querySelector("a");
					if (link?.getAttribute("href")) {
						return {
							found: true,
							selector: "link_icon_sibling",
						};
					}
					parent = parent.parentElement;
				}
			}
			return { found: false };
		});

		if (linkInfo.found) {
			// Re-query to get the element handle
			const linkIcon = await page.$('svg[aria-label="Link icon"]');
			if (linkIcon) {
				// Navigate up to find the link
				const linkHandle = await page.evaluateHandle((icon) => {
					let parent = icon.parentElement;
					for (let i = 0; i < 5; i++) {
						if (!parent) return null;
						const link = parent.querySelector("a");
						if (link?.getAttribute("href")) {
							return link;
						}
						parent = parent.parentElement;
					}
					return null;
				}, linkIcon);

				const element = linkHandle.asElement() as ElementHandle<Element> | null;
				if (element) {
					console.log("[BIO_LINK] Found bio link via link icon");
					return element;
				}
			}
		}
	} catch (e) {
		console.log(`[BIO_LINK] Fallback search failed: ${e}`);
	}

	console.log("[BIO_LINK] No bio link found on page");
	return null;
}

/**
 * Click the bio link on the profile page like a user would.
 * Uses ghost-cursor for human-like clicking.
 * Returns the URL we ended up on after clicking (handles Instagram redirects).
 */
export async function clickBioLink(page: Page): Promise<{
	success: boolean;
	finalUrl: string | null;
	error?: string;
}> {
	console.log("[BIO_LINK] Attempting to click bio link...");

	const linkElement = await findBioLinkElement(page);
	if (!linkElement) {
		return {
			success: false,
			finalUrl: null,
			error: "No bio link found on page",
		};
	}

	// Get the original URL before clicking
	const originalUrl = page.url();
	const linkHref = await linkElement.evaluate((el) => el.getAttribute("href"));
	console.log(`[BIO_LINK] Found link href: ${linkHref}`);

	// Check if the link is blacklisted BEFORE clicking
	// Decode Instagram redirects first to check the actual destination
	if (linkHref) {
		// Decode Instagram redirect if present (l.instagram.com/?u=...)
		const actualDestination = linkHref.includes("l.instagram.com/?u=")
			? decodeInstagramRedirect(linkHref) || linkHref
			: linkHref;

		const destinationLower = actualDestination.toLowerCase();
		const isBlacklisted = BLACKLISTED_DOMAINS.some((domain) =>
			destinationLower.includes(domain),
		);

		if (isBlacklisted) {
			console.log(
				`[BIO_LINK] ⛔ Skipping blacklisted domain: ${actualDestination}`,
			);
			return {
				success: false,
				finalUrl: actualDestination,
				error: `Blacklisted domain detected: ${actualDestination}`,
			};
		}
	}

	try {
		// Click with ghost-cursor (human-like)
		console.log("[BIO_LINK] Clicking with ghost-cursor...");
		await humanClick(page, linkElement, { elementType: "link" });
		await shortDelay(1.5, 2.5);

		// Check if we navigated away (link might stay on same page or open in new tab)
		const currentUrl = page.url();
		if (currentUrl !== originalUrl && !currentUrl.includes("instagram.com")) {
			console.log(`[BIO_LINK] Navigated to: ${currentUrl}`);
			return { success: true, finalUrl: currentUrl };
		}

		// Check for new tab/window (links with target="_blank")
		const pages = await page.browser().pages();
		if (pages.length > 1) {
			// Find the new page (not the original, not about:blank, not devtools)
			const newPage = pages.find((p) => {
				if (p === page) return false;
				const url = p.url();
				return (
					url !== "about:blank" &&
					!url.startsWith("devtools://") &&
					!url.startsWith("chrome://") &&
					!url.startsWith("chrome-extension://") &&
					url.includes("http")
				);
			});

			if (newPage) {
				// Wait a moment for redirects to complete before getting URL
				await shortDelay(0.5, 1);
				const newUrl = newPage.url();
				console.log(`[BIO_LINK] Link opened in new tab: ${newUrl}`);

				// Close the new tab and navigate to the URL in main page
				await newPage.close();

				// Navigate to the external URL
				if (newUrl && !newUrl.includes("instagram.com")) {
					await page.goto(newUrl, {
						waitUntil: "networkidle2",
						timeout: 15000,
					});
					// Return the URL we navigated to, not page.url() which might differ due to redirects
					return { success: true, finalUrl: newUrl };
				}
			}
		}

		// If click didn't navigate, try clicking at coordinates
		console.log("[BIO_LINK] Trying coordinate-based click...");
		const box = await linkElement.boundingBox();
		if (box) {
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;

			await humanClickAt(page, x, y, { elementType: "link" });
			await shortDelay(1.5, 2.5);

			// Check again for navigation or new tab
			const afterClickUrl = page.url();
			if (
				afterClickUrl !== originalUrl &&
				!afterClickUrl.includes("instagram.com")
			) {
				console.log(
					`[BIO_LINK] Coordinate click navigated to: ${afterClickUrl}`,
				);
				return { success: true, finalUrl: afterClickUrl };
			}

			// Check for new tabs again
			const pagesAfter = await page.browser().pages();
			const newTabAfter = pagesAfter.find((p) => {
				if (p === page) return false;
				const url = p.url();
				return (
					url !== "about:blank" &&
					!url.startsWith("devtools://") &&
					!url.startsWith("chrome://") &&
					!url.startsWith("chrome-extension://") &&
					url.includes("http")
				);
			});

			if (newTabAfter) {
				// Wait a moment for redirects to complete
				await shortDelay(0.5, 1);
				const tabUrl = newTabAfter.url();
				console.log(`[BIO_LINK] Coordinate click opened new tab: ${tabUrl}`);
				await newTabAfter.close();

				if (tabUrl && !tabUrl.includes("instagram.com")) {
					await page.goto(tabUrl, {
						waitUntil: "networkidle2",
						timeout: 15000,
					});
					// Return the URL we navigated to, not page.url() which might differ
					return { success: true, finalUrl: tabUrl };
				}
			}
		}

		// Last resort: extract URL and navigate (if all clicks failed)
		if (linkHref) {
			console.log("[BIO_LINK] Clicks didn't navigate, extracting URL...");

			// Decode Instagram redirect URL if needed
			let targetUrl = linkHref;
			if (linkHref.includes("l.instagram.com/?u=")) {
				try {
					const urlParam = new URL(linkHref).searchParams.get("u");
					if (urlParam) {
						targetUrl = decodeURIComponent(urlParam);
					}
				} catch {
					// Use original href
				}
			}

			console.log(`[BIO_LINK] Navigating to extracted URL: ${targetUrl}`);
			await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 15000 });
			const finalUrl = page.url();
			console.log(`[BIO_LINK] Navigated to: ${finalUrl}`);
			return { success: true, finalUrl };
		}

		return {
			success: false,
			finalUrl: null,
			error: "Click did not navigate to external page",
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.log(`[BIO_LINK] Error clicking bio link: ${errorMsg}`);
		return {
			success: false,
			finalUrl: null,
			error: errorMsg,
		};
	}
}
