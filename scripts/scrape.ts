/**
 * Scout - Instagram Patreon Creator Discovery Agent
 *
 * Flow:
 * 1. Go to seed profile → click Following → open modal
 * 2. Get <li> list items from following modal
 * 3. For each profile (batch of 10):
 *    - Skip if already visited
 *    - Click into profile, read bio
 *    - Keyword/emoji matching on bio (cheap)
 *    - If promising: click linktree, screenshot, vision analysis (expensive)
 * 4. If confirmed creator:
 *    - Check DM thread empty → send DM
 *    - Follow if not following
 *    - Mark in database
 *    - Click their Following → repeat process
 * 5. Pagination: if all 10 visited, scroll modal and get next batch
 */

import { existsSync, readFileSync } from "node:fs";
import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	extractFollowingUsernames,
	openFollowingModal,
	scrollFollowingModal,
} from "../functions/navigation/modalOperations/modalOperations.ts";
import { navigateToProfileAndCheck } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import {
	addFollowingToQueue,
	followUserAccount,
	sendDMToUser,
} from "../functions/profile/profileActions/profileActions.ts";
import {
	analyzeProfileComprehensive,
	type ComprehensiveAnalysisResult,
} from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import {
	CONFIDENCE_THRESHOLD,
	MAX_DMS_PER_DAY,
} from "../functions/shared/config/config.ts";
import {
	performRandomEngagement,
	shouldEngageOnProfile,
} from "../functions/profile/profileActions/randomEngagement.ts";
import { calculateScore } from "../functions/profile/bioMatcher/bioMatcher.ts";
import { getProfileStats } from "../functions/extraction/getProfileStats/getProfileStats.ts";
import {
	getScrollIndex,
	getStats,
	initDb,
	markAsCreator,
	markVisited,
	queueAdd,
	queueCount,
	queueNext,
	updateScrollIndex,
	wasDmSent,
	wasFollowed,
	wasVisited,
} from "../functions/shared/database/database.ts";
// Enhanced logging imports
import { createLoggerWithCycleTracking } from "../functions/shared/logger/logger.ts";
import {
	getGlobalMetricsTracker,
	type MetricsTracker,
	startTimer,
} from "../functions/shared/metrics/metrics.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import {
	getDelay,
	mouseWiggle,
} from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";
import { shortDelay } from "../functions/timing/humanize/humanize.ts";

// NOTE: Database init is async; we run it inside the main entrypoints.

// Enhanced logging setup
const {
	logger,
	cycleManager,
	startCycle,
	endCycle,
	recordError,
	shouldContinue,
} = createLoggerWithCycleTracking(process.env.DEBUG_LOGS === "true");

/**
 * Load seeds from file into queue
 */
export async function loadSeeds(
	filePath: string = "data/seeds.txt",
): Promise<number> {
	try {
		logger.debug("SEED", `Loading seeds from ${filePath}`);

		if (!existsSync(filePath)) {
			logger.warn("SEED", `Seeds file not found: ${filePath}`);
			recordError(`Seeds file not found: ${filePath}`, "loadSeeds", filePath);
			return 0;
		}

		const seedsContent = readFileSync(filePath, "utf-8");
		const lines = seedsContent.split("\n");
		let seedsLoaded = 0;

		for (const line of lines) {
			const username = line.trim().toLowerCase();
			if (username && !username.startsWith("#")) {
				await queueAdd(username, 100, "seed");
				seedsLoaded++;
				logger.debug("SEED", `Loaded seed: @${username}`);
			} else if (username.startsWith("#")) {
				logger.debug("SEED", `Skipping comment: ${username}`);
			}
		}

		logger.info(
			"SEED",
			`Successfully loaded ${seedsLoaded} seeds from ${filePath}`,
		);
		return seedsLoaded;
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		recordError(err, "loadSeeds", filePath);
		return 0;
	}
}

/**
 * Process a single profile: visit, analyze, and take actions if creator.
 */
