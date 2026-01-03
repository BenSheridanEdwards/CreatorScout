/**
 * Test Single Profile
 *
 * Follows the dm_user.ts pattern - uses initializeInstagramSession
 *
 * Usage:
 *   tsx scripts/test_profile.ts --profile test-account
 *   tsx scripts/test_profile.ts --profile test-account --skip-warmup
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import { warmUpProfile } from "../functions/timing/warmup/warmup.ts";

interface TestArgs {
	profile: string;
	skipWarmup?: boolean;
}

function parseArgs(): TestArgs {
	const args = process.argv.slice(2);
	let profile = "";
	let skipWarmup = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--profile" && args[i + 1]) {
			profile = args[i + 1];
		}
		if (args[i] === "--skip-warmup") {
			skipWarmup = true;
		}
	}

	if (!profile) {
		throw new Error("Missing required argument: --profile");
	}

	return { profile, skipWarmup };
}

async function main(): Promise<void> {
	const args = parseArgs();

	console.log(`🧪 Testing profile: ${args.profile}`);

	// Load profile config
	const profileConfig = getProfile(args.profile);
	if (!profileConfig) {
		throw new Error(`Profile not found: ${args.profile}`);
	}

	console.log(`📋 Profile: @${profileConfig.username} (${profileConfig.type})`);
	console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);

	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug: true,
		adsPowerProfileId: profileConfig.adsPowerProfileId,
		credentials: {
			username: profileConfig.username,
			password: profileConfig.password,
		},
	});

	try {
		logger.info("TEST", "✅ Session initialized!");

		// Warm-up
		if (!args.skipWarmup) {
			logger.info("TEST", "🔥 Running warm-up...");
			await warmUpProfile(page, 1.5);
			logger.info("TEST", "✅ Warm-up complete");
		} else {
			logger.info("TEST", "⏩ Warm-up skipped");
		}

		// Take final screenshot
		await snapshot(page, `test_profile_success_${Date.now()}`);

		logger.info("TEST", "");
		logger.info("TEST", "✅ All tests passed!");
		logger.info("TEST", `   Profile: @${profileConfig.username}`);
		logger.info("TEST", `   Type: ${profileConfig.type}`);
		logger.info("TEST", `   AdsPower ID: ${profileConfig.adsPowerProfileId}`);
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

main().catch((error) => {
	console.error("❌ Test failed:", error);
	process.exit(1);
});
