/**
 * Random Profile Engagement Module
 *
 * Provides natural-looking engagement actions on profiles to break bot patterns.
 * Implements randomized behavior: view posts, watch reels, like content, scroll feed.
 *
 * Distribution:
 * - 20% No action (quick check and leave)
 * - 30% View a post (2-4 seconds)
 * - 20% Watch a reel (5-12 seconds)
 * - 15% Like a post (1-2 seconds)
 * - 15% Scroll feed (1-3 seconds)
 */

import type { Page } from "puppeteer";
import {
	humanClick,
	humanScroll,
} from "../../navigation/humanInteraction/humanInteraction.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { microDelay, shortDelay } from "../../timing/humanize/humanize.ts";

const logger = createLogger();

export interface EngagementAction {
	type: "none" | "view_post" | "watch_reel" | "like_post" | "scroll_feed";
	duration: number; // seconds
	success: boolean;
}

/**
 * Perform a random engagement action on a profile
 * Mimics natural user behavior when browsing profiles
 */
export async function performRandomEngagement(
	page: Page,
	username: string,
): Promise<EngagementAction> {
	const action = Math.random();

	try {
		if (action < 0.2) {
			// 20% - No action (quick check and leave)
			logger.debug("ENGAGEMENT", `@${username}: No engagement (quick check)`);
			await microDelay(0.5, 1);
			return { type: "none", duration: 0.5, success: true };
		}

		if (action < 0.5) {
			// 30% - View a post
			logger.debug("ENGAGEMENT", `@${username}: Viewing post`);
			return await viewRandomPost(page, username);
		}

		if (action < 0.7) {
			// 20% - Watch a reel
			logger.debug("ENGAGEMENT", `@${username}: Watching reel`);
			return await watchRandomReel(page, username);
		}

		if (action < 0.85) {
			// 15% - Like a post
			logger.debug("ENGAGEMENT", `@${username}: Liking post`);
			return await likeRandomPost(page, username);
		}

		// 15% - Scroll feed
		logger.debug("ENGAGEMENT", `@${username}: Scrolling feed`);
		return await scrollProfileFeed(page, username);
	} catch {
		logger.debug(
			"ENGAGEMENT",
			`@${username}: Engagement failed (natural timeout)`,
		);
		return { type: "none", duration: 1, success: false };
	}
}

/**
 * View a random post from the profile
 */
export async function viewRandomPost(
	page: Page,
	username: string,
): Promise<EngagementAction> {
	const startTime = Date.now();

	try {
		// Try to find a clickable post in the grid
		// Instagram profile posts are in a grid with links to /p/ or /reel/
		const postSelectors = [
			'a[href*="/p/"]', // Post links (most reliable)
			'a[href*="/reel/"]', // Reel links in grid
			'article a[href*="/p/"]', // Post links within article
		];

		for (const selector of postSelectors) {
			const posts = await page.$$(selector);
			if (posts.length > 0) {
				// Pick a random post from first 6 (visible grid)
				const postIndex = Math.floor(Math.random() * Math.min(posts.length, 6));
				const post = posts[postIndex];

				// Get URL before click to verify navigation
				const urlBefore = page.url();

				// Click to open post using element handle
				await humanClick(page, post, { elementType: "link" });

				// Wait for post modal to open (URL should change or modal should appear)
				try {
					await page.waitForFunction(
						(prevUrl: string) => {
							// Check if URL changed OR if modal appeared
							const urlChanged = window.location.href !== prevUrl;
							const modalVisible =
								document.querySelector('div[role="dialog"]') !== null ||
								document.querySelector('article[role="presentation"]') !== null;
							return urlChanged || modalVisible;
						},
						{ timeout: 3000 },
						urlBefore,
					);
				} catch {
					// Modal didn't open - click might have failed
					logger.debug(
						"ENGAGEMENT",
						`@${username}: Post click didn't open modal`,
					);
					return { type: "view_post", duration: 1, success: false };
				}

				// View for 2-4 seconds
				const viewDuration = 2 + Math.random() * 2;
				await new Promise((resolve) =>
					setTimeout(resolve, viewDuration * 1000),
				);

				// Close post (Escape key or go back)
				await page.keyboard.press("Escape");
				await microDelay(0.3, 0.8);

				const elapsed = (Date.now() - startTime) / 1000;
				logger.debug(
					"ENGAGEMENT",
					`@${username}: Viewed post for ${viewDuration.toFixed(1)}s`,
				);

				return { type: "view_post", duration: elapsed, success: true };
			}
		}

		// No posts found
		logger.debug("ENGAGEMENT", `@${username}: No posts found to view`);
		return { type: "none", duration: 0.5, success: false };
	} catch (err) {
		const elapsed = (Date.now() - startTime) / 1000;
		logger.debug("ENGAGEMENT", `@${username}: Post view error: ${err}`);
		return { type: "view_post", duration: elapsed, success: false };
	}
}

