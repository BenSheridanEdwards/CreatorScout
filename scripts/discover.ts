/**
 * Scout - Instagram Creator Discovery Agent
 *
 * Usage: tsx scripts/discover.ts --profile <profile> [--send-dms] [--debug]
 * Example: tsx scripts/discover.ts --profile test-account
 * Example: tsx scripts/discover.ts --profile test-account --send-dms
 * Example: tsx scripts/discover.ts --profile test-account --send-dms --debug
 *
 * Flags:
 *   --profile <id>  Profile ID from profiles.config.json (default: test-account)
 *   --send-dms      Enable DM sending (default: discovery only, no DMs)
 *   --dm            Alias for --send-dms
 *   --debug, -d     Enable debug logging
 */

import dotenv from "dotenv";
dotenv.config();

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import {
	setCurrentRunId,
	updateRun,
	addCreatorToRun,
	addErrorToRun,
} from "../functions/shared/runs/runs.ts";

// Parse arguments
const args = process.argv.slice(2);
const debug = args.includes("--debug") || args.includes("-d");
const sendDMs = args.includes("--send-dms") || args.includes("--dm");

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
const { loadSeeds, processFollowingList } = await import("./scrape.ts");
const {
	initDb,
	queueCount,
	queueAdd,
	queueNext,
	getCreatorsWithUnscrapedFollowing,
	getStats,
} = await import("../functions/shared/database/database.ts");
const { getGlobalMetricsTracker } = await import(
	"../functions/shared/metrics/metrics.ts"
);
const { createLoggerWithCycleTracking } = await import(
	"../functions/shared/logger/logger.ts"
);
const { getDelay } = await import("../functions/timing/humanize/humanize.ts");
const { sleep } = await import("../functions/timing/sleep/sleep.ts");
const { MAX_DMS_PER_DAY } = await import(
	"../functions/shared/config/config.ts"
);

async function main() {
	console.log("🚀 Starting Instagram Creator Discovery...");
	console.log("📋 This will:");
	console.log("   • Load seed profiles from seeds.txt");
	console.log("   • Analyze bios for influencer indicators");
	console.log("   • 🔗 CLICK links in bios and analyze with AI vision");
	console.log("   • 👥 Follow confirmed creators");
	if (sendDMs) {
		console.log("   • 💬 SEND DMs to confirmed creators");
	}
	console.log("   • 📊 Show real-time progress and notifications");
	console.log("   • 🔄 Expand network by exploring following lists");
	if (sendDMs) {
		console.log("✅ DM MODE ENABLED - Will message creators");
	} else {
		console.log("🔍 DISCOVERY MODE - No DMs (use --send-dms to enable)");
	}
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
	// Note: AdsPower doesn't support headless mode well - use Xvfb on Linux for invisible browser
	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug,
		adsPowerProfileId: profileConfig?.adsPowerProfileId,
		credentials: {
			username: profileConfig?.username || "",
			password: profileConfig?.password || "",
		},
	});

	try {
		logger.info("ACTION", "✅ Session initialized!");

		if (sendDMs) {
			logger.info("ACTION", "🚀 Starting discovery loop with DMs enabled...");
		} else {
			logger.info("ACTION", "🔍 Starting discovery loop (no DMs)...");
		}

		// Main discovery loop with optional DM sending
		let dmsSent = 0;
		let seedsProcessed = 0;
		const stats = await getStats();
		dmsSent = stats.dms_sent;

		while ((!sendDMs || dmsSent < MAX_DMS_PER_DAY) && shouldContinue()) {
			// Get next profile from queue
			const target = await queueNext();

			if (!target) {
				const [waitMin, waitMax] = getDelay("queue_empty");
				const waitTime = waitMin + Math.random() * (waitMax - waitMin);
				logger.info(
					"QUEUE",
					`Queue empty - sleeping ${Math.floor(waitTime)}s...`,
				);
				await sleep(waitTime * 1000);
				continue;
			}

			seedsProcessed++;
			const currentQueue = await queueCount();
			logger.info("QUEUE", `Queue: ${currentQueue} remaining`);
			logger.info("SEED", `Processing seed #${seedsProcessed}: @${target}`);

			try {
				// Process their following list with optional DM sending
				await processFollowingList(
					target,
					page,
					metricsTracker,
					sendDMs, // sendDM based on flag
					shouldContinue,
				);
			} catch (err) {
				await logger.errorWithScreenshot(
					"ERROR",
					`Failed to process seed @${target}: ${
						err instanceof Error ? err.message : String(err)
					}`,
					page,
					`seed_process_${target}`,
				);
			}

			// Print stats
			const currentStats = await getStats();
			if (sendDMs) {
				logger.info(
					"STATS",
					`Progress: Visited ${currentStats.total_visited} | Creators: ${currentStats.confirmed_creators} | DMs: ${currentStats.dms_sent} | Queue: ${currentStats.queue_size}`,
				);
			} else {
				logger.info(
					"STATS",
					`Progress: Visited ${currentStats.total_visited} | Creators: ${currentStats.confirmed_creators} | Queue: ${currentStats.queue_size}`,
				);
			}

			dmsSent = currentStats.dms_sent;

			// Check if we've hit DM limit (only when sending DMs)
			if (sendDMs && dmsSent >= MAX_DMS_PER_DAY) {
				logger.info("LIMIT", `✅ Reached daily DM limit (${MAX_DMS_PER_DAY})`);
				break;
			}

			// Long delay between seed profiles
			const [seedDelayMin, seedDelayMax] = getDelay("between_seeds");
			const seedWait =
				seedDelayMin + Math.random() * (seedDelayMax - seedDelayMin);
			logger.info(
				"DELAY",
				`Waiting ${Math.floor(seedWait)}s before next seed...`,
			);
			await sleep(seedWait * 1000);
		}

		logger.info("ACTION", "📊 Discovery loop completed");
		logger.info("STATS", `Seeds processed: ${seedsProcessed}`);
		if (sendDMs) {
			logger.info("STATS", `DMs sent: ${dmsSent}`);
		}

		// End metrics session
		metricsTracker.endSession();
		const finalMetrics = metricsTracker.getSessionMetrics();
		if (sendDMs) {
			logger.info(
				"METRICS",
				`✅ Discovery completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}, DMs: ${finalMetrics.dmsSent}`,
			);
		} else {
			logger.info(
				"METRICS",
				`✅ Discovery completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}`,
			);
		}

		// End cycle
		const cycleStatus =
			sendDMs && dmsSent >= MAX_DMS_PER_DAY ? "COMPLETED" : "INTERRUPTED";
		const reason =
			sendDMs && dmsSent >= MAX_DMS_PER_DAY
				? "DM limit reached"
				: "Cycle interrupted";
		endCycle(cycleStatus, reason);

		logger.info("ACTION", "🔍 Discovery session completed successfully");
	} finally {
		browser.disconnect();

		// Stop AdsPower profile
		if (profileConfig?.adsPowerProfileId) {
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
