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
import { handleInstagramPopups } from "../functions/profile/profileActions/popupHandler.ts";

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
 * Check if a post is a sponsored post/ad
 */
async function isSponsoredPost(
	button: import("puppeteer").ElementHandle<Element>,
): Promise<boolean> {
	try {
		// Check if the post contains "Sponsored" or "Ad" text
		const isSponsored = await button.evaluate((el: Element) => {
			// Find the post container (usually a parent article or div)
			let postContainer =
				el.closest("article") || el.closest('[role="article"]');
			if (!postContainer) {
				// Try to find parent that contains the post
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

			// Check for sponsored indicators
			const containerText = (postContainer.textContent || "").toLowerCase();
			const hasSponsored =
				containerText.includes("sponsored") ||
				containerText.includes(" paid partnership") ||
				(containerText.includes("ad") && containerText.includes("instagram"));

			// Also check for "Sponsored" label in the post
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
		return false; // If we can't determine, assume not sponsored
	}
}

/**
 * Like a visible post on the feed
 */
async function likeRandomPost(page: Page): Promise<boolean> {
	try {
		// First, dismiss any popups that might have appeared
		await handleInstagramPopups(page);
		await microDelay(0.3, 0.5);

		// Try multiple selectors for like buttons
		// Instagram uses different structures: svg elements, button elements, etc.
		let likeButtons: import("puppeteer").ElementHandle<Element>[] =
			await page.$$(
				'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill])',
			);

		// If no SVG buttons found, try button elements
		if (likeButtons.length === 0) {
			likeButtons = await page.$$(
				'button[aria-label="Like"], button[aria-label*="Like"]',
			);
		}

		// Try finding by role and aria-label
		if (likeButtons.length === 0) {
			likeButtons = await page.$$(
				'[role="button"][aria-label="Like"], [role="button"][aria-label*="Like"]',
			);
		}

		// Try finding by marking elements with data attributes (like button is often in a button wrapper)
		if (likeButtons.length === 0) {
			const markedCount = await page.evaluate(() => {
				let count = 0;
				// Find all buttons/clickable elements
				const allButtons = Array.from(
					document.querySelectorAll('button, [role="button"], svg'),
				);
				for (const btn of allButtons) {
					const ariaLabel = btn.getAttribute("aria-label") || "";
					const parentAriaLabel =
						btn.parentElement?.getAttribute("aria-label") || "";
					if (
						ariaLabel.toLowerCase().includes("like") &&
						!ariaLabel.toLowerCase().includes("unlike") &&
						!ariaLabel.toLowerCase().includes("liked")
					) {
						btn.setAttribute("data-scout-like-button", "true");
						count++;
					} else if (
						parentAriaLabel.toLowerCase().includes("like") &&
						!parentAriaLabel.toLowerCase().includes("unlike") &&
						!parentAriaLabel.toLowerCase().includes("liked")
					) {
						const parent = btn.parentElement;
						if (parent) {
							parent.setAttribute("data-scout-like-button", "true");
							count++;
						}
					}
				}
				return count;
			});

			if (markedCount > 0) {
				likeButtons = await page.$$('[data-scout-like-button="true"]');
			}
		}

		if (likeButtons.length === 0) {
			logger.warn("ENGAGEMENT", "No unliked posts found in feed");
			// Try scrolling to load more content
			logger.info("ENGAGEMENT", "Scrolling to load more posts...");
			await page.evaluate(() => {
				window.scrollBy({ top: 800, behavior: "smooth" });
			});
			await shortDelay(2, 3);

			// Try again after scrolling
			likeButtons = await page.$$(
				'svg[aria-label="Like"][fill="none"], svg[aria-label="Like"]:not([fill]), button[aria-label="Like"]',
			);
		}

		if (likeButtons.length === 0) {
			logger.warn("ENGAGEMENT", "No unliked posts found after scrolling");
			return false;
		}

		logger.info("ENGAGEMENT", `Found ${likeButtons.length} unliked posts`);

		// Filter out sponsored posts
		const nonSponsoredButtons = [];
		for (const button of likeButtons) {
			const sponsored = await isSponsoredPost(button);
			if (!sponsored) {
				nonSponsoredButtons.push(button);
			}
		}

		if (nonSponsoredButtons.length === 0) {
			logger.warn("ENGAGEMENT", "No non-sponsored posts found to like");
			return false;
		}

		logger.info(
			"ENGAGEMENT",
			`Found ${nonSponsoredButtons.length} non-sponsored posts (filtered ${likeButtons.length - nonSponsoredButtons.length} sponsored)`,
		);

		// Randomly select one (prefer first 3 visible posts)
		const randomIndex = Math.floor(
			Math.random() * Math.min(3, nonSponsoredButtons.length),
		);
		const button = nonSponsoredButtons[randomIndex];

		// Scroll to make it visible
		await button.evaluate((el: Element) => {
			el.scrollIntoView({ block: "center", behavior: "smooth" });
		});

		await shortDelay(0.5, 1);

		// Click like - try clicking the button or its parent
		logger.info("ENGAGEMENT", "Clicking like button...");
		try {
			await (button as import("puppeteer").ElementHandle<HTMLElement>).click();
		} catch {
			// If direct click fails, try clicking parent element
			await button.evaluate((el: Element) => {
				const parent = el.closest('button, [role="button"]');
				if (parent) {
					(parent as HTMLElement).click();
				} else {
					(el as HTMLElement).click();
				}
			});
		}
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

		// Dismiss any notification popups
		logger.info("TEST", "Dismissing popups...");
		await handleInstagramPopups(page);
		await shortDelay(1, 2);

		// Scroll a bit to load posts
		logger.info("TEST", "Scrolling to load feed content...");
		await page.evaluate(() => {
			window.scrollBy({ top: 500, behavior: "smooth" });
		});
		await shortDelay(2, 3);

		// Scroll back up a bit
		await page.evaluate(() => {
			window.scrollBy({ top: -200, behavior: "smooth" });
		});
		await shortDelay(1, 2);

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
testLikePost(args)
	.then(() => {
		logger.info("TEST", "Like post test completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("TEST", `Like post test failed: ${error}`);
		process.exit(1);
	});
