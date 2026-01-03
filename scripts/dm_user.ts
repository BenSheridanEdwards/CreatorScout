/**
 * Send DM to a specific Instagram user
 *
 * Usage: tsx scripts/dm_user.ts <username> --profile <profile> [--confirm] [--force]
 * Example: tsx scripts/dm_user.ts bensheridanedwards --profile test-account --confirm
 * Example: tsx scripts/dm_user.ts bensheridanedwards --profile test-account --confirm --force
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { wasDmSent } from "../functions/shared/database/database.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { saveScreenshot } from "../functions/shared/snapshot/snapshot.ts";

async function dmUser(
	targetUsername: string,
	profileId: string,
	force: boolean = false,
): Promise<void> {
	console.log(`💬 Sending DM to: @${targetUsername}`);

	// Load profile config
	const profileConfig = getProfile(profileId);
	if (!profileConfig) {
		throw new Error(`Profile not found: ${profileId}`);
	}

	console.log(`📋 Using profile: @${profileConfig.username}`);
	console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);

	// Default to in-memory DB for this script
	if (!process.env.SCOUT_DB_MODE) {
		process.env.SCOUT_DB_MODE = "memory";
	}

	// Check if already DM'd (skip if --force)
	if (!force) {
		try {
			if (await wasDmSent(targetUsername)) {
				console.log("ℹ️  Already sent DM to this user");
				console.log("💡 Use --force flag to bypass this check");
				return;
			}
		} catch (err) {
			console.log("ℹ️  Could not check DM history; continuing anyway");
		}
	} else {
		console.log("⚡ Force mode: Bypassing database check");
	}

	const { browser, page } = await initializeInstagramSession({
		headless: false,
		debug: true,
		adsPowerProfileId: profileConfig.adsPowerProfileId,
		credentials: {
			username: profileConfig.username,
			password: profileConfig.password,
		},
	});

	try {
		console.log(`📨 Sending DM to @${targetUsername}...`);
		const success = await sendDMToUser(page, targetUsername);

		if (success) {
			console.log("✅ DM sent successfully");

			// Wait for message to appear
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Capture proof screenshot
			const proofPath = await saveScreenshot(
				page,
				"dm",
				targetUsername,
				"success",
			);
			console.log(`📸 DM proof screenshot saved: ${proofPath}`);
		} else {
			console.log("❌ DM failed to send");
			const failPath = await saveScreenshot(
				page,
				"dm",
				targetUsername,
				"failed",
			);
			console.log(`📸 DM failure screenshot saved: ${failPath}`);
		}
	} catch (error) {
		console.error("❌ DM failed:", error);
		try {
			const errPath = await saveScreenshot(page, "dm", targetUsername, "error");
			console.log(`📸 Error screenshot saved: ${errPath}`);
		} catch (screenshotErr) {
			console.error("❌ Could not take error screenshot:", screenshotErr);
		}
	} finally {
		browser.disconnect();

		// Stop AdsPower profile
		if (profileConfig.adsPowerProfileId) {
			try {
				await stopAdsPowerProfile(profileConfig.adsPowerProfileId);
				console.log("✅ AdsPower profile stopped");
			} catch (e) {
				console.warn(`⚠️  Could not stop AdsPower profile: ${e}`);
			}
		}
	}
}

// Script entry point
const args = process.argv.slice(2);
const confirm =
	args.includes("--confirm") || args.includes("--yes") || args.includes("-y");
const force = args.includes("--force") || args.includes("-f");

// Get profile
let profileId = "test-account"; // default
const profileIdx = args.findIndex((a) => a === "--profile");
if (profileIdx !== -1 && args[profileIdx + 1]) {
	profileId = args[profileIdx + 1];
}

// Get target username (first arg that doesn't start with -)
const targetUsername = args.find(
	(a, i) => !a.startsWith("-") && args[i - 1] !== "--profile",
);

if (!targetUsername) {
	console.error("❌ Please provide a username");
	console.error(
		"Usage: tsx scripts/dm_user.ts <username> --profile <profile> [--confirm] [--force]",
	);
	process.exit(1);
}

if (!confirm) {
	console.log(
		`🛑 Safety stop: not sending DM. Re-run with --confirm to message @${targetUsername}.`,
	);
	process.exit(0);
}

dmUser(targetUsername, profileId, force).catch(console.error);
