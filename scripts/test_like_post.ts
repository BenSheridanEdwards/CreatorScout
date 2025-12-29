#!/usr/bin/env npx tsx
/**
 * Test script for liking a post on Instagram feed
 *
 * Tests the like engagement functionality in isolation.
 *
 * Usage:
 *   npm run test:like -- --profile burner1
 *   npx tsx scripts/test_like_post.ts --profile burner1
 */

import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	microDelay,
	shortDelay,
} from "../functions/timing/humanize/humanize.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";

const logger = createLogger();

interface LikeTestArgs {
	profileId: string;
	dryRun?: boolean;
}

function parseArgs(): LikeTestArgs {
	const args = process.argv.slice(2);
	let profileId = "";
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--profile" && args[i + 1]) {
			profileId = args[i + 1];
		}
		if (args[i] === "--dry-run") {
			dryRun = true;
		}
	}

	if (!profileId) {
		throw new Error("Missing required argument: --profile");
	}

	return { profileId, dryRun };
}

/**
 * Like a visible post on the feed
 */
async function likeRandomPost(page: Page): Promise<boolean> {
	try {
		// Find like buttons that aren't already liked
		const likeButtons = await page.$$(
			'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill])',
		);

		if (likeButtons.length === 0) {
			logger.warn("ENGAGEMENT", "No unliked posts found in feed");
			return false;
		}

		logger.info("ENGAGEMENT", `Found ${likeButtons.length} unliked posts`);

		// Randomly select one (prefer first 3 visible posts)
		const randomIndex = Math.floor(
			Math.random() * Math.min(3, likeButtons.length),
		);
		const button = likeButtons[randomIndex];

		// Scroll to make it visible
		await button.evaluate((el: Element) => {
			el.scrollIntoView({ block: "center", behavior: "smooth" });
		});

		await shortDelay(0.5, 1);

		// Click like
		logger.info("ENGAGEMENT", "Clicking like button...");
		await button.click();
		await microDelay(0.3, 0.8);

		logger.info("ENGAGEMENT", "✓ Post liked successfully");
		return true;
	} catch (error) {
		logger.error("ENGAGEMENT", `Failed to like post: ${error}`);
		return false;
	}
}

/**
 * Main test function
 */
async function testLikePost(args: LikeTestArgs): Promise<void> {
	const { profileId, dryRun } = args;

	logger.info("TEST", `🚀 Starting like post test for ${profileId}`);
	if (dryRun) {
		logger.warn("TEST", "⚠️  DRY RUN MODE - No actual actions will be taken");
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

		// Attempt to like a post
		if (dryRun) {
			logger.info("TEST", "[DRY RUN] Would attempt to like a post");
		} else {
			const success = await likeRandomPost(page);
			if (success) {
				logger.info("TEST", "✅ Test completed successfully");
			} else {
				logger.warn("TEST", "⚠️  Test completed but no post was liked");
			}
		}

		// Keep browser open for 5 minutes to allow manual verification if needed
		logger.info("TEST", "Keeping browser open for 5 minutes...");
		await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
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
testLikePost(args)
	.then(() => {
		logger.info("TEST", "Like post test completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("TEST", `Like post test failed: ${error}`);
		process.exit(1);
	});
