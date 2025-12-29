/**
 * Natural Scrolling Script
 *
 * Mimics real user behavior by scrolling through Instagram feed naturally.
 * Features:
 * - Variable scroll distances and speeds
 * - Natural pauses (reading time)
 * - Occasional scroll back (like humans do)
 * - Random mouse movements
 * - Optional engagement (likes, reel watching)
 * - Duration-based sessions (5-15 minutes)
 *
 * Usage:
 *   npm run scroll -- --profile burner1 --duration 10
 *   npm run scroll -- --profile burner1 --duration 5 --no-engagement
 */

import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	microDelay,
	shortDelay,
	mediumDelay,
	mouseWiggle,
} from "../functions/timing/humanize/humanize.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { createRun } from "../functions/shared/runs/runs.ts";
import { humanLikeClickHandle } from "../functions/navigation/humanClick/humanClick.ts";

const logger = createLogger();

interface ScrollArgs {
	profileId: string;
	durationMinutes?: number;
	noEngagement?: boolean;
	dryRun?: boolean;
}

function parseArgs(): ScrollArgs {
	const args = process.argv.slice(2);
	let profileId = "";
	let durationMinutes = 10; // Default 10 minutes
	let noEngagement = false;
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--profile" && args[i + 1]) {
			profileId = args[i + 1];
		}
		if (args[i] === "--duration" && args[i + 1]) {
			durationMinutes = parseInt(args[i + 1], 10) || 10;
		}
		if (args[i] === "--no-engagement") {
			noEngagement = true;
		}
		if (args[i] === "--dry-run") {
			dryRun = true;
		}
	}

	if (!profileId) {
		throw new Error("Missing required argument: --profile");
	}

	// Clamp duration between 5 and 30 minutes
	durationMinutes = Math.max(5, Math.min(30, durationMinutes));

	return { profileId, durationMinutes, noEngagement, dryRun };
}

/**
 * Natural scroll with variable distance and speed
 */
async function naturalScroll(
	page: Page,
	options: {
		minDistance?: number;
		maxDistance?: number;
		smooth?: boolean;
	} = {},
): Promise<void> {
	const { minDistance = 200, maxDistance = 800, smooth = true } = options;

	// Variable scroll distance (humans don't scroll the same amount each time)
	const distance = minDistance + Math.random() * (maxDistance - minDistance);

	if (smooth) {
		// Smooth scroll using multiple small steps (more natural)
		const steps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
		const stepDistance = distance / steps;

		for (let i = 0; i < steps; i++) {
			await page.evaluate((d) => {
				window.scrollBy({
					top: d,
					behavior: "smooth",
				});
			}, stepDistance);

			// Small pause between steps
			await microDelay(0.1, 0.3);
		}
	} else {
		// Instant scroll (less common but still natural)
		await page.evaluate((d) => {
			window.scrollBy(0, d);
		}, distance);
	}
}

/**
 * Scroll back up a bit (humans do this when they want to re-read something)
 */
async function scrollBackUp(page: Page): Promise<void> {
	// Small scroll back (50-200px)
	const backDistance = 50 + Math.random() * 150;
	await page.evaluate((d) => {
		window.scrollBy({
			top: -d,
			behavior: "smooth",
		});
	}, backDistance);
	await microDelay(0.5, 1.5);
}

/**
 * Check if a post is a sponsored post/ad
 */
async function isSponsoredPost(button: any): Promise<boolean> {
	try {
		const isSponsored = await button.evaluate((el: Element) => {
			let postContainer =
				el.closest("article") || el.closest('[role="article"]');
			if (!postContainer) {
				let parent = el.parentElement;
				for (let i = 0; i < 5 && parent; i++) {
					if (
						parent.tagName === "ARTICLE" ||
						parent.getAttribute("role") === "article"
					) {
						postContainer = parent;
						break;
					}
					parent = parent.parentElement;
				}
			}

			if (!postContainer) return false;

			const containerText = (postContainer.textContent || "").toLowerCase();
			const hasSponsored =
				containerText.includes("sponsored") ||
				containerText.includes(" paid partnership") ||
				(containerText.includes("ad") && containerText.includes("instagram"));

			const sponsoredLabels = postContainer.querySelectorAll("span, div, a");
			for (const label of Array.from(sponsoredLabels)) {
				const text = (label.textContent || "").toLowerCase().trim();
				if (text === "sponsored" || text === "paid partnership") {
					return true;
				}
			}

			return hasSponsored;
		});

		return isSponsored;
	} catch {
		return false;
	}
}

/**
 * Like a visible post (if engagement is enabled)
 */
