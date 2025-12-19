/**
 * Follow a specific Instagram user
 *
 * Usage: tsx scripts/follow_user.ts <username> [--confirm] [--force]
 * Example: tsx scripts/follow_user.ts bensheridanedwards --confirm
 * Example: tsx scripts/follow_user.ts bensheridanedwards --confirm --force  # Bypass database check
 */

import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { followUserAccount } from "../functions/profile/profileActions/profileActions.ts";
import { wasFollowed } from "../functions/shared/database/database.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import { saveScreenshot } from "../functions/shared/snapshot/snapshot.ts";

const logger = createLogger(true); // Enable logging for scripts

async function followUser(
	username: string,
	force: boolean = false,
): Promise<void> {
	logger.info("INTENTION", `👥 Following user: @${username}`);

	// Default to in-memory DB for this script unless user explicitly opts into Prisma.
	// Following is the primary goal; DB tracking is best-effort.
	if (!process.env.SCOUT_DB_MODE) {
		process.env.SCOUT_DB_MODE = "memory";
	}

	// Check if already followed (best-effort; if DB is unavailable, continue anyway).
	// Skip check if --force flag is used (for testing)
	if (!force) {
		try {
			if (await wasFollowed(username)) {
				logger.info("PROFILE", "ℹ️  Already following this user");
				logger.info(
					"SYSTEM",
					"💡 Use --force flag to bypass this check for testing",
				);
				return;
			}
		} catch (err) {
			logger.info(
				"DATABASE",
				"ℹ️  Could not check follow history (DB unavailable); continuing anyway",
			);
			logger.error("ERROR", `Database check failed: ${err}`);
		}
	} else {
		logger.info("SYSTEM", "⚡ Force mode: Bypassing database check");
	}

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		logger.info("AUTH", "🔐 Logging in...");
		await ensureLoggedIn(page);
		logger.info("AUTH", "✅ Logged in successfully");

		// Wait for session to fully establish before navigating
		logger.info("NAVIGATION", "⏳ Waiting for session to stabilize...");
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Take a screenshot to see what the page looks like after login
		const loginStatePath = await saveScreenshot(
			page,
			"login",
			username,
			"state",
		);
		logger.info(
			"SCREENSHOT",
			`📸 Login state screenshot saved: ${loginStatePath}`,
		);

		// Verify we're still logged in before proceeding
		const stillLoggedIn = await page.evaluate(() => {
			return (
				document.querySelector('a[href="/direct/inbox/"]') !== null ||
				document.querySelector('svg[aria-label="Home"]') !== null
			);
		});

		if (!stillLoggedIn) {
			throw new Error(
				"Session lost after login - Instagram may have detected automation",
			);
		}

		logger.info("ACTION", `📍 Attempting to follow @${username}...`);
		const success = await followUserAccount(page, username);

		if (success) {
			logger.info("ACTION", `✅ Successfully followed @${username}`);

			// Wait for follow action to fully complete
			logger.info("SYSTEM", "⏳ Waiting for follow action to stabilize...");
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Verify we're still on the profile page
			const currentUrl = page.url();
			const isOnProfile =
				currentUrl.includes(`/${username}/`) ||
				currentUrl.includes(`/${username.toLowerCase()}/`);

			if (!isOnProfile) {
				logger.warn(
					"NAVIGATION",
					"⚠️  Not on profile page, navigating back to capture proof...",
				);
				await page.goto(`https://www.instagram.com/${username}/`, {
					waitUntil: "networkidle2",
					timeout: 15000,
				});
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Capture proof screenshot
			const proofPath = await saveScreenshot(
				page,
				"follow",
				username,
				"success",
			);
			logger.info(
				"SCREENSHOT",
				`📸 Follow success screenshot saved: ${proofPath}`,
			);
		} else {
			logger.warn("ACTION", `❌ Failed to follow @${username}`);

			// Wait a moment for any navigation to complete
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Verify we're still on the profile page before taking screenshot
			const currentUrl = page.url();
			const isOnProfile =
				currentUrl.includes(`/${username}/`) ||
				currentUrl.includes(`/${username.toLowerCase()}/`);

			if (!isOnProfile) {
				logger.warn(
					"NAVIGATION",
					"⚠️  Not on profile page after follow failure, navigating back to capture screenshot...",
				);
				try {
					await page.goto(`https://www.instagram.com/${username}/`, {
						waitUntil: "networkidle2",
						timeout: 15000,
					});
					await new Promise((resolve) => setTimeout(resolve, 2000));
				} catch (navError) {
					logger.error(
						"NAVIGATION",
						`⚠️  Could not navigate back to profile: ${navError}`,
					);
				}
			}

			// Verify we're still logged in
			const stillLoggedIn = await page.evaluate(() => {
				return (
					document.querySelector('a[href="/direct/inbox/"]') !== null ||
					document.querySelector('svg[aria-label="Home"]') !== null
				);
			});

			if (!stillLoggedIn) {
				logger.error(
					"AUTH",
					"⚠️  Session expired - cannot capture meaningful screenshot",
				);
			}

			// Capture failure screenshot
			const failPath = await saveScreenshot(page, "follow", username, "failed");
			logger.info(
				"SCREENSHOT",
				`📸 Follow failure screenshot saved: ${failPath}`,
			);
		}
	} catch (error) {
		logger.error("ERROR", `❌ Follow operation failed with error: ${error}`);
		try {
			const errPath = await saveScreenshot(page, "follow", username, "error");
			logger.info("SCREENSHOT", `📸 Error screenshot saved: ${errPath}`);
		} catch (screenshotErr) {
			logger.error(
				"ERROR",
				`❌ Could not take error screenshot: ${screenshotErr}`,
			);
		}
	} finally {
		await browser.close();
	}
}

// Script entry point
const args = process.argv.slice(2);
const confirm =
	args.includes("--confirm") || args.includes("--yes") || args.includes("-y");
const force = args.includes("--force") || args.includes("-f");
const username = args.find((a) => !a.startsWith("-"));
if (!username) {
	logger.error("ERROR", "❌ Please provide a username");
	logger.error(
		"ERROR",
		"Usage: tsx scripts/follow_user.ts <username> [--confirm] [--force]",
	);
	process.exit(1);
}

if (!confirm) {
	logger.info(
		"SYSTEM",
		`🛑 Safety stop: not following any user. Re-run with --confirm to actually follow @${username}.`,
	);
	process.exit(0);
}

followUser(username, force).catch((error) => {
	logger.error("ERROR", `Unhandled error in follow script: ${error}`);
	process.exit(1);
});