export async function processProfile(
	username: string,
	page: Page,
	source: string,
	metricsTracker?: MetricsTracker,
	sendDM: boolean = true,
): Promise<void> {
	logger.info("PROFILE", `[${source}] Processing @${username}...`);

	// Start performance timer
	const timer = startTimer(`Profile processing: @${username}`);

	// Track metrics throughout processing
	let visionApiCalls = 0;
	const contentCategories: string[] = [];
	let profileProcessedSuccessfully = false;

	// Variables for summary logging (moved outside try for finally block access)
	let quickScore = 0;
	let confidence = 0;
	let confirmedCreator = false;
	let analysisReason: string | null = null;
	let analysisIndicators: string[] = [];

	// Parse discovery source to extract depth and source profile (moved outside try for finally block access)
	const discoveryDepth = source.split("_").length - 1; // Count underscores as depth
	const sourceProfile = source.includes("_of_")
		? source.split("_of_").pop()
		: undefined;

	try {
		// Skip if already visited
		if (await wasVisited(username)) {
			logger.debug("PROFILE", `Already visited, skipping @${username}`);
			cycleManager.recordWarning(
				"PROFILE_NOT_FOUND",
				"Already visited",
				username,
			);
			return;
		}

		// Navigate to profile and check status
		const [profileDelayMin, profileDelayMax] = getDelay("profile_load");
		const profileDelay =
			profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
		logger.debug(
			"DELAY",
			`Waiting ${Math.floor(profileDelay)}s before profile load...`,
		);
		await sleep(profileDelay * 1000);

		logger.debug("NAVIGATION", `Navigating to @${username} profile`);
		const status = await navigateToProfileAndCheck(page, username, {
			timeout: 15000,
		});

		// Add mouse wiggling for human-like behavior
		await mouseWiggle(page);

		// Check if profile is accessible
		if (status.notFound) {
			logger.warn("PROFILE", `Profile not found: @${username}`);
			await markVisited(username, undefined, undefined, 0);
			cycleManager.recordWarning(
				"PROFILE_NOT_FOUND",
				"Profile not found",
				username,
			);
			return;
		}

		if (status.isPrivate) {
			logger.warn("PROFILE", `Profile is private: @${username}`);
			await markVisited(username, undefined, undefined, 0);
			cycleManager.recordWarning(
				"PROFILE_PRIVATE",
				"Profile is private",
				username,
			);
			return;
		}

		// Session is already initialized and logged in from main function
		logger.debug("AUTH", `Processing profile @${username}`);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `profile_load_${username}`, username);

		await logger.errorWithScreenshot(
			"ERROR",
			`Failed to load profile @${username}: ${errorMessage}`,
			page,
			`profile_load_${username}`,
		);

		// Record error in metrics
		if (metricsTracker) {
			metricsTracker.recordError(username, "profile_load_failed", errorMessage);
		}

		return;
	}

	// Comprehensive profile analysis with advanced link detection
	logger.debug("ANALYSIS", `Starting comprehensive analysis for @${username}`);
	let analysis: ComprehensiveAnalysisResult;
	try {
		analysis = await analyzeProfileComprehensive(page, username);
	} catch (analysisError) {
		const error =
			analysisError instanceof Error
				? analysisError
				: new Error(String(analysisError));
		recordError(error, `comprehensive_analysis_error_${username}`, username);
		await logger.errorWithScreenshot(
			"ERROR",
			`Comprehensive analysis failed for @${username}: ${
				analysisError instanceof Error
					? analysisError.message
					: String(analysisError)
			}`,
			page,
			`comprehensive_analysis_failed_${username}`,
		);
		return;
	}

	if (!analysis.bio) {
		logger.warn("ANALYSIS", `No bio found for @${username}`);
		await markVisited(
			username,
			undefined,
			undefined,
			0,
			undefined,
			undefined,
			analysis.stats?.followers ?? undefined,
			analysis.stats
				? {
						followers: analysis.stats.followers ?? null,
						following: analysis.stats.following ?? null,
						posts: null, // Not available in ComprehensiveAnalysisResult
						ratio: analysis.stats.ratio ?? null,
					}
				: null,
		);
		recordError("No bio found", `comprehensive_analysis_${username}`, username);
		await logger.errorWithScreenshot(
			"ERROR",
			`No bio found for @${username} - profile may be empty or blocked`,
			page,
			`no_bio_${username}`,
		);
		return;
	}

	logger.info(
		"ANALYSIS",
		`Bio: ${analysis.bio.substring(0, 100)}${
			analysis.bio.length > 100 ? "..." : ""
		}`,
	);
	logger.info("ANALYSIS", `Confidence: ${analysis.confidence}%`);
	logger.debug("ANALYSIS", `Is creator: ${analysis.isCreator}`);

	// Quick bio scoring for smart filtering
	quickScore = calculateScore(analysis.bio, username).score;
	logger.debug("ANALYSIS", `Quick bio score: ${quickScore}`);

	// Use the higher of quickScore or analysis.confidence (which includes link analysis)
	const effectiveConfidence = Math.max(quickScore, analysis.confidence);

	// SMART FILTERING: Quick reject low-scoring profiles
	// Only reject if BOTH bio score AND comprehensive analysis confidence are low
	if (effectiveConfidence < 20 && !analysis.isCreator) {
		// Very low score from all signals - quick reject (saves time)
		logger.debug(
			"ANALYSIS",
			`Quick reject: Low combined score (bio: ${quickScore}, analysis: ${analysis.confidence} < 20)`,
		);
		await markVisited(
			username,
			undefined,
			analysis.bio,
			quickScore,
			undefined,
			analysis.confidence,
			analysis.stats?.followers ?? undefined,
			analysis.stats
				? {
						followers: analysis.stats.followers ?? null,
						following: analysis.stats.following ?? null,
						posts: null, // Not available in ComprehensiveAnalysisResult
						ratio: analysis.stats.ratio ?? null,
					}
				: null,
		);
		cycleManager.recordProfileProcessed(username, false);

		// Log quick reject summary
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		logger.info("SUMMARY", `⚡ Quick Reject: @${username}`);
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		logger.info("SUMMARY", `📊 Bio Score: ${quickScore}%`);
		logger.info("SUMMARY", `🎯 Confidence: ${analysis.confidence}%`);
		logger.info("SUMMARY", `❌ Is Creator: NO`);
		logger.info("SUMMARY", `💡 Reason: Very low scores from all signals`);
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		return;
	}

	// RANDOM ENGAGEMENT: Break bot patterns with natural actions
	if (shouldEngageOnProfile(quickScore)) {
		logger.debug("ENGAGEMENT", `Performing random engagement on @${username}`);
		const engagement = await performRandomEngagement(page, username);
		logger.debug(
			"ENGAGEMENT",
			`Action: ${engagement.type}, Duration: ${engagement.duration.toFixed(1)}s, Success: ${engagement.success}`,
		);
	}

	// Mark as visited with bio and confidence score
	await markVisited(
		username,
		undefined,
		analysis.bio,
		quickScore,
		undefined,
		analysis.confidence,
		analysis.stats?.followers ?? undefined,
		analysis.stats
			? {
					followers: analysis.stats.followers ?? null,
					following: analysis.stats.following ?? null,
					posts: null, // Not available in ComprehensiveAnalysisResult
					ratio: analysis.stats.ratio ?? null,
				}
			: null,
	);

	try {
		// Comprehensive analysis already includes advanced link detection
		// Check if creator based on comprehensive analysis results
		confirmedCreator = analysis.isCreator;
		confidence = analysis.confidence;
		analysisReason = analysis.reason;
		analysisIndicators = analysis.indicators || [];

		// Log potential creator indicators (even if confidence is low)
		if (confirmedCreator) {
			const keyIndicators = analysis.indicators.filter(
				(indicator) =>
					indicator.includes("platform icons") ||
					indicator.includes("subscription") ||
					indicator.includes("aggregator") ||
					indicator.includes("creator keywords"),
			);

			// Only log as "CONFIRMED CREATOR" if confidence meets threshold
			if (confidence >= CONFIDENCE_THRESHOLD) {
				logger.info(
					"ANALYSIS",
					`🎯 CONFIRMED CREATOR (confidence: ${confidence}%, reason: ${analysis.reason})`,
				);

				if (keyIndicators.length > 0) {
					logger.info(
						"ANALYSIS",
						`💡 Key evidence: ${keyIndicators.join(" | ")}`,
					);
				}

				// Record metrics for confirmed creator
				if (metricsTracker) {
					// Count vision API calls from comprehensive analysis
					// Comprehensive analysis may use vision for low-confidence links or profile analysis
					const visionCalls = analysis.screenshots.length; // Each screenshot likely involved vision analysis
					for (let i = 0; i < visionCalls; i++) {
						metricsTracker.recordVisionApiCall(0.001); // ~$0.001 per call
						visionApiCalls++; // Increment cumulative counter
					}
					metricsTracker.recordCreatorFound(username, confidence, visionCalls);
				}
			} else {
				// Has creator indicators but confidence is too low
				logger.info(
					"ANALYSIS",
					`⚠️  Potential creator detected (confidence: ${confidence}%, reason: ${analysis.reason}) but below threshold (${CONFIDENCE_THRESHOLD}%)`,
				);
				if (keyIndicators.length > 0) {
					logger.info(
						"ANALYSIS",
						`💡 Key evidence: ${keyIndicators.join(" | ")}`,
					);
				}
			}
		}

		// If not a creator and confidence is too low, skip
		if (!confirmedCreator && confidence < CONFIDENCE_THRESHOLD) {
			logger.debug(
				"ANALYSIS",
				`Profile @${username} analyzed but not a creator (confidence: ${confidence}%, threshold: ${CONFIDENCE_THRESHOLD})`,
			);
			cycleManager.recordProfileProcessed(username, false);
			return;
		}

		// Log profiles that were analyzed but not confirmed as creators
		if (!confirmedCreator) {
			logger.info(
				"ANALYSIS",
				`Profile @${username} analyzed (confidence: ${confidence}%) but not confirmed as creator`,
			);
			cycleManager.recordProfileProcessed(username, false);
			return;
		}

		// Log links found during analysis
		if (analysis.links && analysis.links.length > 0) {
			logger.info("ANALYSIS", `Links found: ${analysis.links.length}`);
		}

		// If confirmed creator, take actions
		if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
			const dmStatus = sendDM ? "" : " - SKIPPING DM";
			const visionCalls = analysis.screenshots.length; // Each screenshot likely involved vision analysis

			logger.info(
				"ACTION",
				`🎉 CONFIRMED CREATOR @${username} (confidence: ${confidence}%, source: ${source}, vision calls: ${visionCalls})${dmStatus}`,
			);
			cycleManager.recordProfileProcessed(username, true);

			// System notification for creator found
			try {
				const { execSync } = await import("child_process");
				execSync(
					`osascript -e 'display notification "Creator found with ${confidence}% confidence" with title "Scout Discovery" subtitle "@${username}" sound name "Glass"'`,
				);
			} catch (e) {
				// Ignore notification errors on non-macOS systems
			}

			// Mark in database
			let proofPath = null;
			try {
				proofPath =
					analysis.links && analysis.links.length > 0
						? await snapshot(page, `creator_${username}`, true) // force: true - functional screenshot
						: null;
				if (proofPath) {
					logger.info("SCREENSHOT", `Creator proof saved: ${proofPath}`);
				}
			} catch (snapshotError) {
				logger.warn(
					"SCREENSHOT",
					`Failed to take creator proof screenshot for @${username}`,
				);
				await logger.errorWithScreenshot(
					"ERROR",
					`Creator proof screenshot failed for @${username}: ${
						snapshotError instanceof Error
							? snapshotError.message
							: String(snapshotError)
					}`,
					page,
					`snapshot_failed_${username}`,
				);
			}
			await markAsCreator(username, confidence, proofPath);
			logger.info(
				"DATABASE",
				`💾 Creator @${username} saved to database (confidence: ${confidence}%)`,
			);

			// System notification for database save
			try {
				const { execSync } = await import("child_process");
				execSync(
					`osascript -e 'display notification "Saved @${username} to database" with title "Scout Discovery" subtitle "${confidence}% confidence"'`,
				);
			} catch (e) {
				// Ignore notification errors on non-macOS systems
			}

			// Send DM (if not already sent and DM sending is enabled)
			if (sendDM && !(await wasDmSent(username))) {
				const [dmDelayMin, dmDelayMax] = getDelay("before_dm");
				const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
				logger.debug("DELAY", `Waiting ${Math.floor(dmWait)}s before DM...`);
				await sleep(dmWait * 1000);

				try {
					await sendDMToUser(page, username, true); // skipNavigation = true (already on profile)
					logger.info("ACTION", `💬 DM sent to @${username}`);
					cycleManager.recordDMSent(username);

					// Record DM sent
					if (metricsTracker) {
						metricsTracker.recordDMSent(username);
					}
				} catch (dmError) {
					const error =
						dmError instanceof Error ? dmError : new Error(String(dmError));
					recordError(error, `dm_send_${username}`, username);
					await logger.errorWithScreenshot(
						"ERROR",
						`DM send failed for @${username}: ${
							dmError instanceof Error ? dmError.message : String(dmError)
						}`,
						page,
						`dm_failed_${username}`,
					);
				}
			} else if (!sendDM) {
				logger.debug("ACTION", `DM sending disabled for @${username}`);
			} else {
				logger.debug("ACTION", `DM already sent to @${username}`);
				cycleManager.recordWarning(
					"DM_ALREADY_SENT",
					"DM already sent",
					username,
				);
			}

			// Follow (if not already following)
			if (!(await wasFollowed(username))) {
				try {
					await followUserAccount(page, username);
					logger.info("ACTION", `👥 Followed @${username}`);
					cycleManager.recordFollowCompleted(username);

					// System notification for follow completed
					try {
						const { execSync } = await import("child_process");
						execSync(
							`osascript -e 'display notification "Followed @${username}" with title "Scout Discovery" sound name "Blow"'`,
						);
					} catch (e) {
						// Ignore notification errors on non-macOS systems
					}

					// Record follow completed
					if (metricsTracker) {
						metricsTracker.recordFollowCompleted(username);
					}
				} catch (followError) {
					const error =
						followError instanceof Error
							? followError
							: new Error(String(followError));
					recordError(error, `follow_${username}`, username);
					await logger.errorWithScreenshot(
						"ERROR",
						`Follow action failed for @${username}: ${
							followError instanceof Error
								? followError.message
								: String(followError)
						}`,
						page,
						`follow_failed_${username}`,
					);
				}
			} else {
				logger.debug("ACTION", `Already following @${username}`);
				cycleManager.recordWarning(
					"ALREADY_FOLLOWING",
					"Already following",
					username,
				);
			}

			// Add their following to queue for expansion
			logger.info("QUEUE", `Adding @${username}'s following to queue...`);
			try {
				const added = await addFollowingToQueue(
					page,
					username,
					`following_of_${username}`,
					20,
				);
				if (added > 0) {
					logger.info("QUEUE", `Added ${added} profiles to queue`);
				}
			} catch (queueError) {
				const error =
					queueError instanceof Error
						? queueError
						: new Error(String(queueError));
				recordError(error, `queue_expansion_${username}`, username);
				await logger.errorWithScreenshot(
					"ERROR",
					`Queue expansion failed for @${username}: ${
						queueError instanceof Error
							? queueError.message
							: String(queueError)
					}`,
					page,
					`queue_expansion_failed_${username}`,
				);
			}
		} else {
			logger.debug(
				"ANALYSIS",
				`Not confirmed (confidence: ${confidence}% < ${CONFIDENCE_THRESHOLD}%)`,
			);
			cycleManager.recordProfileProcessed(username, false);
		}

		// Mark profile as processed successfully
		profileProcessedSuccessfully = true;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `profile_processing_${username}`, username);

		if (metricsTracker) {
			metricsTracker.recordError(
				username,
				"profile_processing_failed",
				errorMessage,
			);
		}

		await logger.errorWithScreenshot(
			"ERROR",
			`Critical error processing @${username}: ${errorMessage}`,
			page,
			`profile_critical_error_${username}`,
		);

		throw err; // Re-throw to let caller handle
	} finally {
		// Log summary report (always show, even if there was an error)
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		logger.info("SUMMARY", `📊 Profile Analysis Complete: @${username}`);
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
		logger.info("SUMMARY", `📊 Bio Score: ${quickScore}%`);
		logger.info("SUMMARY", `🎯 Confidence: ${confidence}%`);
		logger.info(
			"SUMMARY",
			`${confirmedCreator ? "✅" : "❌"} Is Creator: ${confirmedCreator ? "YES" : "NO"}`,
		);
		if (analysisReason) {
			logger.info("SUMMARY", `💡 Reason: ${analysisReason}`);
		}
		if (analysisIndicators.length > 0) {
			logger.info("SUMMARY", `🔍 Key Indicators:`);
			for (const indicator of analysisIndicators.slice(0, 3)) {
				logger.info("SUMMARY", `   • ${indicator}`);
			}
		}
		if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
			logger.info(
				"SUMMARY",
				`🎯 Action: AUTO-APPROVED (confidence ≥ ${CONFIDENCE_THRESHOLD}%)`,
			);
		} else if (confirmedCreator) {
			logger.info(
				"SUMMARY",
				`⚠️  Action: DETECTED but below threshold (${CONFIDENCE_THRESHOLD}%)`,
			);
		} else {
			logger.info("SUMMARY", `❌ Action: NOT A CREATOR`);
		}
		if (profileProcessedSuccessfully) {
			logger.info("SUMMARY", `✅ Processing: SUCCESSFUL`);
		} else {
			logger.info("SUMMARY", `⚠️  Processing: COMPLETED WITH ERRORS`);
		}
		logger.info("SUMMARY", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

		// Record profile visit metrics with complete data
		if (metricsTracker) {
			const finalProcessingTime = timer.end();
			metricsTracker.recordProfileVisit(
				username,
				finalProcessingTime,
				source,
				discoveryDepth,
				sourceProfile,
				contentCategories,
				visionApiCalls,
			);
		} else {
			timer.end();
		}
	}
}

