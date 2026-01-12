/**
 * Session Executor
 *
 * Executes Instagram sessions with proxy bandwidth optimization.
 * Called by NodeScheduler or can be run directly.
 *
 * Proxy Optimization Features:
 * - Pre-validates session before connecting proxy
 * - Uses cached browser data to minimize requests
 * - Tracks bandwidth usage per session
 * - Graceful proxy release on completion
 */

import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../auth/sessionInitializer/sessionInitializer.ts";
import type { ProxyOptimizer } from "../shared/proxy/proxyOptimizer.ts";
import { SessionController } from "./sessionController.ts";
import {
	logSessionPlan,
	recalculateSessions,
	type SessionType,
} from "./sessionPlanner.ts";
import { queueCount, queueNext } from "../shared/database/database.ts";
import {
	batchEngagements,
	EngagementTracker,
} from "../shared/engagement/engagementTracker.ts";
import { createLogger } from "../shared/logger/logger.ts";
import { getGlobalMetricsTracker } from "../shared/metrics/metricsTracker.ts";
import {
	getProfileById,
	incrementProfileAction,
} from "../shared/profiles/profileManager.ts";
import { createRun, updateRun } from "../shared/runs/runs.ts";
import { warmUpProfile } from "../timing/warmup/warmup.ts";

const logger = createLogger();

export interface SessionExecutorArgs {
	profileId: string;
	sessionType: SessionType;
	dryRun?: boolean;
}

export interface SessionResult {
	success: boolean;
	dmsSent: number;
	profilesChecked: number;
	durationMinutes: number;
	error?: string;
	proxyBandwidthEstimate?: number; // MB
}

/**
 * Pre-session validation to avoid wasting proxy bandwidth
 */
async function preValidateSession(profileId: string): Promise<{
	valid: boolean;
	reason?: string;
}> {
	const profile = await getProfileById(profileId);

	if (!profile) {
		return { valid: false, reason: `Profile not found: ${profileId}` };
	}

	// Check if profile is archived
	if (profile.archivedAt) {
		return { valid: false, reason: `Profile is archived: ${profileId}` };
	}

	// Check daily limits
	const dailyGoal = profile.limits.dmsPerDay;
	const dmsSentToday = profile.counters.dmsToday;

	if (dmsSentToday >= dailyGoal) {
		return {
			valid: false,
			reason: `Daily DM limit reached: ${dmsSentToday}/${dailyGoal}`,
		};
	}

	// Check queue has seeds
	const queueSize = await queueCount();
	if (queueSize === 0) {
		return { valid: false, reason: "Queue is empty - no seeds to process" };
	}

	return { valid: true };
}

/**
 * Run a session directly (called by NodeScheduler or manually)
 */
