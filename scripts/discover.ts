/**
 * Scout - Instagram Creator Discovery Agent
 *
 * Usage: tsx scripts/discover.ts --profile <profile> [--debug]
 * Example: tsx scripts/discover.ts --profile test-account
 * Example: tsx scripts/discover.ts --profile test-account --debug
 */

import dotenv from "dotenv";
dotenv.config();

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";

// Parse arguments
const args = process.argv.slice(2);
const debug = args.includes("--debug") || args.includes("-d");

// Get profile
let profileId = "test-account"; // default
const profileIdx = args.findIndex((a) => a === "--profile");
if (profileIdx !== -1 && args[profileIdx + 1]) {
	profileId = args[profileIdx + 1];
}

// Load profile config
const profileConfig = getProfile(profileId);
if (!profileConfig) {
	console.error(`❌ Profile not found: ${profileId}`);
	process.exit(1);
}

console.log(`🔍 Scout - Instagram Creator Discovery Agent`);
console.log(`📋 Using profile: @${profileConfig.username}`);
console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);
console.log("");

// Dynamic imports
const { loadSeeds, runScrapeLoopWithoutDM } = await import("./scrape.ts");
const {
	initDb,
	queueCount,
	queueAdd,
	getCreatorsWithUnscrapedFollowing,
	getStats,
} = await import("../functions/shared/database/database.ts");
const { getGlobalMetricsTracker } = await import(
	"../functions/shared/metrics/metrics.ts"
);
const { createLoggerWithCycleTracking } = await import(
	"../functions/shared/logger/logger.ts"
);

async function main() {
	console.log("🚀 Starting Instagram Creator Discovery...");
	console.log("📋 This will:");
	console.log("   • Load seed profiles from seeds.txt");
	console.log("   • Analyze bios for influencer indicators");
	console.log("   • 🔗 CLICK links in bios and analyze with AI vision");
	console.log("   • 👥 Follow confirmed creators");
	console.log("   • 📊 Show real-time progress and notifications");
	console.log("   • 🔄 Expand network by exploring following lists");
	console.log("❌ This will NOT send DMs (discovery mode)");
	console.log("");

	// Initialize database
	await initDb();

	// Check queue status
	const queueSize = await queueCount();
	const stats = await getStats();
	console.log(`📊 Database stats:`);
	console.log(`   • Profiles visited: ${stats.total_visited}`);
	console.log(`   • Confirmed creators: ${stats.confirmed_creators}`);
	console.log(`   • Queue size: ${queueSize}`);
	console.log("");

	// If queue is empty, try to re-seed from confirmed creators
	if (queueSize === 0) {
		console.log("📭 Queue is empty, checking for creators to expand...");

		// First try loading seeds
		const seedsLoaded = await loadSeeds();
		if (seedsLoaded > 0) {
			console.log(`📋 Loaded ${seedsLoaded} seeds from seeds.txt`);
		}

		// Then check for confirmed creators whose following hasn't been scraped
		const unscrapedCreators = await getCreatorsWithUnscrapedFollowing();
		if (unscrapedCreators.length > 0) {
			console.log(
				`🔄 Found ${unscrapedCreators.length} creators with unscraped following lists:`,
			);
			for (const creator of unscrapedCreators.slice(0, 10)) {
				console.log(`   • @${creator}`);
				await queueAdd(creator, 80, "creator_expansion");
			}
			if (unscrapedCreators.length > 10) {
				console.log(`   ... and ${unscrapedCreators.length - 10} more`);
			}
		} else {
			console.log("✅ All confirmed creators have had their following scraped");
		}

		// Check queue again
		const newQueueSize = await queueCount();
		if (newQueueSize === 0) {
			console.log("📭 No work to do - queue is still empty");
			console.log("💡 Add usernames to seeds.txt to start discovery");
			return;
		}
		console.log(`📋 Queue now has ${newQueueSize} items`);
	} else {
		// Also load seeds to add any new ones
		const seedsLoaded = await loadSeeds();
		if (seedsLoaded > 0) {
			console.log(`📋 Loaded ${seedsLoaded} seeds from seeds.txt`);
		}
	}

	// Initialize metrics
	const metricsTracker = getGlobalMetricsTracker();
	console.log(`📊 Metrics session: ${metricsTracker.getSessionId()}`);

	// Initialize cycle tracking (required for shouldContinue() to work)
	const { startCycle, endCycle, shouldContinue } =
		createLoggerWithCycleTracking(debug);
	const finalQueueSize = await queueCount();
	const cycleId = startCycle("batch_discovery", finalQueueSize * 10);
	console.log(`🔄 Started cycle: ${cycleId}`);

	// Initialize session with AdsPower
	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug,
		adsPowerProfileId: profileConfig.adsPowerProfileId,
		credentials: {
			username: profileConfig.username,
			password: profileConfig.password,
		},
	});

	try {
		logger.info("ACTION", "✅ Session initialized!");

		// Run discovery loop - IMPORTANT: pass shouldContinue from our cycle manager
		await runScrapeLoopWithoutDM(page, metricsTracker, {
			shouldContinue,
		});

		// End metrics session
		metricsTracker.endSession();
		const finalMetrics = metricsTracker.getSessionMetrics();
		logger.info(
			"METRICS",
			`✅ Discovery completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}`,
		);

		// End cycle
		endCycle("COMPLETED", "Discovery session completed");

		logger.info("ACTION", "🔍 Discovery session completed successfully");
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

main().catch((err) => {
	console.error("💥 Discovery failed:", err);
	process.exit(1);
});