/**
 * Process the following list of a seed profile.
 */
export async function processFollowingList(
	seedUsername: string,
	page: Page,
	metricsTracker?: MetricsTracker,
	sendDM: boolean = true,
	checkContinue: () => boolean = shouldContinue,
): Promise<void> {
	logger.info("PROFILE", `Processing following list of @${seedUsername}`);

	// Navigate to seed profile
	try {
		logger.debug("NAVIGATION", `Navigating to seed profile @${seedUsername}`);
		const status = await navigateToProfileAndCheck(page, seedUsername, {
			timeout: 15000,
		});

		if (status.notFound || status.isPrivate) {
			const reason = status.notFound ? "not found" : "private";
			logger.warn("PROFILE", `Seed profile @${seedUsername} is ${reason}`);
			cycleManager.recordWarning(
				status.notFound ? "PROFILE_NOT_FOUND" : "PROFILE_PRIVATE",
				`Seed profile is ${reason}`,
				seedUsername,
			);
			return;
		}

		// Session is already initialized and logged in from main function
		logger.debug("AUTH", `Processing seed profile @${seedUsername}`);
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `seed_profile_load_${seedUsername}`, seedUsername);
		await logger.errorWithScreenshot(
			"ERROR",
			`Failed to load seed profile @${seedUsername}: ${
				err instanceof Error ? err.message : String(err)
			}`,
			page,
			`seed_profile_load_${seedUsername}`,
		);
		return;
	}

	// Check if profile has any following before trying to open modal
	const stats = await getProfileStats(page);
	if (stats.following === 0) {
		logger.warn(
			"PROFILE",
			`@${seedUsername} has 0 following, skipping following list`,
		);
		cycleManager.recordWarning(
			"PROFILE_NOT_FOUND",
			"Profile has 0 following",
			seedUsername,
		);
		return;
	}
	logger.debug(
		"PROFILE",
		`@${seedUsername} has ${stats.following} following, ${stats.followers} followers`,
	);

	// Open following modal
	logger.debug("NAVIGATION", `Opening following modal for @${seedUsername}`);
	const modalOpened = await openFollowingModal(page);
	if (!modalOpened) {
		recordError(
			"Modal opening failed",
			`modal_open_${seedUsername}`,
			seedUsername,
		);
		await logger.errorWithScreenshot(
			"ERROR",
			`Could not open following modal for @${seedUsername}`,
			page,
			`modal_open_${seedUsername}`,
		);
		return;
	}
	logger.debug("NAVIGATION", `Following modal opened successfully`);

	// Check if the modal is empty (no people followed)
	const { isFollowingModalEmpty } = await import(
		"../../functions/navigation/modalOperations/modalOperations.ts"
	);
	const isEmpty = await isFollowingModalEmpty(page);
	if (isEmpty) {
		logger.warn(
			"PROFILE",
			`@${seedUsername} has an empty following list (no people followed), skipping seed`,
		);
		cycleManager.recordWarning(
			"PROFILE_NOT_FOUND",
			"Following list is empty",
			seedUsername,
		);
		// Close the modal before returning
		await page.keyboard.press("Escape");
		await shortDelay(0.5, 1);
		return;
	}

	// Get current scroll index
	let scrollIndex = await getScrollIndex(seedUsername);
	logger.debug("NAVIGATION", `Starting from scroll index: ${scrollIndex}`);

	// If we've scrolled before, scroll to that position
	if (scrollIndex > 0) {
		logger.debug("NAVIGATION", `Scrolling to position ${scrollIndex}...`);
		for (let i = 0; i < Math.floor(scrollIndex / 500); i++) {
			await scrollFollowingModal(page, 500);
		}
		await shortDelay(1, 2);
	}

	let processedInBatch = 0;
	const batchSize = 10;
	let consecutiveAllVisited = 0;
	const maxConsecutiveAllVisited = 3;
	let lastExtractedUsernames: string[] | null = null; // Track last extraction to detect stuck modal

	while (consecutiveAllVisited < maxConsecutiveAllVisited && checkContinue()) {
		try {
			// Extract usernames from modal
			logger.debug("NAVIGATION", `Extracting batch of ${batchSize} usernames`);
			const usernames = await extractFollowingUsernames(page, batchSize);

			if (usernames.length === 0) {
				logger.debug("NAVIGATION", "No more usernames in modal");
				// Take screenshot to debug empty username extraction
				await logger.errorWithScreenshot(
					"ERROR",
					`No usernames found in modal for @${seedUsername} at scroll position ${scrollIndex}`,
					page,
					`empty_usernames_${seedUsername}_${scrollIndex}`,
				);
				break;
			}

			logger.info(
				"QUEUE",
				`Processing batch ${Math.floor(scrollIndex / 500) + 1} with ${
					usernames.length
				} profiles (scroll position: ${scrollIndex})`,
			);
			for (const u of usernames) {
				logger.debug("QUEUE", `  - @${u}`);
			}

			// Process each username
			let allVisited = true;
			for (const username of usernames) {
				if (!(await wasVisited(username))) {
					allVisited = false;

					// Close the modal before visiting profile
					logger.debug("NAVIGATION", `Closing modal to visit @${username}`);
					await page.keyboard.press("Escape");
					await shortDelay(0.5, 1); // brief delay after modal close

					try {
						await processProfile(
							username,
							page,
							`following_of_${seedUsername}`,
							metricsTracker,
							sendDM,
						);
						processedInBatch++;
					} catch (profileError) {
						const error =
							profileError instanceof Error
								? profileError
								: new Error(String(profileError));
						recordError(error, `profile_processing_${username}`, username);
						logger.warn(
							"ERROR",
							`Failed to process @${username}, continuing...`,
						);
						await logger.errorWithScreenshot(
							"ERROR",
							`Profile processing failed for @${username}: ${
								profileError instanceof Error
									? profileError.message
									: String(profileError)
							}`,
							page,
							`profile_processing_failed_${username}`,
						);
					}

					// Re-open the following modal
					logger.debug("NAVIGATION", `Re-opening following modal`);
					const status = await navigateToProfileAndCheck(page, seedUsername, {
						timeout: 15000,
					});
					if (!status.notFound && !status.isPrivate) {
						await openFollowingModal(page);

						// Scroll back to position if needed
						if (scrollIndex > 0) {
							logger.debug(
								"NAVIGATION",
								`Scrolling back to position ${scrollIndex}...`,
							);
							for (let i = 0; i < Math.floor(scrollIndex / 500); i++) {
								await scrollFollowingModal(page, 500);
							}
							await shortDelay(1, 2);
						}
					} else {
						logger.warn(
							"NAVIGATION",
							`Failed to re-open modal for @${seedUsername}`,
						);
						await logger.errorWithScreenshot(
							"ERROR",
							`Failed to re-open following modal for @${seedUsername} after profile visit`,
							page,
							`modal_reopen_failed_${seedUsername}`,
						);
					}
				} else {
					logger.info("PROFILE", `⏭️  @${username} already visited, skipping`);
				}
			}

			// If all in batch were already visited, scroll for more
			if (allVisited) {
				consecutiveAllVisited++;
				logger.info(
					"NAVIGATION",
					`⚠️  All ${usernames.length} profiles in batch already visited (${consecutiveAllVisited}/${maxConsecutiveAllVisited}) - scrolling for more...`,
				);

				// Check if we're getting the same usernames (stuck modal)
				if (
					lastExtractedUsernames &&
					JSON.stringify(lastExtractedUsernames.sort()) ===
						JSON.stringify(usernames.sort())
				) {
					consecutiveAllVisited = maxConsecutiveAllVisited; // Force exit
					logger.warn(
						"NAVIGATION",
						`🔄 Detected duplicate extraction - modal appears stuck. Ending extraction for @${seedUsername}`,
					);
				} else {
					lastExtractedUsernames = [...usernames];
					await scrollFollowingModal(page, 500);
					scrollIndex += 500;
					await updateScrollIndex(seedUsername, scrollIndex);
					await shortDelay(1, 2);
				}
			} else {
				consecutiveAllVisited = 0;
				lastExtractedUsernames = [...usernames];
				// Processed new profiles, continue with next batch
			}

			// Safety: don't process too many in one go
			if (processedInBatch >= 50) {
				logger.warn("PROFILE", "Processed 50 profiles, pausing...");
				break;
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			recordError(
				error,
				`following_batch_processing_${seedUsername}`,
				seedUsername,
			);
			logger.error(
				"ERROR",
				`Batch processing failed for @${seedUsername}, stopping`,
			);
			await logger.errorWithScreenshot(
				"ERROR",
				`Batch processing failed for @${seedUsername}: ${
					err instanceof Error ? err.message : String(err)
				}`,
				page,
				`batch_processing_failed_${seedUsername}`,
			);
			break;
		}
	}

	logger.info(
		"PROFILE",
		`Finished processing following list of @${seedUsername}`,
	);
	logger.info("PROFILE", `Processed ${processedInBatch} new profiles`);
}

