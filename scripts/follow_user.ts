/**
 * Follow a specific Instagram user
 *
 * Usage: tsx scripts/follow_user.ts <username> [--confirm] [--force]
 * Example: tsx scripts/follow_user.ts bensheridanedwards --confirm
 * Example: tsx scripts/follow_user.ts bensheridanedwards --confirm --force  # Bypass database check
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { followUserAccount } from "../functions/profile/profileActions/profileActions.ts";
import { wasFollowed } from "../functions/shared/database/database.ts";
import { saveScreenshot } from "../functions/shared/snapshot/snapshot.ts";

async function followUser(
	username: string,
	force: boolean = false,
): Promise<void> {
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
				console.log("ℹ️  Already following this user");
				console.log("💡 Use --force flag to bypass this check for testing");
				return;
			}
		} catch (err) {
			console.log(
				"ℹ️  Could not check follow history (DB unavailable); continuing anyway",
			);
			console.error("Database check failed:", err);
		}
	} else {
		console.log("⚡ Force mode: Bypassing database check");
	}

	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug: true,
	});

	try {
		console.log(`👥 Following user: @${username}`);

		logger.info("ACTION", `📍 Attempting to follow @${username}...`);
		const success = await followUserAccount(page, username);

		if (success) {
			console.log(`✅ Successfully followed @${username}`);

			// Wait for follow action to fully complete
			console.log("⏳ Waiting for follow action to stabilize...");
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Verify we're still on the profile page
			const currentUrl = page.url();
			const isOnProfile =
				currentUrl.includes(`/${username}/`) ||
				currentUrl.includes(`/${username.toLowerCase()}/`);

			if (!isOnProfile) {
				console.log(
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
			console.log(`📸 Follow success screenshot saved: ${proofPath}`);
		} else {
			console.log(`❌ Failed to follow @${username}`);

			// Wait a moment for any navigation to complete
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Verify we're still on the profile page before taking screenshot
			const currentUrl = page.url();
			const isOnProfile =
				currentUrl.includes(`/${username}/`) ||
				currentUrl.includes(`/${username.toLowerCase()}/`);

			if (!isOnProfile) {
				console.log(
					"⚠️  Not on profile page after follow failure, navigating back to capture screenshot...",
				);
				try {
					await page.goto(`https://www.instagram.com/${username}/`, {
						waitUntil: "networkidle2",
						timeout: 15000,
					});
					await new Promise((resolve) => setTimeout(resolve, 2000));
				} catch (navError) {
					console.error(`⚠️  Could not navigate back to profile: ${navError}`);
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
				console.error(
					"⚠️  Session expired - cannot capture meaningful screenshot",
				);
			}

			// Capture failure screenshot
			const failPath = await saveScreenshot(page, "follow", username, "failed");
			console.log(`📸 Follow failure screenshot saved: ${failPath}`);
		}
	} catch (error) {
		console.error(`❌ Follow operation failed with error: ${error}`);
		try {
			const errPath = await saveScreenshot(page, "follow", username, "error");
			console.log(`📸 Error screenshot saved: ${errPath}`);
		} catch (screenshotErr) {
			console.error(`❌ Could not take error screenshot: ${screenshotErr}`);
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
	console.error("❌ Please provide a username");
	console.error(
		"Usage: tsx scripts/follow_user.ts <username> [--confirm] [--force]",
	);
	process.exit(1);
}

if (!confirm) {
	console.log(
		`🛑 Safety stop: not following any user. Re-run with --confirm to actually follow @${username}.`,
	);
	process.exit(0);
}

followUser(username, force).catch((error) => {
	console.error(`Unhandled error in follow script: ${error}`);
	process.exit(1);
});
