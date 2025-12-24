import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";
import { humanLikeClickHandle } from "../../navigation/humanClick/humanClick.ts";

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
				if (href && !href.includes("/accounts/") && !href.includes("/explore/")) {
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
					if (link && link.getAttribute("href")) {
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
						if (link && link.getAttribute("href")) {
							return link;
						}
						parent = parent.parentElement;
					}
					return null;
				}, linkIcon);

				const element = linkHandle.asElement();
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

	try {
		// Strategy 1: Ghost cursor click (most human-like)
		try {
			console.log("[BIO_LINK] Trying ghost-cursor click...");
			await humanLikeClickHandle(page, linkElement, { elementType: "link" });
			await sleep(3000);

			// Check if we navigated away (link might open in new tab)
			const currentUrl = page.url();
			if (currentUrl !== originalUrl && !currentUrl.includes("instagram.com")) {
				console.log(`[BIO_LINK] Ghost-cursor click worked, now at: ${currentUrl}`);
				return { success: true, finalUrl: currentUrl };
			}
		} catch (e) {
			console.log(`[BIO_LINK] Ghost-cursor click failed: ${e}`);
		}

		// Strategy 2: Direct element click
		try {
			console.log("[BIO_LINK] Trying direct element click...");
			await linkElement.evaluate((el) => {
				(el as HTMLElement).scrollIntoView({ block: "center" });
			});
			await sleep(500);
			await linkElement.click({ delay: 100 + Math.random() * 100 });
			await sleep(3000);

			const currentUrl = page.url();
			if (currentUrl !== originalUrl && !currentUrl.includes("instagram.com")) {
				console.log(`[BIO_LINK] Direct click worked, now at: ${currentUrl}`);
				return { success: true, finalUrl: currentUrl };
			}
		} catch (e) {
			console.log(`[BIO_LINK] Direct click failed: ${e}`);
		}

		// Strategy 3: Check for new tab/window (links with target="_blank")
		// If the click opened a new tab, we need to switch to it
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
				const newUrl = newPage.url();
				console.log(`[BIO_LINK] Link opened in new tab: ${newUrl}`);

				// Close the new tab and navigate to the URL in main page
				await newPage.close();

				// Navigate to the external URL
				if (newUrl && !newUrl.includes("instagram.com")) {
					await page.goto(newUrl, { waitUntil: "networkidle2", timeout: 15000 });
					return { success: true, finalUrl: page.url() };
				}
			}
		}

		// Strategy 4: Extract URL and navigate directly (last resort)
		if (linkHref) {
			console.log("[BIO_LINK] Fallback: navigating directly to href...");

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

			await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 15000 });
			const finalUrl = page.url();
			console.log(`[BIO_LINK] Navigated to: ${finalUrl}`);
			return { success: true, finalUrl };
		}

		return {
			success: false,
			finalUrl: null,
			error: "Could not click or navigate to bio link",
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