async function likeRandomPost(page: Page): Promise<boolean> {
	try {
		// Find like buttons that aren't already liked
		const likeButtons = await page.$$(
			'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill])',
		);

		if (likeButtons.length === 0) {
			return false;
		}

		// Filter out sponsored posts
		const nonSponsoredButtons = [];
		for (const button of likeButtons) {
			const sponsored = await isSponsoredPost(button);
			if (!sponsored) {
				nonSponsoredButtons.push(button);
			}
		}

		if (nonSponsoredButtons.length === 0) {
			return false; // No non-sponsored posts to like
		}

		// Randomly select one
		const randomIndex = Math.floor(
			Math.random() * Math.min(3, nonSponsoredButtons.length),
		);
		const button = nonSponsoredButtons[randomIndex];

		// Scroll to make it visible
		await button.evaluate((el: Element) => {
			el.scrollIntoView({ block: "center", behavior: "smooth" });
		});

		await shortDelay(0.5, 1);

		// Click like using ghost cursor for human-like movement
		try {
			await humanLikeClickHandle(page, button, {
				elementType: "button",
			});
		} catch {
			// Fallback to direct click if ghost cursor fails
			await button.click();
		}
		await microDelay(0.3, 0.8);

		return true;
	} catch {
		// Could not like post - continue
		return false;
	}
}

/**
 * Watch a reel briefly (if engagement is enabled)
 * Returns the number of reels watched (1 or 2)
 */
async function watchReel(page: Page): Promise<number> {
	try {
		// Find a reel in the feed
		const reelLinks = await page.$$('a[href*="/reel/"]');

		if (reelLinks.length === 0) {
			return 0;
		}

		// Randomly select one
		const randomIndex = Math.floor(
			Math.random() * Math.min(2, reelLinks.length),
		);
		const reelLink = reelLinks[randomIndex];

		// Scroll to make it visible
		await reelLink.evaluate((el: Element) => {
			el.scrollIntoView({ block: "center", behavior: "smooth" });
		});

		await shortDelay(0.5, 1);

		// Click to open reel
		await reelLink.click();
		await shortDelay(1, 2);

		// Watch for 3-8 seconds (natural viewing time)
		await mediumDelay(3, 8);

		// Close reel (press Escape or click outside)
		await page.keyboard.press("Escape");
		await shortDelay(0.5, 1);

		let reelsWatched = 1;

		// 50% chance to watch a second reel by scrolling up
		if (Math.random() < 0.5) {
			// Scroll up to find another reel
			await page.evaluate(() => {
				window.scrollBy({
					top: -400 - Math.random() * 300, // Scroll up 400-700px
					behavior: "smooth",
				});
			});
			await shortDelay(1, 2);

			// Try to find another reel
			const newReelLinks = await page.$$('a[href*="/reel/"]');
			if (newReelLinks.length > 0) {
				// Select a different reel (prefer one we haven't watched)
				const secondReelIndex = Math.floor(
					Math.random() * Math.min(2, newReelLinks.length),
				);
				const secondReelLink = newReelLinks[secondReelIndex];

				// Scroll to make it visible
				await secondReelLink.evaluate((el: Element) => {
					el.scrollIntoView({ block: "center", behavior: "smooth" });
				});

				await shortDelay(0.5, 1);

				// Click to open second reel using ghost cursor for human-like movement
				try {
					await humanLikeClickHandle(page, secondReelLink, {
						elementType: "link",
					});
				} catch {
					// Fallback to direct click if ghost cursor fails
					await secondReelLink.click();
				}
				await shortDelay(1, 2);

				// Watch for 3-8 seconds
				await mediumDelay(3, 8);

				// Close second reel
				await page.keyboard.press("Escape");
				await shortDelay(0.5, 1);

				reelsWatched = 2;
			}
		}

		return reelsWatched;
	} catch {
		// Could not watch reel - continue
		return 0;
	}
}

/**
 * Main scrolling session
 */
