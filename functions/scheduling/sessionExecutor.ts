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

import type { Browser, Page } from 'puppeteer';
import { initializeInstagramSession } from '../auth/sessionInitializer/sessionInitializer.ts';
import type { ProxyOptimizer } from '../shared/proxy/proxyOptimizer.ts';
import { SessionController } from './sessionController.ts';
import {
  logSessionPlan,
  recalculateSessions,
  type SessionType,
} from './sessionPlanner.ts';
import {
  getCreatorsWithUnscrapedFollowing,
  queueAdd,
  queueCount,
  queueNext,
} from '../shared/database/database.ts';
import { existsSync, readFileSync } from 'fs';
import {
  batchEngagements,
  EngagementTracker,
} from '../shared/engagement/engagementTracker.ts';
import { createLogger } from '../shared/logger/logger.ts';
import { getGlobalMetricsTracker } from '../shared/metrics/metricsTracker.ts';
import { sendSessionFailureAlert } from '../shared/notifications/notificationService.ts';
import {
  getProfileById,
  incrementProfileAction,
} from '../shared/profiles/profileManager.ts';
import { createRun, updateRun } from '../shared/runs/runs.ts';
import { warmUpProfile } from '../timing/warmup/warmup.ts';

const logger = createLogger();

/**
 * Load seeds from file into queue
 */