/**
 * Run the main scrape loop
 */
export async function runScrapeLoop(
	page: Page,
	metricsTracker?: MetricsTracker,
): Promise<void> {
	let dmsSent = 0;
	let seedsProcessed = 0;

	logger.info("CYCLE", "Starting main scrape loop");

	while (dmsSent < MAX_DMS_PER_DAY && shouldContinue()) {
		// Get next profile from queue
		const target = await queueNext();

		if (!target) {
			const [waitMin, waitMax] = getDelay("queue_empty");
			const waitTime = waitMin + Math.random() * (waitMax - waitMin);
			logger.debug(
				"QUEUE",
				`Queue empty - sleeping ${Math.floor(waitTime)}s...`,
			);
			await sleep(waitTime * 1000);
			continue;
		}

		seedsProcessed++;
		logger.info("QUEUE", `Queue: ${await queueCount()} remaining`);
		logger.info("SEED", `Processing seed #${seedsProcessed}: @${target}`);

		try {
			// Process their following list
			await processFollowingList(
				target,
				page,
				metricsTracker,
				true,
				shouldContinue,
			); // sendDM = true
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			recordError(error, `seed_processing_${target}`, target);
			logger.error(
				"ERROR",
				`Failed to process seed @${target}, continuing to next`,
			);
			// Note: Screenshot will be taken by processFollowingList if it fails
		}

		// Print stats
		const stats = await getStats();
		logger.info(
			"STATS",
			`Progress: Visited ${stats.total_visited} | Creators: ${stats.confirmed_creators} | DMs: ${stats.dms_sent} | Queue: ${stats.queue_size}`,
		);

		dmsSent = stats.dms_sent;

		// Check if we've hit DM limit
		if (dmsSent >= MAX_DMS_PER_DAY) {
			logger.info("LIMIT", `Reached daily DM limit (${MAX_DMS_PER_DAY})`);
			break;
		}

		// Long delay between seed profiles
		const [seedDelayMin, seedDelayMax] = getDelay("between_seeds");
		const seedWait =
			seedDelayMin + Math.random() * (seedDelayMax - seedDelayMin);
		logger.debug(
			"DELAY",
			`Waiting ${Math.floor(seedWait)}s before next seed...`,
		);
		await sleep(seedWait * 1000);
	}

	const stats = await getStats();
	logger.info(
		"STATS",
		`Session complete! Total visited: ${stats.total_visited}`,
	);
	logger.info("STATS", `Confirmed creators: ${stats.confirmed_creators}`);
	logger.info("STATS", `DMs sent: ${stats.dms_sent}`);
	logger.info("STATS", `Seeds processed: ${seedsProcessed}`);

	// Log cycle summary
	const cycleStatus = dmsSent >= MAX_DMS_PER_DAY ? "COMPLETED" : "INTERRUPTED";
	const reason =
		dmsSent >= MAX_DMS_PER_DAY ? "DM limit reached" : "Cycle interrupted";
	endCycle(cycleStatus, reason);
}

