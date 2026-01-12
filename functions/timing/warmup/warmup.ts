/**
 * Efficient Warm-up Module
 *
 * Quick 1-2 minute warm-up before starting outbound actions.
 * Makes the session look natural without wasting time.
 * Uses ghost-cursor for human-like interactions.
 *
 * When an EngagementTracker is provided, warm-up actions count toward
 * the engagement ratio, eliminating the need for a separate initial
 * engagement batch.
 */
import type { Page } from "puppeteer";
import {
	humanClick,
	humanScroll,
} from "../../navigation/humanInteraction/humanInteraction.ts";
import { WARMUP_DURATION_MINUTES } from "../../shared/config/config.ts";
import type { EngagementTracker } from "../../shared/engagement/engagementTracker.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { mediumDelay, microDelay, shortDelay } from "../humanize/humanize.ts";

const logger = createLogger();

export interface WarmupStats {
	scrolls: number;
	likes: number;
	reelsWatched: number;
	durationSeconds: number;
}

/**
 * Quick warm-up routine before starting outbound actions
 *
 * Flow:
 * 1. Scroll feed 2-3 times (1-2s pauses)
 * 2. Watch 2-3 reels (3-8s each)
 * 3. Like 2-3 posts (micro-delays)
 * 4. Total time: ~1-2 minutes
 *
 * @param page - Puppeteer page instance
 * @param durationMinutes - Target warm-up duration (default 1.5 min)
 * @param tracker - Optional engagement tracker to record actions (eliminates need for separate initial engagement)
 * @returns Warm-up statistics
 */
export async function warmUpProfile(
	page: Page,
	durationMinutes: number = WARMUP_DURATION_MINUTES,
	tracker?: EngagementTracker,
): Promise<WarmupStats> {
	const startTime = Date.now();
	const targetDuration = durationMinutes * 60 * 1000;

	const stats: WarmupStats = {
		scrolls: 0,
		likes: 0,
		reelsWatched: 0,
		durationSeconds: 0,
	};

	logger.info("WARMUP", `Starting ${durationMinutes} minute warm-up...`);

	try {
		// Ensure we're on the home feed
		const currentUrl = page.url();
		if (!currentUrl.includes("instagram.com")) {
			await page.goto("https://www.instagram.com/", {
				waitUntil: "networkidle0",
				timeout: 15000,
			});
			await shortDelay(1, 2);
		}

		// Quick scroll sequence
		stats.scrolls = await quickScrollFeed(page, tracker);

		// Check if we still have time
		if (Date.now() - startTime < targetDuration * 0.6) {
			// Try to like some posts
			stats.likes = await likeVisiblePosts(page, 2, tracker);
		}

		// Watch reels if we have time
		if (Date.now() - startTime < targetDuration * 0.8) {
			stats.reelsWatched = await watchReels(page, 2, tracker);
		}

		// Final scroll
		if (Date.now() - startTime < targetDuration) {
			await humanScroll(page);
			stats.scrolls++;
			tracker?.recordEngagement("scroll");
		}
	} catch (error) {
		logger.warn(
			"WARMUP",
			`Warm-up interrupted: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	stats.durationSeconds = Math.floor((Date.now() - startTime) / 1000);

	logger.info(
		"WARMUP",
		`Warm-up complete: ${stats.scrolls} scrolls, ${stats.likes} likes, ${stats.reelsWatched} reels (${stats.durationSeconds}s)`,
	);

	return stats;
}

/**
 * Quick scroll through the feed
 */
async function quickScrollFeed(
	page: Page,
	tracker?: EngagementTracker,
): Promise<number> {
	let scrolls = 0;
	const scrollCount = 2 + Math.floor(Math.random() * 2); // 2-3 scrolls

	for (let i = 0; i < scrollCount; i++) {
		// Random scroll distance
		const distance = 300 + Math.floor(Math.random() * 700); // 300-1000px

		await humanScroll(page, { deltaY: distance });
		scrolls++;
		tracker?.recordEngagement("scroll");

		// Short pause
		await shortDelay(1, 2);
	}

	return scrolls;
}

/**
 * Like visible posts in the feed using human-like clicking
 */
async function likeVisiblePosts(
	page: Page,
	maxLikes: number,
	tracker?: EngagementTracker,
): Promise<number> {
	let liked = 0;

	try {
		// Find like buttons (heart icons that aren't already filled)
		const likeButtons = await page.$$(
			'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill])',
		);

		for (const button of likeButtons.slice(0, maxLikes)) {
			try {
				// Click the button with human-like behavior
				await humanClick(page, button, { elementType: "button" });
				liked++;
				tracker?.recordEngagement("like");

				// Quick delay between likes
				await microDelay(0.5, 1.5);
			} catch {
				// Button may have become stale, continue
			}
		}
	} catch {
		logger.warn("WARMUP", "Could not like posts during warm-up");
	}

	return liked;
}

/**
 * Watch a few reels
 */
async function watchReels(
	page: Page,
	count: number,
	tracker?: EngagementTracker,
): Promise<number> {
	let watched = 0;

	try {
		// Try to find and click on Reels link with human-like behavior
		const reelsLink = await page.$('a[href="/reels/"]');
		if (!reelsLink) {
			return 0;
		}

		await humanClick(page, reelsLink, { elementType: "link" });
		await shortDelay(1, 2);

		// Watch a couple reels
		for (let i = 0; i < count; i++) {
			// Watch for 3-8 seconds
			await mediumDelay(3, 8);
			watched++;
			tracker?.recordEngagement("reel");

			// Scroll to next reel
			await page.keyboard.press("ArrowDown");
			await microDelay(0.5, 1);
		}

		// Go back to feed
		await page.goBack();
		await shortDelay(1, 2);
	} catch {
		logger.warn("WARMUP", "Could not watch reels during warm-up");
	}

	return watched;
}

/**
 * Minimal warm-up - just a few scrolls
 * Use when time is very limited
 */
export async function minimalWarmup(page: Page): Promise<void> {
	logger.info("WARMUP", "Minimal warm-up (30s)...");

	// Just scroll the feed a couple times
	await humanScroll(page);
	await shortDelay(0.5, 1);
	await humanScroll(page);
	await shortDelay(1, 2);

	logger.info("WARMUP", "Minimal warm-up complete");
}

/**
 * Check if warm-up is needed
 * Returns false if the session was recently active
 */
export function needsWarmup(lastActivityTime?: Date): boolean {
	if (!lastActivityTime) return true;

	// If last activity was within 5 minutes, skip warm-up
	const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
	return lastActivityTime.getTime() < fiveMinutesAgo;
}
