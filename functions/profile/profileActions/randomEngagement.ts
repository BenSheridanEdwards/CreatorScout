/**
 * Random Profile Engagement Module
 *
 * Provides natural-looking engagement actions on profiles to break bot patterns.
 * Implements randomized behavior: view posts, watch reels, like content.
 *
 * Distribution:
 * - 40% No action (quick check and leave)
 * - 30% View a post (2-4 seconds)
 * - 20% Watch a reel (5-12 seconds)
 * - 10% Like a post (1-2 seconds)
 */

import type { Page } from "puppeteer";
import { humanClickElement } from "../../../timing/humanize/humanize.ts";
import {
	mediumDelay,
	microDelay,
	shortDelay,
} from "../../../timing/humanize/humanize.ts";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

export interface EngagementAction {
	type: "none" | "view_post" | "watch_reel" | "like_post";
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
		if (action < 0.4) {
			// 40% - No action (quick check and leave)
			logger.debug("ENGAGEMENT", `@${username}: No engagement (quick check)`);
			await microDelay(0.5, 1);
			return { type: "none", duration: 0.5, success: true };
		}

		if (action < 0.7) {
			// 30% - View a post
			logger.debug("ENGAGEMENT", `@${username}: Viewing post`);
			return await viewRandomPost(page, username);
		}

		if (action < 0.9) {
			// 20% - Watch a reel
			logger.debug("ENGAGEMENT", `@${username}: Watching reel`);
			return await watchRandomReel(page, username);
		}

		// 10% - Like a post
		logger.debug("ENGAGEMENT", `@${username}: Liking post`);
		return await likeRandomPost(page, username);
	} catch (error) {
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
		// Try to find first post image or video
		const postSelectors = [
			'article a[href*="/p/"]', // Post links
			"article img", // Post images
			'div[role="button"] img', // Grid images
		];

		for (const selector of postSelectors) {
			const post = await page.$(selector);
			if (post) {
				// Click to open post
				await humanClickElement(page, selector);
				await shortDelay(0.5, 1);

				// View for 2-4 seconds
				const viewDuration = 2 + Math.random() * 2;
				await new Promise((resolve) =>
					setTimeout(resolve, viewDuration * 1000),
				);

				// Close post (Escape key)
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
		return { type: "none", duration: 0.5, success: false };
	} catch (error) {
		const elapsed = (Date.now() - startTime) / 1000;
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
		// Try to find reels tab or reel content
		const reelSelectors = [
			'a[href*="/reels/"]', // Reels tab
			'svg[aria-label*="Reel"]', // Reel icon
			'a[href*="' + username + '"] svg[aria-label="Reel"]', // Profile reel icon
		];

		for (const selector of reelSelectors) {
			const reelElement = await page.$(selector);
			if (reelElement) {
				// Click reels tab or reel
				await humanClickElement(page, selector);
				await shortDelay(1, 2);

				// Watch for 5-12 seconds (partial view is natural)
				const watchDuration = 5 + Math.random() * 7;
				await new Promise((resolve) =>
					setTimeout(resolve, watchDuration * 1000),
				);

				// Go back to profile
				await page.goBack();
				await shortDelay(0.5, 1);

				const elapsed = (Date.now() - startTime) / 1000;
				logger.debug(
					"ENGAGEMENT",
					`@${username}: Watched reel for ${watchDuration.toFixed(1)}s`,
				);

				return { type: "watch_reel", duration: elapsed, success: true };
			}
		}

		// No reels found - try clicking first reel in grid
		const gridReel = await page.$('a[href*="/reel/"]');
		if (gridReel) {
			await humanClickElement(page, 'a[href*="/reel/"]');
			await shortDelay(1, 2);

			const watchDuration = 5 + Math.random() * 7;
			await new Promise((resolve) => setTimeout(resolve, watchDuration * 1000));

			await page.goBack();
			await shortDelay(0.5, 1);

			const elapsed = (Date.now() - startTime) / 1000;
			return { type: "watch_reel", duration: elapsed, success: true };
		}

		// No reels found
		return { type: "none", duration: 0.5, success: false };
	} catch (error) {
		const elapsed = (Date.now() - startTime) / 1000;
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
		// First, open a post
		const post = await page.$('article a[href*="/p/"]');
		if (!post) {
			return { type: "none", duration: 0.5, success: false };
		}

		// Click to open post
		await humanClickElement(page, 'article a[href*="/p/"]');
		await shortDelay(0.5, 1);

		// Find like button (heart icon)
		const likeSelectors = [
			'svg[aria-label="Like"]',
			'button svg[aria-label="Like"]',
			'span[role="button"] svg[aria-label="Like"]',
		];

		for (const selector of likeSelectors) {
			const likeButton = await page.$(selector);
			if (likeButton) {
				// Click like
				await humanClickElement(page, selector);
				await microDelay(0.5, 1);

				// Brief pause to see the like animation
				await new Promise((resolve) => setTimeout(resolve, 1000));

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

		return { type: "none", duration: 1, success: false };
	} catch (error) {
		const elapsed = (Date.now() - startTime) / 1000;
		return { type: "like_post", duration: elapsed, success: false };
	}
}

/**
 * Decide whether to engage based on bio score
 * Higher scores = more likely to engage
 */
export function shouldEngageOnProfile(bioScore: number): boolean {
	if (bioScore < 20) {
		// Low score - rarely engage (10% chance)
		return Math.random() < 0.1;
	}

	if (bioScore < 40) {
		// Medium score - sometimes engage (40% chance)
		return Math.random() < 0.4;
	}

	// High score - usually engage (70% chance)
	return Math.random() < 0.7;
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
	totalDuration: number;
} {
	return {
		total: actions.length,
		none: actions.filter((a) => a.type === "none").length,
		viewPost: actions.filter((a) => a.type === "view_post").length,
		watchReel: actions.filter((a) => a.type === "watch_reel").length,
		likePost: actions.filter((a) => a.type === "like_post").length,
		totalDuration: actions.reduce((sum, a) => sum + a.duration, 0),
	};
}