/**
 * Run the main scrape loop (WITHOUT sending DMs)
 * Only discovers and follows creators, skips DM engagement
 */
export async function runScrapeLoopWithoutDM(
	page: Page,
	metricsTracker?: MetricsTracker,
	options?: {
		maxSeeds?: number;
		shouldContinue?: () => boolean;
	},
): Promise<void> {
	let seedsProcessed = 0;
	const maxSeeds = options?.maxSeeds ?? 100;
	const checkContinue = options?.shouldContinue ?? shouldContinue;

	logger.info("CYCLE", "Starting main scrape loop (no DM mode)");

	while (checkContinue() && seedsProcessed < maxSeeds) {
		// Get next profile from queue
		const target = await queueNext();

		if (!target) {
			const [waitMin, waitMax] = getDelay("queue_empty");
			const waitTime = waitMin + Math.random() * (waitMax - waitMin);
			logger.debug(
				"QUEUE",
				`Queue empty - sleeping ${Math.floor(waitTime)}s...`,
			);
			await sleep(waitTime * 1000);
			continue;
		}

		seedsProcessed++;
		logger.info("QUEUE", `Queue: ${await queueCount()} remaining`);
		logger.info(
			"SEED",
			`Processing seed #${seedsProcessed}: @${target} (no DM mode)`,
		);

		try {
			// Process their following list
			await processFollowingList(
				target,
				page,
				metricsTracker,
				false,
				checkContinue,
			); // sendDM = false
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			recordError(error, `seed_processing_${target}`, target);
			logger.error(
				"ERROR",
				`Failed to process seed @${target}, continuing to next`,
			);
			// Note: Screenshot will be taken by processFollowingList if it fails
		}

		// Print stats (without DM count)
		const stats = await getStats();
		logger.info(
			"STATS",
			`Progress: Visited ${stats.total_visited} | Creators: ${stats.confirmed_creators} | Queue: ${stats.queue_size}`,
		);

		// Long delay between seed profiles
		const [seedDelayMin, seedDelayMax] = getDelay("between_seeds");
		const seedWait =
			seedDelayMin + Math.random() * (seedDelayMax - seedDelayMin);
		logger.debug(
			"DELAY",
			`Waiting ${Math.floor(seedWait)}s before next seed...`,
		);
		await sleep(seedWait * 1000);
	}

	const stats = await getStats();
	logger.info(
		"STATS",
		`Discovery session complete! Total visited: ${stats.total_visited}`,
	);
	logger.info("STATS", `Confirmed creators: ${stats.confirmed_creators}`);
	logger.info("STATS", `Seeds processed: ${seedsProcessed}`);

	// Log cycle summary
	endCycle(
		"COMPLETED",
		`Discovery completed: ${seedsProcessed} seeds processed`,
	);
}