/**
 * Watch a random reel from the profile
 */
export async function watchRandomReel(
	page: Page,
	username: string,
): Promise<EngagementAction> {
	const startTime = Date.now();

	try {
		// First try: Click on a reel directly in the grid (most reliable)
		const reelLinks = await page.$$('a[href*="/reel/"]');
		if (reelLinks.length > 0) {
			// Pick a random reel from first 6 visible
			const reelIndex = Math.floor(
				Math.random() * Math.min(reelLinks.length, 6),
			);
			const reel = reelLinks[reelIndex];

			const urlBefore = page.url();

			// Click the reel
			await humanClick(page, reel, { elementType: "link" });

			// Wait for reel to load (URL should change to /reel/)
			try {
				await page.waitForFunction(
					() => window.location.href.includes("/reel/"),
					{ timeout: 3000 },
				);
			} catch {
				logger.debug("ENGAGEMENT", `@${username}: Reel click didn't navigate`);
				return { type: "watch_reel", duration: 1, success: false };
			}

			// Watch for 5-12 seconds (partial view is natural)
			const watchDuration = 5 + Math.random() * 7;
			await new Promise((resolve) => setTimeout(resolve, watchDuration * 1000));

			// Go back to profile
			await page.goBack();
			try {
				await page.waitForFunction(
					(prevUrl: string) =>
						!window.location.href.includes("/reel/") ||
						window.location.href === prevUrl,
					{ timeout: 5000 },
					urlBefore,
				);
			} catch {
				// Timeout—might be stuck, press Escape
				await page.keyboard.press("Escape");
			}
			await shortDelay(0.5, 1);

			const elapsed = (Date.now() - startTime) / 1000;
			logger.debug(
				"ENGAGEMENT",
				`@${username}: Watched reel for ${watchDuration.toFixed(1)}s`,
			);

			return { type: "watch_reel", duration: elapsed, success: true };
		}

		// Second try: Click the Reels tab if it exists
		const reelsTab = await page.$('a[href*="/reels/"]');
		if (reelsTab) {
			const urlBefore = page.url();

			await humanClick(page, reelsTab, { elementType: "link" });

			// Wait for reels tab to load
			try {
				await page.waitForFunction(
					() => window.location.href.includes("/reels/"),
					{ timeout: 3000 },
				);
			} catch {
				logger.debug(
					"ENGAGEMENT",
					`@${username}: Reels tab click didn't navigate`,
				);
				return { type: "watch_reel", duration: 1, success: false };
			}

			// Watch for 5-12 seconds
			const watchDuration = 5 + Math.random() * 7;
			await new Promise((resolve) => setTimeout(resolve, watchDuration * 1000));

			// Go back
			await page.goBack();
			try {
				await page.waitForFunction(
					(prevUrl: string) => window.location.href === prevUrl,
					{ timeout: 5000 },
					urlBefore,
				);
			} catch {
				await page.keyboard.press("Escape");
			}
			await shortDelay(0.5, 1);

			const elapsed = (Date.now() - startTime) / 1000;
			logger.debug(
				"ENGAGEMENT",
				`@${username}: Watched reels tab for ${watchDuration.toFixed(1)}s`,
			);

			return { type: "watch_reel", duration: elapsed, success: true };
		}

		// No reels found
		logger.debug("ENGAGEMENT", `@${username}: No reels found to watch`);
		return { type: "none", duration: 0.5, success: false };
	} catch (err) {
		const elapsed = (Date.now() - startTime) / 1000;
		logger.debug("ENGAGEMENT", `@${username}: Reel watch error: ${err}`);
		return { type: "watch_reel", duration: elapsed, success: false };
	}
}

/**
 * Like a random post from the profile
 */