async function runNaturalScroll(args: ScrollArgs): Promise<void> {
	const { profileId, durationMinutes = 10, noEngagement, dryRun } = args;

	logger.info(
		"SESSION",
		`🚀 Starting natural scroll session for ${profileId} (${durationMinutes} min)`,
	);
	if (dryRun) {
		logger.warn("SESSION", "⚠️  DRY RUN MODE - No actual actions will be taken");
	}

	// Get profile from config file
	const profile = getProfile(profileId);
	if (!profile) {
		logger.error("SESSION", `Profile not found: ${profileId}`);
		logger.info(
			"SESSION",
			"Available profiles can be listed with: npm run profiles:list",
		);
		process.exit(1);
	}

	logger.info("SESSION", `Profile: @${profile.username} (${profile.type})`);

	// Create run entry
	const runId = await createRun("scroll");
	await import("../functions/shared/runs/runs.ts").then(({ updateRun }) =>
		updateRun(runId, {
			profileId,
			scheduledTime: new Date().toISOString(),
		}),
	);
	logger.info("SESSION", `Created run entry: ${runId}`);

	const startTime = Date.now();
	const targetDuration = durationMinutes * 60 * 1000;
	const endTime = startTime + targetDuration;

	let scrollCount = 0;
	let likesCount = 0;
	let reelsWatched = 0;
	let scrollBackCount = 0;

	let browser: Browser | undefined;
	let page: Page | undefined;

	try {
		// Initialize Instagram session
		logger.info("SESSION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			adsPowerProfileId: profile.adsPowerProfileId,
			profileId: profile.id,
			debug: true,
			credentials: {
				username: profile.username,
				password: profile.password,
			},
		});

		browser = session.browser;
		page = session.page;

		logger.info("SESSION", "✓ Session initialized");

		// Navigate to home feed
		logger.info("SESSION", "Navigating to home feed...");
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle0",
			timeout: 15000,
		});
		await shortDelay(2, 3);

		logger.info("SESSION", "Starting natural scrolling...");

		// Main scrolling loop
		while (Date.now() < endTime) {
			// Check if we should stop
			const remainingTime = endTime - Date.now();
			if (remainingTime < 5000) {
				// Less than 5 seconds left, finish up
				break;
			}

			// Natural scroll
			await naturalScroll(page, {
				minDistance: 300,
				maxDistance: 700,
				smooth: Math.random() > 0.3, // 70% smooth, 30% instant
			});
			scrollCount++;

			// Natural pause (reading time) - varies based on content
			// Longer pauses occasionally (reading a post)
			const pauseTime =
				Math.random() < 0.2
					? mediumDelay(3, 6) // 20% chance of longer pause
					: shortDelay(1, 3); // 80% chance of shorter pause
			await pauseTime;

			// Occasional scroll back (10% chance - humans do this)
			if (Math.random() < 0.1 && scrollCount > 3) {
				await scrollBackUp(page);
				scrollBackCount++;
				await shortDelay(0.5, 1.5);
			}

			// Random mouse movement (20% chance - natural behavior)
			if (Math.random() < 0.2) {
				await mouseWiggle(page);
				await microDelay(0.2, 0.5);
			}

			// Engagement actions (if enabled)
			if (!noEngagement && !dryRun) {
				// Like a post (18% chance - slightly increased)
				if (Math.random() < 0.18 && scrollCount > 2) {
					const liked = await likeRandomPost(page);
					if (liked) {
						likesCount++;
						await shortDelay(1, 2);
					}
				}

				// Watch a reel (8% chance - slightly increased)
				if (Math.random() < 0.08 && scrollCount > 5) {
					const watchedCount = await watchReel(page);
					if (watchedCount > 0) {
						reelsWatched += watchedCount;
					}
				}
			}

			// Log progress every 30 seconds
			if (scrollCount % 10 === 0) {
				const remaining = Math.floor((endTime - Date.now()) / 1000 / 60);
				logger.info(
					"SESSION",
					`Progress: ${scrollCount} scrolls, ${likesCount} likes, ${reelsWatched} reels (${remaining} min remaining)`,
				);
			}
		}

		// Final summary
		const totalDuration = Math.floor((Date.now() - startTime) / 1000);
		logger.info("SESSION", "✓ Scrolling session complete");
		logger.info(
			"SESSION",
			`Summary: ${scrollCount} scrolls, ${scrollBackCount} scroll-backs, ${likesCount} likes, ${reelsWatched} reels (${totalDuration}s)`,
		);

		// Update run with final stats
		await import("../functions/shared/runs/runs.ts").then(({ updateRun }) =>
			updateRun(runId, {
				status: "completed",
				stats: {
					duration: totalDuration,
				},
			}),
		);
	} catch (error) {
		logger.error("SESSION", `Session failed: ${error}`);

		// Update run with error
		await import("../functions/shared/runs/runs.ts").then(({ updateRun }) =>
			updateRun(runId, {
				status: "error",
				errorMessage: error instanceof Error ? error.message : String(error),
			}),
		);

		throw error;
	} finally {
		if (browser) {
			await browser.close();
			logger.info("SESSION", "Browser closed");
		}
	}
}

// Main entry point
const args = parseArgs();
runNaturalScroll(args)
	.then(() => {
		logger.info("SESSION", "Natural scroll script completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("SESSION", `Natural scroll script failed: ${error}`);
		process.exit(1);
	});