/**
 * Main scrape function - does the full automation flow (WITHOUT sending DMs)
 * @param debug - If true, enables logging output
 */
export async function scrape(debug: boolean = false): Promise<void> {
	logger.info(
		"ACTION",
		"🚀 Scout - Instagram Patreon Creator Discovery Agent",
	);
	logger.info("SYSTEM", `Debug mode: ${debug}`);

	// Initialize metrics tracking
	const metricsTracker = getGlobalMetricsTracker();
	logger.info(
		"METRICS",
		`Started session tracking: ${metricsTracker.getSessionId()}`,
	);

	let browser: Browser | null = null;
	let cycleId: string | null = null;

	try {
		// Initialize session (browser, page, and login)
		logger.info("ACTION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			debug: debug,
		});
		browser = session.browser;
		const page = session.page;
		logger.info("ACTION", "✅ Session initialized successfully!");

		// Load seeds
		const seedsLoaded = await loadSeeds();
		if (seedsLoaded === 0) {
			logger.warn("QUEUE", "❌ No data/seeds.txt found or no seeds loaded!");
			endCycle("FAILED", "No seeds loaded");
			await browser.close();
			return;
		}
		logger.info("QUEUE", `📋 Loaded ${seedsLoaded} seeds`);

		// Start cycle tracking
		cycleId = startCycle("batch_scraping", seedsLoaded * 50); // Estimate profiles to process
		logger.info(
			"CYCLE",
			`Started cycle ${cycleId} with estimated ${seedsLoaded * 50} profiles`,
		);

		// Run main processing loop
		await runScrapeLoop(page, metricsTracker);

		// End metrics session
		metricsTracker.endSession();
		const finalMetrics = metricsTracker.getSessionMetrics();
		logger.info(
			"METRICS",
			`✅ Session completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}, DMs: ${finalMetrics.dmsSent}`,
		);

		endCycle("COMPLETED");
		await browser.close();
		logger.info("ACTION", "🎉 Scraping session completed successfully");
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, "scrape_fatal_error");

		endCycle("FAILED", errorMessage);

		logger.error("FATAL", `💥 Fatal error in scrape: ${errorMessage}`);

		if (browser) {
			try {
				logger.debug("SYSTEM", "Attempting to take fatal error screenshot...");
				const page = await browser.newPage().catch(() => null);
				if (page) {
					await logger.errorWithScreenshot(
						"ERROR",
						`Fatal error in scrape: ${errorMessage}`,
						page,
						"scrape_fatal_error",
					);
				}
			} catch (screenshotError) {
				logger.error(
					"ERROR",
					`Failed to take fatal error screenshot: ${screenshotError}`,
				);
			}
			await browser.close();
		} else {
			console.error("💥 Fatal error before browser creation:", err);
		}
		throw err;
	}
}

