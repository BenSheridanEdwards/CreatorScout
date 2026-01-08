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
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";

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
const { MAX_DMS_PER_DAY, PRIORITIZE_QUEUE_OVER_SEEDS, SESSION_DURATION_MAX } =
	await import("../functions/shared/config/config.ts");

async function main() {
	console.log("🚀 Starting Instagram Creator Discovery...");
	console.log("📋 This will:");
	console.log("   • Load seed profiles from data/seeds.txt");
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
	if (PRIORITIZE_QUEUE_OVER_SEEDS) {
		console.log(
			"📋 QUEUE PRIORITY MODE - Queue items will be processed before seeds",
		);
	}
	console.log(
		`⏱️  Session duration limit: ${SESSION_DURATION_MAX} minutes (safety feature to prevent account flagging)`,
	);
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
			console.log(`📋 Loaded ${seedsLoaded} seeds from data/seeds.txt`);
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
			console.log("💡 Add usernames to data/seeds.txt to start discovery");
			return;
		}
		console.log(`📋 Queue now has ${newQueueSize} items`);
	} else {
		// Also load seeds to add any new ones
		const seedsLoaded = await loadSeeds();
		if (seedsLoaded > 0) {
			console.log(`📋 Loaded ${seedsLoaded} seeds from data/seeds.txt`);
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

	// Reset queue add counter for this cycle (prevents network explosion)
	const { resetQueueAddCounter } = await import(
		"../functions/profile/profileActions/profileActions.ts"
	);
	resetQueueAddCounter();

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

		// Track consecutive errors to detect Instagram blocking
		let consecutiveErrors = 0;
		const MAX_CONSECUTIVE_ERRORS = 3; // Disconnect after 3 consecutive blocking errors

		// Session duration limit to prevent running all night
		const sessionStartTime = Date.now();
		const maxSessionDurationMs = SESSION_DURATION_MAX * 60 * 1000; // Convert minutes to ms

		while ((!sendDMs || dmsSent < MAX_DMS_PER_DAY) && shouldContinue()) {
			// Check session duration limit
			if (Date.now() - sessionStartTime >= maxSessionDurationMs) {
				logger.info(
					"LIMIT",
					`✅ Reached maximum session duration (${SESSION_DURATION_MAX} minutes) - stopping to prevent account flagging`,
				);
				break;
			}
			// Get next profile from queue (excluding seeds if PRIORITIZE_QUEUE_OVER_SEEDS is enabled)
			let target = await queueNext(PRIORITIZE_QUEUE_OVER_SEEDS);

			// If no non-seed items found and we're prioritizing queue, fall back to seeds
			if (!target && PRIORITIZE_QUEUE_OVER_SEEDS) {
				target = await queueNext(false);
				if (target) {
					logger.info("QUEUE", "No more queue items, falling back to seeds...");
				}
			}

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
				// Reset error counter on success
				consecutiveErrors = 0;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				await logger.errorWithScreenshot(
					"ERROR",
					`Failed to process seed @${target}: ${errorMessage}`,
					page,
					`seed_process_${target}`,
				);

				// Check if this looks like Instagram blocking
				const isBlockingError =
					errorMessage.includes("Could not find profile") ||
					errorMessage.includes("search results") ||
					errorMessage.includes("rate limit") ||
					errorMessage.includes("blocked") ||
					errorMessage.includes("challenge") ||
					errorMessage.includes("suspended");

				if (isBlockingError) {
					consecutiveErrors++;
					logger.warn(
						"ERROR",
						`⚠️ Instagram blocking detected (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} consecutive errors)`,
					);

					if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
						logger.error(
							"ERROR",
							`🚫 Instagram is blocking us - ${consecutiveErrors} consecutive blocking errors. Disconnecting immediately...`,
						);
						console.log(
							"\n🔌 Auto-disconnecting due to Instagram blocking (3 consecutive errors)...",
						);
						browser.disconnect().catch(() => {});
						process.exit(0);
					}
				} else {
					// Reset counter for non-blocking errors
					consecutiveErrors = 0;
				}
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

			// Check if we'd exceed session duration after this wait
			const sessionElapsed = Date.now() - sessionStartTime;
			const remainingTime = maxSessionDurationMs - sessionElapsed;
			if (remainingTime < seedWait * 1000 + 60000) {
				// Less than 1 minute buffer after wait, stop now
				logger.info(
					"LIMIT",
					`Approaching session duration limit - stopping gracefully`,
				);
				break;
			}

			logger.info(
				"DELAY",
				`Waiting ${Math.floor(seedWait)}s before next seed... (${Math.floor((maxSessionDurationMs - sessionElapsed) / 60000)} min remaining)`,
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
		// IMPORTANT: Stop AdsPower profile FIRST, then disconnect
		// This ensures the browser window actually closes
		if (profileConfig?.adsPowerProfileId) {
			try {
				logger.info("ACTION", "Stopping AdsPower profile...");
				await stopAdsPowerProfile(profileConfig.adsPowerProfileId);
				console.log("✅ AdsPower profile stopped");
			} catch (e) {
				console.warn(`⚠️  Could not stop AdsPower profile via API: ${e}`);
				console.log("Attempting to disconnect browser anyway...");
			}
		}

		// Then disconnect Puppeteer
		try {
			await browser.disconnect();
			console.log("✅ Browser disconnected");
		} catch (e) {
			console.warn(`⚠️  Could not disconnect browser: ${e}`);
		}
	}
}

main().catch((err) => {
	const errorMessage = err instanceof Error ? err.message : String(err);
	console.error("💥 Discovery failed:", errorMessage);

	// If it's a login timeout, don't exit - keep the process running so browser stays open
	if (errorMessage.includes("Login timeout")) {
		console.log(
			"\n⚠️  Login timeout detected - keeping browser open for inspection",
		);
		console.log(
			"💡 Check the browser window and complete login manually if needed",
		);
		console.log("💡 Press Ctrl+C when done to exit\n");
		// Don't exit - keep process running so browser stays connected
		return;
	}

	process.exit(1);
});