export async function likeRandomPost(
	page: Page,
	username: string,
): Promise<EngagementAction> {
	const startTime = Date.now();

	try {
		// Find posts in the grid
		const posts = await page.$$('a[href*="/p/"]');
		if (posts.length === 0) {
			logger.debug("ENGAGEMENT", `@${username}: No posts found to like`);
			return { type: "none", duration: 0.5, success: false };
		}

		// Pick a random post from first 6 visible
		const postIndex = Math.floor(Math.random() * Math.min(posts.length, 6));
		const post = posts[postIndex];

		const urlBefore = page.url();

		// Click to open post
		await humanClick(page, post, { elementType: "link" });

		// Wait for post modal to open
		try {
			await page.waitForFunction(
				(prevUrl: string) => {
					const urlChanged = window.location.href !== prevUrl;
					const modalVisible =
						document.querySelector('div[role="dialog"]') !== null ||
						document.querySelector('article[role="presentation"]') !== null;
					return urlChanged || modalVisible;
				},
				{ timeout: 3000 },
				urlBefore,
			);
		} catch {
			logger.debug(
				"ENGAGEMENT",
				`@${username}: Post modal didn't open for like`,
			);
			return { type: "like_post", duration: 1, success: false };
		}

		await shortDelay(0.5, 1);

		// Find like button (heart icon) - try multiple selectors
		const likeSelectors = [
			'svg[aria-label="Like"]',
			'span[class*="Like"] svg',
			'div[role="button"] svg[aria-label="Like"]',
		];

		for (const selector of likeSelectors) {
			const likeButton = await page.$(selector);
			if (likeButton) {
				// Click like using element handle
				await humanClick(page, likeButton, { elementType: "button" });

				// Wait for like animation
				const likeDelay = 1500 + Math.random() * 500;
				await new Promise((resolve) => setTimeout(resolve, likeDelay));

				// Close post
				await page.keyboard.press("Escape");
				await microDelay(0.3, 0.8);

				const elapsed = (Date.now() - startTime) / 1000;
				logger.debug("ENGAGEMENT", `@${username}: Liked post`);

				return { type: "like_post", duration: elapsed, success: true };
			}
		}

		// Couldn't find like button, close post
		await page.keyboard.press("Escape");
		await microDelay(0.3, 0.8);

		logger.debug("ENGAGEMENT", `@${username}: Like button not found`);
		return { type: "none", duration: 1, success: false };
	} catch (err) {
		const elapsed = (Date.now() - startTime) / 1000;
		logger.debug("ENGAGEMENT", `@${username}: Like error: ${err}`);
		return { type: "like_post", duration: elapsed, success: false };
	}
}

/**
 * Decide whether to engage based on bio score
 * MORE CONSISTENT: Engage frequently on all profiles to avoid bot patterns
 * Slight bias towards higher scores to appear more interested in good content
 */
export function shouldEngageOnProfile(bioScore: number): boolean {
	if (bioScore < 20) {
		// Low score - still engage frequently (50% chance)
		return Math.random() < 0.5;
	}

	if (bioScore < 40) {
		// Medium score - engage most of the time (60% chance)
		return Math.random() < 0.6;
	}

	// High score - almost always engage (75% chance)
	return Math.random() < 0.75;
}

/**
 * Scroll through the profile feed naturally
 */
export async function scrollProfileFeed(
	page: Page,
	username: string,
): Promise<EngagementAction> {
	const startTime = Date.now();

	try {
		// Start from random offset—feels like "oh, they started lower down"
		const startOffset = Math.random() * 0.3; // 0-30% of viewport
		if (startOffset > 0.1) {
			const initialScroll = await page.evaluate(
				(offset: number) => window.innerHeight * offset,
				startOffset,
			);
			await humanScroll(page, { deltaY: initialScroll });
			await microDelay(0.2, 0.5);
		}

		// Random number of scrolls (1-3)
		const scrollCount = 1 + Math.floor(Math.random() * 3);
		let actualScrolls = 0;

		for (let i = 0; i < scrollCount; i++) {
			// Check height before scroll
			const heightBefore = await page.evaluate(() => window.scrollY);

			const scrollAmount = 200 + Math.random() * 300; // 200-500px
			await humanScroll(page, { deltaY: scrollAmount });

			// Pause between scrolls (natural reading time)
			await new Promise((resolve) =>
				setTimeout(resolve, 500 + Math.random() * 1000),
			);

			// Check if scroll actually moved (detect feed end)
			const heightAfter = await page.evaluate(() => window.scrollY);
			if (Math.abs(heightAfter - heightBefore) < 10) {
				// Feed ended—no point scrolling ghosts
				break;
			}
			actualScrolls++;
		}

		// Scroll back up a bit (more natural behavior)
		if (Math.random() > 0.5) {
			await humanScroll(page, { deltaY: -(100 + Math.random() * 150) });
			await microDelay(0.3, 0.8);
		}

		const elapsed = (Date.now() - startTime) / 1000;
		logger.debug(
			"ENGAGEMENT",
			`@${username}: Scrolled feed ${actualScrolls}x for ${elapsed.toFixed(1)}s`,
		);

		return { type: "scroll_feed", duration: elapsed, success: true };
	} catch {
		const elapsed = (Date.now() - startTime) / 1000;
		return { type: "scroll_feed", duration: elapsed, success: false };
	}
}

/**
 * Get engagement statistics for logging
 */
export function getEngagementStats(actions: EngagementAction[]): {
	total: number;
	none: number;
	viewPost: number;
	watchReel: number;
	likePost: number;
	scrollFeed: number;
	totalDuration: number;
} {
	return {
		total: actions.length,
		none: actions.filter((a) => a.type === "none").length,
		viewPost: actions.filter((a) => a.type === "view_post").length,
		watchReel: actions.filter((a) => a.type === "watch_reel").length,
		likePost: actions.filter((a) => a.type === "like_post").length,
		scrollFeed: actions.filter((a) => a.type === "scroll_feed").length,
		totalDuration: actions.reduce((sum, a) => sum + a.duration, 0),
	};
}