export async function runSmartSessionDirect(
	args: SessionExecutorArgs,
): Promise<SessionResult> {
	const { profileId, sessionType, dryRun = false } = args;
	const startTime = Date.now();

	logger.info("SESSION", `🚀 Starting ${sessionType} session for ${profileId}`);
	if (dryRun) {
		logger.warn("SESSION", "⚠️  DRY RUN MODE - No actual actions will be taken");
	}

	// Pre-validate before using proxy bandwidth
	const validation = await preValidateSession(profileId);
	if (!validation.valid) {
		logger.warn("SESSION", `Session skipped: ${validation.reason}`);
		return {
			success: false,
			dmsSent: 0,
			profilesChecked: 0,
			durationMinutes: 0,
			error: validation.reason,
		};
	}

	const profile = await getProfileById(profileId);
	if (!profile) {
		throw new Error(`Profile not found: ${profileId}`);
	}

	logger.info("SESSION", `Profile: @${profile.username} (${profile.type})`);

	// Create run entry
	const runId = await createRun("discover");
	await updateRun(runId, {
		profileId,
		sessionType,
		scheduledTime: new Date().toISOString(),
	});
	logger.info("SESSION", `Created run entry: ${runId}`);

	// Calculate session plan
	const dailyGoal = profile.limits.dmsPerDay;
	const dmsSentToday = profile.counters.dmsToday;

	logger.info(
		"SESSION",
		`Daily progress: ${dmsSentToday}/${dailyGoal} DMs sent`,
	);

	const sessionNumber =
		sessionType === "morning" ? 1 : sessionType === "afternoon" ? 2 : 3;
	const plans = recalculateSessions(dailyGoal, dmsSentToday, sessionNumber - 1);
	const plan = plans[0];

	if (!plan) {
		const error = "Could not generate session plan";
		await updateRun(runId, { status: "error", errorMessage: error });
		return {
			success: false,
			dmsSent: 0,
			profilesChecked: 0,
			durationMinutes: 0,
			error,
		};
	}

	logSessionPlan(plan);

	const controller = new SessionController(plan);
	const engagementTracker = new EngagementTracker();
	const metricsTracker = getGlobalMetricsTracker();

	let browser: Browser | undefined;
	let page: Page | undefined;
	let proxyOptimizer: ProxyOptimizer | undefined;

	try {
		// Initialize Instagram session (this is where proxy connects)
		logger.info("SESSION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			adsPowerProfileId: profile.adsPowerProfileId,
			profileId: profile.id,
			debug: false, // Reduce screenshot overhead
		});

		browser = session.browser;
		page = session.page;
		proxyOptimizer = session.proxyOptimizer;

		logger.info("SESSION", "✓ Session initialized");

		// Warm-up (actions tracked for engagement ratio)
		logger.info("SESSION", "🔥 Quick warm-up...");
		await warmUpProfile(page, 1.0, engagementTracker);
		logger.info("SESSION", "✓ Warm-up complete");

		// Main discovery loop
		logger.info(
			"SESSION",
			`Starting discovery loop (target: ${plan.targetDMs} DMs)`,
		);

		// Import processFollowingList dynamically to avoid circular deps
		const { processFollowingList } = await import("../../scripts/scrape.ts");

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

			try {
				await processFollowingList(seed, page, metricsTracker, !dryRun);

				// Update controller stats
				const currentDMs =
					(await getProfileById(profileId))?.counters.dmsToday || 0;
				const dmsThisSession = currentDMs - dmsSentToday;

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

		const durationMinutes = (Date.now() - startTime) / 60000;
		const finalStats = controller.getStats();

		// Finalize proxy optimizer and get actual bandwidth stats
		let bandwidthMB = 0;
		if (proxyOptimizer) {
			const proxyStats = await proxyOptimizer.finalize();
			bandwidthMB = proxyStats.estimatedMB;
			logger.info(
				"SESSION",
				`📊 Bandwidth: ${proxyStats.estimatedMB.toFixed(1)}MB used, ${proxyStats.savedMB.toFixed(1)}MB saved (${proxyStats.blockedCount} blocked)`,
			);
			proxyOptimizer = undefined; // Prevent double-finalize in finally block
		}

		await updateRun(runId, {
			status: "completed",
			dmsSent: finalStats.dmsSent,
			profilesChecked: finalStats.profilesChecked,
		});

		logger.info("SESSION", `✓ Session completed successfully`);

		return {
			success: true,
			dmsSent: finalStats.dmsSent,
			profilesChecked: finalStats.profilesChecked,
			durationMinutes,
			proxyBandwidthEstimate: bandwidthMB,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("SESSION", `Session failed: ${errorMessage}`);

		await updateRun(runId, {
			status: "error",
			errorMessage,
		});

		return {
			success: false,
			dmsSent: controller.getStats().dmsSent,
			profilesChecked: controller.getStats().profilesChecked,
			durationMinutes: (Date.now() - startTime) / 60000,
			error: errorMessage,
		};
	} finally {
		// Finalize proxy optimizer if not already done (e.g., on error)
		if (proxyOptimizer) {
			try {
				await proxyOptimizer.finalize();
			} catch {
				// Ignore finalization errors during cleanup
			}
		}

		if (browser) {
			await browser.close();
			logger.info("SESSION", "Browser closed");
		}
	}
}