async function loadSeedsFromFile(
  filePath: string = 'data/seeds.txt',
): Promise<number> {
  try {
    if (!existsSync(filePath)) {
      logger.debug('SEED', `Seeds file not found: ${filePath}`);
      return 0;
    }

    const seedsContent = readFileSync(filePath, 'utf-8');
    const lines = seedsContent.split('\n');
    let seedsLoaded = 0;

    for (const line of lines) {
      const username = line.trim().toLowerCase();
      if (username && !username.startsWith('#')) {
        await queueAdd(username, 100, 'seed');
        seedsLoaded++;
      }
    }

    return seedsLoaded;
  } catch {
    return 0;
  }
}

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

  // Load seeds from file if queue is empty
  let queueSize = await queueCount();
  if (queueSize === 0) {
    const seedsLoaded = await loadSeedsFromFile();
    if (seedsLoaded > 0) {
      logger.info('SEED', `Loaded ${seedsLoaded} seeds from data/seeds.txt`);
      queueSize = await queueCount();
    }
  }

  // If still empty, try to expand from confirmed creators
  if (queueSize === 0) {
    const unscrapedCreators = await getCreatorsWithUnscrapedFollowing();
    if (unscrapedCreators.length > 0) {
      logger.info(
        'SEED',
        `Found ${unscrapedCreators.length} confirmed creators to expand`,
      );
      // Add up to 10 creators to the queue
      for (const creator of unscrapedCreators.slice(0, 10)) {
        await queueAdd(creator, 80, 'creator_expansion');
      }
      queueSize = await queueCount();
    }
  }

  // Check queue has seeds
  if (queueSize === 0) {
    return { valid: false, reason: 'Queue is empty - no seeds to process' };
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

  logger.info('SESSION', `🚀 Starting ${sessionType} session for ${profileId}`);
  if (dryRun) {
    logger.warn(
      'SESSION',
      '⚠️  DRY RUN MODE - No actual actions will be taken',
    );
  }

  // Pre-validate before using proxy bandwidth
  const validation = await preValidateSession(profileId);
  if (!validation.valid) {
    logger.warn('SESSION', `Session skipped: ${validation.reason}`);
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

  logger.info('SESSION', `Profile: @${profile.username} (${profile.type})`);

  // Create run entry
  const runId = await createRun('discover');
  await updateRun(runId, {
    profileId,
    sessionType,
    scheduledTime: new Date().toISOString(),
  });
  logger.info('SESSION', `Created run entry: ${runId}`);

  // Calculate session plan
  const dailyGoal = profile.limits.dmsPerDay;
  const dmsSentToday = profile.counters.dmsToday;

  logger.info(
    'SESSION',
    `Daily progress: ${dmsSentToday}/${dailyGoal} DMs sent`,
  );

  const sessionNumber =
    sessionType === 'morning' ? 1 : sessionType === 'afternoon' ? 2 : 3;
  const plans = recalculateSessions(dailyGoal, dmsSentToday, sessionNumber - 1);
  const plan = plans[0];

  if (!plan) {
    const error = 'Could not generate session plan';
    await updateRun(runId, { status: 'error', errorMessage: error });
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
    logger.info('SESSION', 'Initializing Instagram session...');
    const session = await initializeInstagramSession({
      headless: false, // Visible browser for monitoring
      adsPowerProfileId: profile.adsPowerProfileId,
      profileId: profile.id,
      debug: false, // Reduce screenshot overhead
    });

    browser = session.browser;
    page = session.page;
    proxyOptimizer = session.proxyOptimizer;

    logger.info('SESSION', '✓ Session initialized');

    // Warm-up (actions tracked for engagement ratio)
    logger.info('SESSION', '🔥 Quick warm-up...');
    await warmUpProfile(page, 1.0, engagementTracker);
    logger.info('SESSION', '✓ Warm-up complete');

    // Main discovery loop
    logger.info(
      'SESSION',
      `Starting discovery loop (target: ${plan.targetDMs} DMs)`,
    );

    // Import processFollowingList dynamically to avoid circular deps
    const { processFollowingList } = await import('../../scripts/scrape.ts');

    while (controller.shouldContinue()) {
      const loopStartStats = controller.getStats();
      logger.debug(
        'SESSION',
        `🔄 Loop iteration: ${loopStartStats.dmsSent}/${plan.targetDMs} DMs, ${loopStartStats.profilesChecked} profiles, ${loopStartStats.elapsedMinutes.toFixed(1)} min elapsed`,
      );

      // Check engagement ratio
      if (!engagementTracker.canPerformOutbound()) {
        const needed = engagementTracker.getRequiredEngagements();
        logger.info('SESSION', `📊 Performing ${needed} engagement actions...`);
        await batchEngagements(page, engagementTracker, needed);
      }

      // Get next seed from queue
      const seed = await queueNext();
      if (!seed) {
        const stats = controller.getStats();
        logger.warn(
          'SESSION',
          `⚠️ Queue empty, ending session | Final stats: ${stats.dmsSent} DMs, ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators, ${stats.elapsedMinutes.toFixed(1)} min`,
        );
        break;
      }

      const queueSize = await queueCount();
      logger.info(
        'SESSION',
        `🌱 Processing seed: @${seed} (queue: ${queueSize} remaining)`,
      );

      try {
        const beforeProcessing = controller.getStats();
        // Pass controller.shouldContinue as the checkContinue function
        // This avoids needing cycle tracking from scrape.ts
        // Also pass a callback to track each profile processed and engagements
        await processFollowingList(
          seed,
          page,
          metricsTracker,
          !dryRun,
          () => {
            const shouldContinue = controller.shouldContinue();
            if (!shouldContinue) {
              logger.info(
                'SESSION',
                `🛑 Processing interrupted: controller.shouldContinue() returned false`,
              );
            }
            return shouldContinue;
          },
          (result) => {
            controller.recordProfileChecked(result.wasCreator);
            if (result.hadEngagement) {
              controller.recordEngagement();
            }
          },
        );

        const afterProcessing = controller.getStats();
        const profilesProcessed =
          afterProcessing.profilesChecked - beforeProcessing.profilesChecked;
        const creatorsFound =
          afterProcessing.creatorsFound - beforeProcessing.creatorsFound;

        // Update controller stats
        const currentDMs =
          (await getProfileById(profileId))?.counters.dmsToday || 0;
        const dmsThisSession = currentDMs - dmsSentToday;

        while (controller.getStats().dmsSent < dmsThisSession) {
          controller.recordDM();
        }

        logger.info(
          'SESSION',
          `✅ Seed @${seed} processed: ${profilesProcessed} profiles, ${creatorsFound} creators found`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          'SESSION',
          `❌ Failed to process seed @${seed}: ${errorMessage}`,
        );
        logger.error(
          'SESSION',
          `Error stack: ${error instanceof Error ? error.stack : 'N/A'}`,
        );
      }

      // Log progress
      const stats = controller.getStats();
      logger.info(
        'SESSION',
        `📊 Progress: ${stats.dmsSent}/${plan.targetDMs} DMs (target: ${plan.minAcceptable}-${plan.maxAcceptable}), ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators, ${stats.elapsedMinutes.toFixed(1)} min`,
      );

      engagementTracker.recordOutbound('dm');
      // Note: controller.recordEngagement() is now called per-profile via the callback
    }

    // Log why the loop ended
    const finalStats = controller.getStats();
    const shouldContinueResult = controller.shouldContinue();
    logger.info(
      'SESSION',
      `🛑 Main loop ended | shouldContinue()=${shouldContinueResult} | Final: ${finalStats.dmsSent} DMs, ${finalStats.profilesChecked} profiles, ${finalStats.creatorsFound} creators, ${finalStats.elapsedMinutes.toFixed(1)} min`,
    );

    // Session complete
    controller.logResults();

    // Update profile counters
    if (!dryRun) {
      const stats = controller.getStats();
      for (let i = 0; i < stats.dmsSent; i++) {
        await incrementProfileAction(profileId, 'dm');
      }
    }

    const durationMinutes = (Date.now() - startTime) / 60000;

    // Finalize proxy optimizer and get actual bandwidth stats
    let bandwidthMB = 0;
    if (proxyOptimizer) {
      const proxyStats = await proxyOptimizer.finalize();
      bandwidthMB = proxyStats.estimatedMB;
      logger.info(
        'SESSION',
        `📊 Bandwidth: ${proxyStats.estimatedMB.toFixed(1)}MB used, ${proxyStats.savedMB.toFixed(1)}MB saved (${proxyStats.blockedCount} blocked)`,
      );
      proxyOptimizer = undefined; // Prevent double-finalize in finally block
    }

    // Finalize session metrics with calculated averages
    await metricsTracker.finalizeSessionMetrics();
    metricsTracker.endSession();

    // Check data quality after session
    try {
      const { checkDataQualityAfterSession } = await import('../shared/database/dataQualityMonitor.ts');
      await checkDataQualityAfterSession();
    } catch (error) {
      logger.warn('SESSION', `Failed to check data quality: ${error}`);
    }

    await updateRun(runId, {
      status: 'completed',
      dmsSent: finalStats.dmsSent,
      profilesChecked: finalStats.profilesChecked,
      profilesProcessed: finalStats.profilesChecked, // Use profilesChecked as profilesProcessed
      creatorsFound: finalStats.creatorsFound,
    });

    logger.info('SESSION', `✓ Session completed successfully`);

    return {
      success: true,
      dmsSent: finalStats.dmsSent,
      profilesChecked: finalStats.profilesChecked,
      durationMinutes,
      proxyBandwidthEstimate: bandwidthMB,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('SESSION', `Session failed: ${errorMessage}`);

    // Finalize metrics even on error
    try {
      await metricsTracker.finalizeSessionMetrics();
      metricsTracker.endSession();
    } catch (metricsError) {
      logger.warn('SESSION', `Failed to finalize metrics: ${metricsError}`);
    }

    // Send failure notification
    try {
      await sendSessionFailureAlert(args.profileId, args.sessionType, errorMessage);
    } catch (notifyError) {
      logger.debug('SESSION', `Failed to send failure notification: ${notifyError}`);
    }

    const errorStats = controller.getStats();
    await updateRun(runId, {
      status: 'error',
      errorMessage,
      dmsSent: errorStats.dmsSent,
      profilesChecked: errorStats.profilesChecked,
      profilesProcessed: errorStats.profilesChecked, // Use profilesChecked as profilesProcessed
      creatorsFound: errorStats.creatorsFound,
    });

    return {
      success: false,
      dmsSent: errorStats.dmsSent,
      profilesChecked: errorStats.profilesChecked,
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
      logger.info('SESSION', 'Browser closed');
    }
  }
}
