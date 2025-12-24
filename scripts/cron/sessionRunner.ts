/**
 * Cron Session Runner
 *
 * Entry point for cron jobs to run automated sessions.
 * Usage: tsx scripts/cron/sessionRunner.ts --profile=<profile-id> --type=<morning|afternoon|evening>
 */
import { initializeInstagramSession } from "../../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	getCurrentSessionType,
	getGlobalScheduler,
	type SessionType,
} from "../../functions/scheduling/scheduler.ts";
import {
	batchEngagements,
	getGlobalEngagementTracker,
} from "../../functions/shared/engagement/engagementTracker.ts";
import {
	getLimitStatus,
	logLimitStatus,
} from "../../functions/shared/limits/actionLimits.ts";
import { createLogger } from "../../functions/shared/logger/logger.ts";
import {
	getProfileById,
	needsCounterReset,
	resetDailyCounters,
} from "../../functions/shared/profiles/profileManager.ts";
import {
	needsWarmup,
	warmUpProfile,
} from "../../functions/timing/warmup/warmup.ts";

const logger = createLogger(true);

interface SessionArgs {
	profileId: string;
	sessionType: SessionType;
	durationMinutes?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): SessionArgs {
	const args = process.argv.slice(2);
	const result: Partial<SessionArgs> = {};

	for (const arg of args) {
		if (arg.startsWith("--profile=")) {
			result.profileId = arg.split("=")[1];
		} else if (arg.startsWith("--type=")) {
			result.sessionType = arg.split("=")[1] as SessionType;
		} else if (arg.startsWith("--duration=")) {
			result.durationMinutes = parseInt(arg.split("=")[1], 10);
		}
	}

	if (!result.profileId) {
		throw new Error("Missing required argument: --profile=<profile-id>");
	}

	return {
		profileId: result.profileId,
		sessionType: result.sessionType || getCurrentSessionType(),
		durationMinutes: result.durationMinutes,
	};
}

/**
 * Run a session for a profile
 */
async function runSession(args: SessionArgs): Promise<void> {
	const { profileId, sessionType, durationMinutes } = args;

	logger.info(
		"SESSION",
		`Starting ${sessionType} session for profile ${profileId}`,
	);

	const scheduler = getGlobalScheduler();
	const engagementTracker = getGlobalEngagementTracker();

	// Get profile
	const profile = await getProfileById(profileId);
	if (!profile) {
		logger.error("SESSION", `Profile not found: ${profileId}`);
		process.exit(1);
	}

	// Check if we need to reset daily counters
	if (needsCounterReset(profile)) {
		logger.info("SESSION", "Resetting daily counters...");
		await resetDailyCounters();
	}

	// Check if profile can have another session
	const canHaveSession = await scheduler.canHaveSession(profileId);
	if (!canHaveSession) {
		logger.info("SESSION", "Profile has reached daily session limit");
		process.exit(0);
	}

	// Log limit status
	logLimitStatus(profile);

	// Calculate session duration
	const duration = durationMinutes || scheduler.getSessionDuration();
	const sessionEndTime = Date.now() + duration * 60 * 1000;

	// Schedule the session
	const sessionId = await scheduler.scheduleSession(profileId, duration);
	logger.info("SESSION", `Session ID: ${sessionId}, Duration: ${duration} min`);

	let browser: import("puppeteer").Browser | undefined;
	try {
		// Initialize session
		logger.info("SESSION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			adsPowerProfileId: profile.adsPowerProfileId,
			debug: true,
		});
		browser = session.browser;
		const page = session.page;

		// Warm-up if needed
		if (needsWarmup(profile.sessions.lastSessionAt)) {
			logger.info("SESSION", "Performing warm-up...");
			await warmUpProfile(page);
		}

		// Initial engagement batch
		logger.info("SESSION", "Performing initial engagement batch...");
		await batchEngagements(page, engagementTracker);

		// Main loop - run until session time expires
		let actionsPerformed = 0;
		while (Date.now() < sessionEndTime) {
			// Check limits
			const limitStatus = getLimitStatus(profile);

			if (!limitStatus.canFollow && !limitStatus.canDm) {
				logger.info(
					"SESSION",
					"All action limits reached, ending session early",
				);
				break;
			}

			// Check engagement ratio
			if (!engagementTracker.canPerformOutbound()) {
				const needed = engagementTracker.getRequiredEngagements();
				logger.info(
					"SESSION",
					`Need ${needed} more engagements before outbound`,
				);
				await batchEngagements(page, engagementTracker, needed);
			}

			// TODO: Run actual scraping/following/DM logic here
			// For now, just do engagement
			await batchEngagements(page, engagementTracker, 5);
			actionsPerformed += 5;

			// Log progress
			engagementTracker.logStatus();

			// Check time
			const remainingTime = Math.floor((sessionEndTime - Date.now()) / 1000);
			if (remainingTime < 60) {
				logger.info("SESSION", "Less than 1 minute remaining, wrapping up");
				break;
			}
		}

		// End session
		await scheduler.endSession(sessionId, {
			engagements: engagementTracker.getTotalEngagement(),
			outbound: engagementTracker.getTotalOutbound(),
			totalActions: actionsPerformed,
		});

		logger.info(
			"SESSION",
			`Session completed: ${actionsPerformed} actions in ${duration} minutes`,
		);
	} catch (error) {
		logger.error("SESSION", `Session failed: ${error}`);
		await scheduler.endSession(sessionId);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
}

// Main entry point
runSession(parseArgs())
	.then(() => {
		logger.info("SESSION", "Session runner completed successfully");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("SESSION", `Session runner failed: ${error}`);
		process.exit(1);
	});
