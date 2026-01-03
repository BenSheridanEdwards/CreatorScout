#!/usr/bin/env npx tsx
/**
 * Test script for watching a reel on Instagram feed
 *
 * Tests the reel watching engagement functionality in isolation.
 *
 * Usage:
 *   npm run test:reel -- --profile burner1
 *   npx tsx scripts/test_watch_reel.ts --profile burner1
 */

import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	humanClick,
	humanScroll,
} from "../functions/navigation/humanInteraction/humanInteraction.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import {
	mediumDelay,
	shortDelay,
} from "../functions/timing/humanize/humanize.ts";

const logger = createLogger();

interface ReelTestArgs {
	profileId: string;
	dryRun?: boolean;
	watchMultiple?: boolean;
}

function parseArgs(): ReelTestArgs {
	const args = process.argv.slice(2);
	let profileId = "";
	let dryRun = false;
	let watchMultiple = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--profile" && args[i + 1]) {
			profileId = args[i + 1];
		}
		if (args[i] === "--dry-run") {
			dryRun = true;
		}
		if (args[i] === "--multiple") {
			watchMultiple = true;
		}
	}

	if (!profileId) {
		throw new Error("Missing required argument: --profile");
	}

	return { profileId, dryRun, watchMultiple };
}

/**
 * Watch a reel briefly
 * Returns the number of reels watched (1 or 2)
 */
async function watchReel(
	page: Page,
	watchMultiple: boolean = false,
): Promise<number> {
	try {
		// Find a reel in the feed
		const reelLinks = await page.$$('a[href*="/reel/"]');

		if (reelLinks.length === 0) {
			logger.warn("ENGAGEMENT", "No reels found in feed");
			return 0;
		}

		logger.info("ENGAGEMENT", `Found ${reelLinks.length} reels in feed`);

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

		// Click to open reel using ghost cursor for human-like movement
		logger.info("ENGAGEMENT", "Opening first reel...");
		await humanClick(page, reelLink, {
			elementType: "link",
		});
		await shortDelay(1, 2);

		// Watch for 3-8 seconds (natural viewing time)
		const watchTime = 3 + Math.random() * 5;
		logger.info(
			"ENGAGEMENT",
			`Watching reel for ${watchTime.toFixed(1)} seconds...`,
		);
		await mediumDelay(3, 8);

		// Close reel (press Escape)
		logger.info("ENGAGEMENT", "Closing reel...");
		await page.keyboard.press("Escape");
		await shortDelay(0.5, 1);

		let reelsWatched = 1;

		// Optionally watch a second reel
		if (watchMultiple && Math.random() < 0.5) {
			logger.info("ENGAGEMENT", "Attempting to watch a second reel...");

			// Scroll up to find another reel
			await humanScroll(page, { deltaY: -(400 + Math.random() * 300) }); // Scroll up 400-700px
			await shortDelay(1, 2);

			// Try to find another reel
			const newReelLinks = await page.$$('a[href*="/reel/"]');
			if (newReelLinks.length > 0) {
				// Select a different reel
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
				logger.info("ENGAGEMENT", "Opening second reel...");
				await humanClick(page, secondReelLink, {
					elementType: "link",
				});
				await shortDelay(1, 2);

				// Watch for 3-8 seconds
				const secondWatchTime = 3 + Math.random() * 5;
				logger.info(
					"ENGAGEMENT",
					`Watching second reel for ${secondWatchTime.toFixed(1)} seconds...`,
				);
				await mediumDelay(3, 8);

				// Close second reel
				logger.info("ENGAGEMENT", "Closing second reel...");
				await page.keyboard.press("Escape");
				await shortDelay(0.5, 1);

				reelsWatched = 2;
				logger.info("ENGAGEMENT", "✓ Watched 2 reels");
			} else {
				logger.warn("ENGAGEMENT", "No second reel found after scrolling");
			}
		}

		return reelsWatched;
	} catch (error) {
		logger.error("ENGAGEMENT", `Failed to watch reel: ${error}`);
		return 0;
	}
}

/**
 * Main test function
 */
async function testWatchReel(args: ReelTestArgs): Promise<void> {
	const { profileId, dryRun, watchMultiple } = args;

	logger.info("TEST", `🚀 Starting watch reel test for ${profileId}`);
	if (dryRun) {
		logger.warn("TEST", "⚠️  DRY RUN MODE - No actual actions will be taken");
	}
	if (watchMultiple) {
		logger.info("TEST", "Will attempt to watch multiple reels if available");
	}

	// Get profile from config file
	const profile = getProfile(profileId);
	if (!profile) {
		logger.error("TEST", `Profile not found: ${profileId}`);
		logger.info(
			"TEST",
			"Available profiles can be listed with: npm run profiles:list",
		);
		process.exit(1);
	}

	logger.info("TEST", `Profile: @${profile.username} (${profile.type})`);

	let browser: Browser | undefined;
	let page: Page | undefined;

	try {
		// Initialize Instagram session
		logger.info("TEST", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: false, // Show browser for testing
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

		logger.info("TEST", "✓ Session initialized");

		// Navigate to home feed
		logger.info("TEST", "Navigating to home feed...");
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle0",
			timeout: 15000,
		});
		await shortDelay(2, 3);

		logger.info("TEST", "✓ Home feed loaded");

		// Attempt to watch a reel
		if (dryRun) {
			logger.info("TEST", "[DRY RUN] Would attempt to watch a reel");
		} else {
			const reelsWatched = await watchReel(page, watchMultiple);
			if (reelsWatched > 0) {
				logger.info(
					"TEST",
					`✅ Test completed successfully - watched ${reelsWatched} reel(s)`,
				);
			} else {
				logger.warn("TEST", "⚠️  Test completed but no reels were watched");
			}
		}

		// Test complete - browser will close automatically
	} catch (error) {
		logger.error("TEST", `Test failed: ${error}`);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
			logger.info("TEST", "Browser closed");
		}
	}
}

// Main entry point
const args = parseArgs();
testWatchReel(args)
	.then(() => {
		logger.info("TEST", "Watch reel test completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("TEST", `Watch reel test failed: ${error}`);
		process.exit(1);
	});