/**
 * Main scrape function - does the full automation flow (WITHOUT sending DMs)
 * This function discovers creators but doesn't send DMs - useful for passive discovery.
 * @param debug - If true, enables logging output
 */
export async function scrapeWithoutDM(debug: boolean = false): Promise<void> {
	logger.info(
		"ACTION",
		"🔍 Scout - Instagram Patreon Creator Discovery Agent (Discovery Mode - No DMs)",
	);
	logger.info("SYSTEM", `Debug mode: ${debug}`);

	// Initialize metrics tracking
	const metricsTracker = getGlobalMetricsTracker();
	logger.info(
		"METRICS",
		`Started discovery session tracking: ${metricsTracker.getSessionId()}`,
	);

	let browser: Browser | null = null;
	let cycleId: string | null = null;

	try {
		// Initialize session (browser, page, and login)
		logger.info("ACTION", "Initializing Instagram session...");
		const session = await initializeInstagramSession({
			headless: true,
			debug: debug,
		});
		browser = session.browser;
		const page = session.page;
		logger.info("ACTION", "✅ Session initialized successfully!");

		// Load seeds
		const seedsLoaded = await loadSeeds();
		if (seedsLoaded === 0) {
			logger.warn("QUEUE", "❌ No data/seeds.txt found or no seeds loaded!");
			endCycle("FAILED", "No seeds loaded");
			await browser.close();
			return;
		}
		logger.info("QUEUE", `📋 Loaded ${seedsLoaded} seeds`);

		// Start cycle tracking
		cycleId = startCycle("batch_discovery", seedsLoaded * 50); // Estimate profiles to process
		logger.info(
			"CYCLE",
			`Started discovery cycle ${cycleId} with estimated ${
				seedsLoaded * 50
			} profiles`,
		);

		// Run main processing loop (WITHOUT DMs)
		await runScrapeLoopWithoutDM(page, metricsTracker);

		// End metrics session
		metricsTracker.endSession();
		const finalMetrics = metricsTracker.getSessionMetrics();
		logger.info(
			"METRICS",
			`✅ Discovery session completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}`,
		);

		endCycle("COMPLETED", "Discovery session completed");
		await browser.close();
		logger.info("ACTION", "🔍 Discovery session completed successfully");
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, "scrape_discovery_fatal_error");

		endCycle("FAILED", errorMessage);

		logger.error("FATAL", `💥 Fatal error in discovery mode: ${errorMessage}`);

		if (browser) {
			try {
				logger.debug("SYSTEM", "Attempting to take fatal error screenshot...");
				const page = await browser.newPage().catch(() => null);
				if (page) {
					await logger.errorWithScreenshot(
						"ERROR",
						`Fatal error in discovery mode: ${errorMessage}`,
						page,
						"scrape_discovery_fatal_error",
					);
				}
			} catch (screenshotError) {
				logger.error(
					"ERROR",
					`Failed to take fatal error screenshot: ${screenshotError}`,
				);
			}
			await browser.close();
		} else {
			console.error("💥 Fatal error before browser creation:", err);
		}
		throw err;
	}
}

// Run if executed directly
if (
	import.meta.url.endsWith(process.argv[1]?.replace(process.cwd(), "") || "")
) {
	const debug = process.argv.includes("--debug") || process.argv.includes("-d");
	const noDM =
		process.argv.includes("--no-dm") || process.argv.includes("--discovery");

	if (noDM) {
		console.log("🔍 Running in DISCOVERY MODE (no DMs will be sent)");
		scrapeWithoutDM(debug).catch((err) => {
			console.error(err);
			process.exit(1);
		});
	} else {
		console.log("🚀 Running in FULL MODE (will send DMs to creators)");
		scrape(debug).catch((err) => {
			console.error(err);
			process.exit(1);
		});
	}
}
