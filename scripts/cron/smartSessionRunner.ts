/**
 * Smart Session Runner with Fuzzy Targets
 *
 * Runs Instagram sessions with natural, variable DM targets.
 * Implements:
 * - Fuzzy session planning (not equal splits)
 * - Real-time session control
 * - Natural stopping logic
 * - Daily variance factors
 *
 * Usage:
 *   npm run cron:session -- --profile burner1 --session morning
 *   npm run cron:session -- --profile burner1 --session afternoon
 *   npm run cron:session -- --profile burner1 --session evening
 */

import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../../functions/auth/sessionInitializer/sessionInitializer.ts";
import { SessionController } from "../../functions/scheduling/sessionController.ts";
import {
	logSessionPlan,
	planDailySessions,
	recalculateSessions,
	type SessionType,
} from "../../functions/scheduling/sessionPlanner.ts";
import {
	queueCount,
	queueNext,
} from "../../functions/shared/database/database.ts";
import {
	batchEngagements,
	EngagementTracker,
} from "../../functions/shared/engagement/engagementTracker.ts";
import { createLogger } from "../../functions/shared/logger/logger.ts";
import { getGlobalMetricsTracker } from "../../functions/shared/metrics/metricsTracker.ts";
import {
	getProfileById,
	incrementProfileAction,
} from "../../functions/shared/profiles/profileManager.ts";
import { createRun } from "../../functions/shared/runs/runs.ts";
import { warmUpProfile } from "../../functions/timing/warmup/warmup.ts";
import { processFollowingList } from "../scrape.ts";

const logger = createLogger();

interface SessionArgs {
	profileId: string;
	sessionType: SessionType;
	dryRun?: boolean;
}

function parseArgs(): SessionArgs {
	const args = process.argv.slice(2);
	let profileId = "";
	let sessionType: SessionType = "morning";
	let dryRun = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--profile" && args[i + 1]) {
			profileId = args[i + 1];
		}
		if (args[i] === "--session" && args[i + 1]) {
			sessionType = args[i + 1] as SessionType;
		}
		if (args[i] === "--dry-run") {
			dryRun = true;
		}
	}

	if (!profileId) {
		throw new Error("Missing required argument: --profile");
	}

	return { profileId, sessionType, dryRun };
}

/**
 * Run a smart session with fuzzy targets
 */
async function runSmartSession(args: SessionArgs): Promise<void> {
	const { profileId, sessionType, dryRun = false } = args;

	logger.info("SESSION", `🚀 Starting ${sessionType} session for ${profileId}`);
	if (dryRun) {
		logger.warn("SESSION", "⚠️  DRY RUN MODE - No actual actions will be taken");
	}

	// Get profile
	const profile = await getProfileById(profileId);
	if (!profile) {
		logger.error("SESSION", `Profile not found: ${profileId}`);
		process.exit(1);
	}

	logger.info("SESSION", `Profile: @${profile.username} (${profile.type})`);

	// Create run entry for this session
	const runId = await createRun("discover");
	await import("../../functions/shared/runs/runs.ts").then(({ updateRun }) =>
		updateRun(runId, {
			profileId,
			sessionType,
			scheduledTime: new Date().toISOString(), // Use current time as scheduled time
		}),
	);
	logger.info("SESSION", `Created run entry: ${runId}`);

	// Calculate session plans for today
	const dailyGoal = profile.limits.dmsPerDay;
	const dmsSentToday = profile.counters.dmsToday;

	logger.info(
		"SESSION",
		`Daily progress: ${dmsSentToday}/${dailyGoal} DMs sent`,
	);

	// Get session plan
	const sessionNumber =
		sessionType === "morning" ? 1 : sessionType === "afternoon" ? 2 : 3;
	const plans = recalculateSessions(dailyGoal, dmsSentToday, sessionNumber - 1);
	const plan = plans[0];

	if (!plan) {
		logger.error("SESSION", "Could not generate session plan");
		process.exit(1);
	}

	// Log session plan
	logSessionPlan(plan);

	// Create session controller
	const controller = new SessionController(plan);
	const engagementTracker = new EngagementTracker();
	const metricsTracker = getGlobalMetricsTracker();

	let browser: Browser | undefined;
	let page: Page | undefined;

	try {
		// Initialize Instagram session
		logger.info("SESSION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			adsPowerProfileId: profile.adsPowerProfileId,
			profileId: profile.id,
			debug: true,
		});

		browser = session.browser;
		page = session.page;

		logger.info("SESSION", "✓ Session initialized");

		// Warm-up (actions tracked for engagement ratio)
		logger.info("SESSION", "🔥 Warming up profile...");
		await warmUpProfile(page, 1.5, engagementTracker);
		logger.info("SESSION", "✓ Warm-up complete");

		// Main discovery loop with fuzzy target
		logger.info(
			"SESSION",
			`Starting discovery loop (target: ${plan.targetDMs} DMs)`,
		);

		while (controller.shouldContinue()) {
			// Check engagement ratio
			if (!engagementTracker.canPerformOutbound()) {
				const needed = engagementTracker.getRequiredEngagements();
				logger.info("SESSION", `Performing ${needed} engagement actions...`);
				await batchEngagements(page, engagementTracker, needed);
			}

			// Get next seed from queue
			const seed = await queueNext();
			if (!seed) {
				logger.info("SESSION", "Queue empty, ending session");
				break;
			}

			const queueSize = await queueCount();
			logger.info("SESSION", `Processing seed: @${seed} (queue: ${queueSize})`);

			// Process following list
			try {
				await processFollowingList(seed, page, metricsTracker, !dryRun);

				// Update controller stats (approximate - actual DMs tracked in processFollowingList)
				const currentDMs = profile.counters.dmsToday;
				const dmsThisSession = currentDMs - dmsSentToday;

				// Sync controller with actual DMs sent
				while (controller.getStats().dmsSent < dmsThisSession) {
					controller.recordDM();
				}

				controller.recordProfileChecked(true);
			} catch (error) {
				logger.error("SESSION", `Failed to process seed @${seed}: ${error}`);
				controller.recordProfileChecked(false);
			}

			// Log progress
			const stats = controller.getStats();
			logger.info(
				"SESSION",
				`Progress: ${stats.dmsSent}/${plan.targetDMs} DMs, ${stats.profilesChecked} profiles, ${stats.elapsedMinutes.toFixed(1)} min`,
			);

			// Record engagement actions
			engagementTracker.recordOutbound("dm");
			controller.recordEngagement();
		}

		// Session complete
		controller.logResults();

		// Update profile counters
		if (!dryRun) {
			const stats = controller.getStats();
			for (let i = 0; i < stats.dmsSent; i++) {
				await incrementProfileAction(profileId, "dm");
			}
		}

		logger.info("SESSION", "✓ Session completed successfully");
	} catch (error) {
		logger.error("SESSION", `Session failed: ${error}`);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
			logger.info("SESSION", "Browser closed");
		}
	}
}

// Main entry point
const args = parseArgs();
runSmartSession(args)
	.then(() => {
		logger.info("SESSION", "Session runner completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("SESSION", `Session runner failed: ${error}`);
		process.exit(1);
	});
