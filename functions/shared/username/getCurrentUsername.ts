/**
 * Get the current logged-in Instagram username from the page
 */
import type { Page } from "puppeteer";

/**
 * Extract the current logged-in username from the page
 * Tries multiple methods:
 * 1. Profile link in navigation
 * 2. URL when on own profile
 * 3. Profile picture link
 */
export async function getCurrentUsername(page: Page): Promise<string | null> {
	try {
		// Method 1: Try to find profile link in navigation
		const profileLink = await page.evaluate(() => {
			// Look for profile link in navigation
			const links = Array.from(document.querySelectorAll("a[href*='/']"));
			for (const link of links) {
				const href = link.getAttribute("href");
				if (href && href.match(/^\/[^/]+\/$/)) {
					// Profile links are typically /username/
					const match = href.match(/^\/([^/]+)\/$/);
					if (
						match &&
						match[1] &&
						match[1] !== "explore" &&
						match[1] !== "direct" &&
						match[1] !== "accounts"
					) {
						return match[1];
					}
				}
			}
			return null;
		});

		if (profileLink) {
			return profileLink.toLowerCase();
		}

		// Method 2: Check if we're on a profile page and it's likely our own
		const currentUrl = page.url();
		const urlMatch = currentUrl.match(/instagram\.com\/([^/?]+)/);
		if (urlMatch) {
			const username = urlMatch[1];
			// If we're on a profile page and there's no "following" or other indicators,
			// it might be our own profile
			if (
				!currentUrl.includes("/following") &&
				!currentUrl.includes("/followers") &&
				!currentUrl.includes("/tagged")
			) {
				// Check if there's a profile link that matches
				const hasMatchingProfileLink = await page.evaluate((uname) => {
					const links = Array.from(
						document.querySelectorAll(`a[href="/${uname}/"]`),
					);
					return links.length > 0;
				}, username);

				if (hasMatchingProfileLink) {
					return username.toLowerCase();
				}
			}
		}

		// Method 3: Try to get from profile picture link
		const profilePicLink = await page.evaluate(() => {
			const profilePic = document.querySelector(
				'img[alt*="profile picture"], img[alt*="Profile picture"]',
			);
			if (profilePic) {
				const parent = profilePic.closest("a");
				if (parent) {
					const href = parent.getAttribute("href");
					if (href) {
						const match = href.match(/^\/([^/]+)\/$/);
						if (match && match[1]) {
							return match[1];
						}
					}
				}
			}
			return null;
		});

		if (profilePicLink) {
			return profilePicLink.toLowerCase();
		}

		return null;
	} catch (error) {
		console.warn("Failed to get current username:", error);
		return null;
	}
}
