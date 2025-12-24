/**
 * Efficient Engagement Ratio Tracker
 *
 * Tracks the ratio of engagement actions to outbound actions.
 * Uses a flexible 3:1 to 4:1 ratio for efficiency while staying safe.
 *
 * Strategy:
 * - Do 10-15 engagement actions quickly (scrolls, likes) → ~30-60 seconds
 * - Then do 3-5 outbound actions (follows) → ~15-25 seconds
 * - Repeat cycle (allows 50-100 actions per session)
 */
import type { Page } from "puppeteer";
import {
	mediumDelay,
	microDelay,
	shortDelay,
} from "../../timing/humanize/humanize.ts";
import {
	ENGAGEMENT_RATIO_MAX,
	ENGAGEMENT_RATIO_MIN,
} from "../config/config.ts";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

export type EngagementType = "scroll" | "like" | "view" | "reel";
export type OutboundType = "follow" | "dm";

export interface EngagementStats {
	scrolls: number;
	likes: number;
	views: number;
	reels: number;
	follows: number;
	dms: number;
	totalEngagement: number;
	totalOutbound: number;
	currentRatio: number;
}

/**
 * Tracks engagement and outbound actions to maintain a safe ratio
 */
export class EngagementTracker {
	private scrolls = 0;
	private likes = 0;
	private views = 0;
	private reels = 0;
	private follows = 0;
	private dms = 0;

	private minRatio: number;
	private maxRatio: number;

	constructor(
		minRatio: number = ENGAGEMENT_RATIO_MIN,
		maxRatio: number = ENGAGEMENT_RATIO_MAX,
	) {
		this.minRatio = minRatio;
		this.maxRatio = maxRatio;
	}

	/**
	 * Record an engagement action
	 */
	recordEngagement(type: EngagementType): void {
		switch (type) {
			case "scroll":
				this.scrolls++;
				break;
			case "like":
				this.likes++;
				break;
			case "view":
				this.views++;
				break;
			case "reel":
				this.reels++;
				break;
		}
	}

	/**
	 * Record an outbound action
	 */
	recordOutbound(type: OutboundType): void {
		switch (type) {
			case "follow":
				this.follows++;
				break;
			case "dm":
				this.dms++;
				break;
		}
	}

	/**
	 * Get total engagement actions
	 */
	getTotalEngagement(): number {
		return this.scrolls + this.likes + this.views + this.reels;
	}

	/**
	 * Get total outbound actions
	 */
	getTotalOutbound(): number {
		return this.follows + this.dms;
	}

	/**
	 * Get current engagement:outbound ratio
	 */
	getEngagementRatio(): number {
		const outbound = this.getTotalOutbound();
		if (outbound === 0) return Infinity;
		return this.getTotalEngagement() / outbound;
	}

	/**
	 * Check if we can perform an outbound action
	 * Returns true if ratio >= minRatio (3:1 default)
	 */
	canPerformOutbound(): boolean {
		const outbound = this.getTotalOutbound();

		// Always allow first outbound action if we have some engagement
		if (outbound === 0) {
			return this.getTotalEngagement() >= this.minRatio;
		}

		return this.getEngagementRatio() >= this.minRatio;
	}

	/**
	 * Get how many engagement actions needed before next outbound
	 */
	getRequiredEngagements(): number {
		const outbound = this.getTotalOutbound() + 1; // Next outbound
		const needed = outbound * this.minRatio;
		return Math.max(0, needed - this.getTotalEngagement());
	}

	/**
	 * Get all statistics
	 */
	getStats(): EngagementStats {
		return {
			scrolls: this.scrolls,
			likes: this.likes,
			views: this.views,
			reels: this.reels,
			follows: this.follows,
			dms: this.dms,
			totalEngagement: this.getTotalEngagement(),
			totalOutbound: this.getTotalOutbound(),
			currentRatio: this.getEngagementRatio(),
		};
	}

	/**
	 * Reset counters
	 */
	reset(): void {
		this.scrolls = 0;
		this.likes = 0;
		this.views = 0;
		this.reels = 0;
		this.follows = 0;
		this.dms = 0;
	}

	/**
	 * Log current status
	 */
	logStatus(): void {
		const stats = this.getStats();
		const ratio =
			stats.currentRatio === Infinity ? "∞" : stats.currentRatio.toFixed(1);
		logger.info(
			"ENGAGEMENT",
			`Ratio: ${ratio}:1 (E:${stats.totalEngagement} O:${stats.totalOutbound}) | Scrolls: ${stats.scrolls}, Likes: ${stats.likes}, Follows: ${stats.follows}, DMs: ${stats.dms}`,
		);
	}
}

/**
 * Perform a batch of quick engagement actions
 *
 * @param page - Puppeteer page instance
 * @param tracker - Engagement tracker instance
 * @param count - Number of engagement actions (default 10-15)
 * @returns Number of actions performed
 */
export async function batchEngagements(
	page: Page,
	tracker: EngagementTracker,
	count: number = 10 + Math.floor(Math.random() * 6),
): Promise<number> {
	let performed = 0;

	logger.info("ENGAGEMENT", `Performing ${count} quick engagement actions...`);

	for (let i = 0; i < count; i++) {
		const actionType = Math.random();

		try {
			if (actionType < 0.6) {
				// 60% scrolls (quickest)
				const distance = 300 + Math.floor(Math.random() * 500);
				await page.evaluate((d) => window.scrollBy(0, d), distance);
				tracker.recordEngagement("scroll");
				await microDelay(0.5, 1.5);
			} else if (actionType < 0.9) {
				// 30% likes
				const liked = await tryLikePost(page);
				if (liked) {
					tracker.recordEngagement("like");
				} else {
					// Fall back to scroll
					await page.evaluate(() => window.scrollBy(0, 400));
					tracker.recordEngagement("scroll");
				}
				await microDelay(0.5, 1.5);
			} else {
				// 10% view stories/reels
				tracker.recordEngagement("view");
				await mediumDelay(3, 6);
			}

			performed++;
		} catch (error) {
			// Continue on error
		}
	}

	logger.info("ENGAGEMENT", `Completed ${performed} engagement actions`);
	return performed;
}

/**
 * Try to like a visible post
 */
async function tryLikePost(page: Page): Promise<boolean> {
	try {
		const likeButton = await page.$(
			'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill])',
		);

		if (likeButton) {
			await likeButton.click();
			return true;
		}
	} catch {
		// Ignore errors
	}

	return false;
}

/**
 * Create a global engagement tracker for the session
 */
let globalTracker: EngagementTracker | null = null;

export function getGlobalEngagementTracker(): EngagementTracker {
	if (!globalTracker) {
		globalTracker = new EngagementTracker();
	}
	return globalTracker;
}

export function resetGlobalEngagementTracker(): void {
	globalTracker = null;
}


