/**
 * Scout - Instagram Patreon Creator Discovery Agent
 *
 * OPTIMIZED Flow (streamlined for efficiency):
 * 1. Go to seed profile → click Following → open modal (ONCE)
 * 2. Extract ALL unvisited usernames from modal (with scrolling)
 * 3. Close modal (ONCE)
 * 4. For each username (sequential, no returning to seed):
 *    - Navigate directly to profile
 *    - Analyze bio + keyword/emoji matching (cheap)
 *    - If promising: click linktree, screenshot, vision analysis (expensive)
 * 5. If confirmed creator:
 *    - Check DM thread empty → send DM
 *    - Follow if not following
 *    - Mark in database
 *    - Add their following to queue for later expansion
 */

import { existsSync, readFileSync } from "node:fs";
import type { Browser, Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { getProfileStats } from "../functions/extraction/getProfileStats/getProfileStats.ts";
import { humanScroll } from "../functions/navigation/humanInteraction/humanInteraction.ts";
import {
	clickUsernameInModal,
	extractFollowingUsernames,
	isFollowingModalEmpty,
	openFollowingModal,
	scrollFollowingModal,
} from "../functions/navigation/modalOperations/modalOperations.ts";
import {
	checkProfileStatus,
	navigateToProfileAndCheck,
} from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { calculateScore } from "../functions/profile/bioMatcher/bioMatcher.ts";
import {
	addFollowingToQueue,
	followUserAccount,
	sendDMToUser,
} from "../functions/profile/profileActions/profileActions.ts";
import {
	performRandomEngagement,
	shouldEngageOnProfile,
} from "../functions/profile/profileActions/randomEngagement.ts";
import {
	analyzeProfileComprehensive,
	type ComprehensiveAnalysisResult,
} from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import {
	CONFIDENCE_THRESHOLD,
	MAX_DMS_PER_DAY,
} from "../functions/shared/config/config.ts";
import {
	getScrollIndex,
	getStats,
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
	shortDelay,
} from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";
import { warmUpProfile } from "../functions/timing/warmup/warmup.ts";

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

export interface ProfileResult {
	wasCreator: boolean;
	hadEngagement: boolean;
}

/**
 * Process a single profile: visit, analyze, and take actions if creator.
 * Returns { wasCreator, hadEngagement } for accurate session tracking.
 */
export async function processProfile(
	username: string,
	page: Page,
	source: string,
	metricsTracker?: MetricsTracker,
	sendDM: boolean = true,
	skipNavigation: boolean = false,
): Promise<ProfileResult> {
	// Start performance timer
	const timer = startTimer(`Profile processing: @${username}`);

	// Track metrics throughout processing
	let visionApiCalls = 0;
	const contentCategories: string[] = [];

	// Variables for result logging
	let quickScore = 0;
	let confidence = 0;
	let confirmedCreator = false;
	let hadEngagement = false;

	// Parse discovery source to extract depth and source profile (moved outside try for finally block access)
	const discoveryDepth = source.split("_").length - 1; // Count underscores as depth
	const sourceProfile = source.includes("_of_")
		? source.split("_of_").pop()
		: undefined;

	try {
		// Skip if already visited
		if (await wasVisited(username)) {
			cycleManager.recordWarning(
				"PROFILE_NOT_FOUND",
				"Already visited",
				username,
			);
			return { wasCreator: false, hadEngagement: false };
		}

		// Navigate to profile and check status (skip navigation if already there from modal click)
		const [profileDelayMin, profileDelayMax] = getDelay("profile_load");
		const profileDelay =
			profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
		await sleep(profileDelay * 1000);

		const status = skipNavigation
			? await checkProfileStatus(page)
			: await navigateToProfileAndCheck(page, username, {
					timeout: 15000,
				});

		// Silent scroll-check: IG sometimes serves half-rendered stub on fast clicks
		// This nudge wakes the DOM before bio analysis
		await humanScroll(page, { deltaY: 200, delay: 300 });

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
			return { wasCreator: false, hadEngagement: false };
		}

		if (status.isPrivate) {
			logger.warn("PROFILE", `Profile is private: @${username}`);
			await markVisited(username, undefined, undefined, 0);
			cycleManager.recordWarning(
				"PROFILE_PRIVATE",
				"Profile is private",
				username,
			);
			return { wasCreator: false, hadEngagement: false };
		}
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

		return { wasCreator: false, hadEngagement: false };
	}

	// Comprehensive profile analysis with advanced link detection
	let analysis: ComprehensiveAnalysisResult;
	try {
		analysis = await analyzeProfileComprehensive(page, username);
	} catch (analysisError) {
		const errorMsg =
			analysisError instanceof Error
				? analysisError.message
				: String(analysisError);
		const isBundlerError =
			errorMsg.includes("__name") || errorMsg.includes("is not defined");

		const timeStr = timer.end().toFixed(1);

		if (isBundlerError) {
			// Extract step context from wrapped error message: "[step] msg (completed: x → y)"
			const stepMatch = errorMsg.match(/\[([^\]]+)\]/);
			const completedMatch = errorMsg.match(/\(completed: ([^)]+)\)/);
			const failedStep = stepMatch ? stepMatch[1] : "unknown";
			const completedSteps = completedMatch ? completedMatch[1] : "none";

			// Log with context - not concerning if early steps completed
			logger.info(
				"RESULT",
				`⚠️ @${username} | Bundler error at ${failedStep} (OK: ${completedSteps}) | Time: ${timeStr}s`,
			);
		} else {
			const error =
				analysisError instanceof Error
					? analysisError
					: new Error(String(analysisError));
			recordError(error, `comprehensive_analysis_error_${username}`, username);
			await logger.errorWithScreenshot(
				"ERROR",
				`Analysis failed for @${username}: ${errorMsg}`,
				page,
				`comprehensive_analysis_failed_${username}`,
			);
		}
		return { wasCreator: false, hadEngagement: false };
	}

	if (!analysis.bio) {
		// Database already updated by analyzeProfileComprehensive
		recordError("No bio found", `comprehensive_analysis_${username}`, username);
		const timeStr = timer.end().toFixed(1);
		logger.info("RESULT", `⚠️ @${username} | No bio found | Time: ${timeStr}s`);
		return { wasCreator: false, hadEngagement: false };
	}

	// Quick bio scoring for smart filtering
	quickScore = calculateScore(analysis.bio, username).score;

	// Use the higher of quickScore or analysis.confidence (which includes link analysis)
	const effectiveConfidence = Math.max(quickScore, analysis.confidence);

	// Check if profile has links that should be verified before rejecting
	const hasLinksToCheck = analysis.links && analysis.links.length > 0;

	// SMART FILTERING: Quick reject low-scoring profiles
	// BUT: Never quick-reject if there are links to check - links are the best indicator!
	if (effectiveConfidence < 20 && !analysis.isCreator && !hasLinksToCheck) {
		// Very low score from all signals AND no links - quick reject (saves time)
		// Database already updated by analyzeProfileComprehensive
		cycleManager.recordProfileProcessed(username, false);

		const timeStr = timer.end().toFixed(1);
		logger.info(
			"RESULT",
			`❌ @${username} | Score: ${quickScore}% | Conf: ${analysis.confidence}% | Creator: NO | Time: ${timeStr}s`,
		);
		return { wasCreator: false, hadEngagement };
	}

	// RANDOM ENGAGEMENT: Only engage with confirmed creators
	// Skip engagement on non-creator profiles to avoid wasting time and appearing bot-like
	if (analysis.isCreator && shouldEngageOnProfile(quickScore)) {
		const engagementResult = await performRandomEngagement(page, username);
		// Track successful engagements (not "none" type and succeeded)
		if (engagementResult.type !== "none" && engagementResult.success) {
			hadEngagement = true;
		}
	}

	// Database already updated by analyzeProfileComprehensive

	try {
		// Comprehensive analysis already includes advanced link detection
		// Check if creator based on comprehensive analysis results
		confirmedCreator = analysis.isCreator;
		confidence = analysis.confidence;

		// Record metrics for confirmed creator
		if (
			confirmedCreator &&
			confidence >= CONFIDENCE_THRESHOLD &&
			metricsTracker
		) {
			// Count vision API calls from comprehensive analysis
			const visionCalls = analysis.screenshots.length;
			for (let i = 0; i < visionCalls; i++) {
				metricsTracker.recordVisionApiCall(0.001); // ~$0.001 per call
				visionApiCalls++; // Increment cumulative counter
			}
			metricsTracker.recordCreatorFound(username, confidence, visionCalls);
		}

		// If not a creator or confidence is too low, skip
		if (!confirmedCreator || confidence < CONFIDENCE_THRESHOLD) {
			cycleManager.recordProfileProcessed(username, false);
			return { wasCreator: false, hadEngagement };
		}

		// If confirmed creator, take actions
		if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
			cycleManager.recordProfileProcessed(username, true);

			// System notification for creator found (macOS only)
			try {
				const { execSync } = await import("child_process");
				execSync(
					`osascript -e 'display notification "Creator found with ${confidence}% confidence" with title "Scout Discovery" subtitle "@${username}" sound name "Glass"'`,
					{ stdio: "ignore" },
				);
			} catch {
				// Ignore notification errors on non-macOS systems
			}

			// Mark in database with proof screenshot
			let proofPath = null;
			try {
				proofPath = await snapshot(page, `creator_${username}`, true);
			} catch {
				// Screenshot failed, continue without proof
			}
			await markAsCreator(username, confidence, proofPath);

			// Send DM (if not already sent and DM sending is enabled)
			let attemptedDm = false;
			if (sendDM && !(await wasDmSent(username))) {
				const [dmDelayMin, dmDelayMax] = getDelay("before_dm");
				const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
				await sleep(dmWait * 1000);

				attemptedDm = true;
				try {
					await sendDMToUser(page, username, true);
					cycleManager.recordDMSent(username);
					if (metricsTracker) {
						metricsTracker.recordDMSent();
					}
				} catch (dmError) {
					const error =
						dmError instanceof Error ? dmError : new Error(String(dmError));
					recordError(error, `dm_send_${username}`, username);
				}
			} else if (!sendDM) {
				// DM sending disabled
			} else {
				cycleManager.recordWarning(
					"DM_ALREADY_SENT",
					"DM already sent",
					username,
				);
			}

			// Follow (if not already following)
			// Skip navigation if we didn't attempt DM (still on profile page)
			if (!(await wasFollowed(username))) {
				try {
					await followUserAccount(page, username, !attemptedDm);
					cycleManager.recordFollowCompleted(username);
					if (metricsTracker) {
						metricsTracker.recordFollowCompleted();
					}
				} catch (followError) {
					const error =
						followError instanceof Error
							? followError
							: new Error(String(followError));
					recordError(error, `follow_${username}`, username);
				}
			} else {
				cycleManager.recordWarning(
					"ALREADY_FOLLOWING",
					"Already following",
					username,
				);
			}

			// Add their following to queue for expansion
			try {
				await addFollowingToQueue(
					page,
					username,
					`following_of_${username}`,
					20,
				);
			} catch (queueError) {
				const error =
					queueError instanceof Error
						? queueError
						: new Error(String(queueError));
				recordError(error, `queue_expansion_${username}`, username);
			}

			return { wasCreator: true, hadEngagement }; // Creator found with high confidence
		} else {
			cycleManager.recordProfileProcessed(username, false);
			return { wasCreator: false, hadEngagement };
		}
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
		// Get processing time (timer.end() returns seconds)
		const finalProcessingTime = timer.end();
		const timeStr = finalProcessingTime.toFixed(1);

		// Compact single-line result
		const creatorStatus = confirmedCreator
			? confidence >= CONFIDENCE_THRESHOLD
				? "YES"
				: "MAYBE"
			: "NO";
		const icon =
			confirmedCreator && confidence >= CONFIDENCE_THRESHOLD
				? "✅"
				: confirmedCreator
					? "⚠️"
					: "❌";

		logger.info(
			"RESULT",
			`${icon} @${username} | Score: ${quickScore}% | Conf: ${confidence}% | Creator: ${creatorStatus} | Time: ${timeStr}s`,
		);

		// Record profile visit metrics with complete data
		if (metricsTracker) {
			metricsTracker.recordProfileVisit(
				username,
				finalProcessingTime,
				source,
				discoveryDepth,
				sourceProfile,
				contentCategories,
				visionApiCalls,
			);
		}
	}
}

/**
 * Process the following list of a seed profile.
 *
 * BATCHED FLOW (fully exhausts seed):
 * 1. Navigate to seed profile
 * 2. Open following modal
 * 3. Extract a batch of unvisited usernames
 * 4. Click first username (natural navigation), close modal
 * 5. Process the batch
 * 6. If more profiles exist, go back to seed and repeat from step 2
 * 7. Continue until following list is exhausted (scroll flatline)
 *
 * This approach fully exhausts each seed's following list rather than
 * artificially capping extraction and moving on.
 */
export async function processFollowingList(
	seedUsername: string,
	page: Page,
	metricsTracker?: MetricsTracker,
	sendDM: boolean = true,
	checkContinue: () => boolean = shouldContinue,
	onProfileProcessed?: (result: ProfileResult) => void,
): Promise<void> {
	const { closeModal } = await import(
		"../functions/navigation/modalOperations/modalOperations.ts"
	);
	const { FOLLOWING_BATCH_SIZE } = await import(
		"../functions/shared/config/config.ts"
	);

	logger.info("PROFILE", `Processing following list of @${seedUsername}`);

	let totalProcessed = 0;
	let followingListExhausted = false;
	let batchNumber = 0;

	// Keep processing batches until the following list is exhausted
	while (!followingListExhausted && checkContinue()) {
		batchNumber++;
		logger.info("BATCH", `Starting batch #${batchNumber} for @${seedUsername}`);

		// ═══════════════════════════════════════════════════════════════════════
		// STEP 1: Navigate to seed profile
		// ═══════════════════════════════════════════════════════════════════════
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

		// Check if profile has any following (only on first batch)
		if (batchNumber === 1) {
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
		}

		// ═══════════════════════════════════════════════════════════════════════
		// STEP 2: Open following modal
		// ═══════════════════════════════════════════════════════════════════════
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

		// Check if the modal is empty (only on first batch)
		if (batchNumber === 1) {
			const isEmpty = await isFollowingModalEmpty(page);
			if (isEmpty) {
				logger.warn(
					"PROFILE",
					`@${seedUsername} has an empty following list, skipping seed`,
				);
				cycleManager.recordWarning(
					"PROFILE_NOT_FOUND",
					"Following list is empty",
					seedUsername,
				);
				await closeModal(page);
				return;
			}
		}

		// ═══════════════════════════════════════════════════════════════════════
		// STEP 3: Extract batch of unvisited usernames (with scrolling)
		// ═══════════════════════════════════════════════════════════════════════
		logger.info(
			"EXTRACTION",
			`Extracting batch #${batchNumber} from @${seedUsername}'s following list...`,
		);

		// Get current scroll index (resume from previous position)
		let scrollIndex = await getScrollIndex(seedUsername);
		if (scrollIndex > 0) {
			logger.debug(
				"NAVIGATION",
				`Resuming from scroll position ${scrollIndex}...`,
			);
			for (let i = 0; i < Math.floor(scrollIndex / 500); i++) {
				await scrollFollowingModal(page, 500);
			}
			await shortDelay(1, 2);
		}

		const batchUsernames: string[] = [];
		const seenUsernames = new Set<string>();
		let lastScrollHeight = 0;
		let scrollHeightFlatlineCount = 0;
		let consecutiveEmptyBatches = 0;
		const maxConsecutiveEmptyBatches = 3;

		// Extract until we have a full batch or hit end of list
		while (
			batchUsernames.length < FOLLOWING_BATCH_SIZE &&
			consecutiveEmptyBatches < maxConsecutiveEmptyBatches &&
			checkContinue()
		) {
			try {
				// Extract usernames from current modal view
				const extracted = await extractFollowingUsernames(page, 20);

				if (extracted.length === 0) {
					consecutiveEmptyBatches++;
					logger.debug(
						"EXTRACTION",
						`Empty extraction (${consecutiveEmptyBatches}/${maxConsecutiveEmptyBatches})`,
					);
				} else {
					consecutiveEmptyBatches = 0;

					// Filter to only unvisited, unseen usernames
					let newInExtraction = 0;
					for (const username of extracted) {
						if (!seenUsernames.has(username)) {
							seenUsernames.add(username);
							const visited = await wasVisited(username);
							if (!visited) {
								batchUsernames.push(username);
								newInExtraction++;
								if (batchUsernames.length >= FOLLOWING_BATCH_SIZE) {
									break;
								}
							}
						}
					}

					logger.debug(
						"EXTRACTION",
						`Extracted ${extracted.length}, ${newInExtraction} new unvisited (batch: ${batchUsernames.length}/${FOLLOWING_BATCH_SIZE})`,
					);
				}

				// Check if we have a full batch
				if (batchUsernames.length >= FOLLOWING_BATCH_SIZE) {
					logger.info(
						"EXTRACTION",
						`Batch #${batchNumber} full (${FOLLOWING_BATCH_SIZE} profiles)`,
					);
					break;
				}

				// Scroll for more content
				const scrollResult = await scrollFollowingModal(page, 500);
				scrollIndex += 500;
				await updateScrollIndex(seedUsername, scrollIndex);

				// Check for scroll flatline (end of list)
				if (scrollResult.scrollHeight === lastScrollHeight) {
					scrollHeightFlatlineCount++;
					logger.debug(
						"NAVIGATION",
						`Scroll height unchanged (${scrollHeightFlatlineCount}/2)`,
					);
					if (scrollHeightFlatlineCount >= 2) {
						logger.info(
							"EXTRACTION",
							`End of following list reached for @${seedUsername}`,
						);
						followingListExhausted = true;
						break;
					}
				} else {
					scrollHeightFlatlineCount = 0;
					lastScrollHeight = scrollResult.scrollHeight;
				}

				// Brief delay for content to load
				await shortDelay(0.5, 1);

				// Mouse wiggle periodically for human-like behavior
				if (batchUsernames.length % 10 === 0 && batchUsernames.length > 0) {
					await mouseWiggle(page);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				recordError(error, `extraction_${seedUsername}`, seedUsername);
				logger.error(
					"ERROR",
					`Extraction error for @${seedUsername}: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
				followingListExhausted = true; // Stop on error
				break;
			}
		}

		// If no usernames extracted, we're done
		if (batchUsernames.length === 0) {
			logger.info(
				"PROFILE",
				`No more unvisited profiles in @${seedUsername}'s following list`,
			);
			await closeModal(page);
			followingListExhausted = true;
			break;
		}

		logger.info(
			"EXTRACTION",
			`Batch #${batchNumber}: ${batchUsernames.length} profiles to process`,
		);

		// ═══════════════════════════════════════════════════════════════════════
		// STEP 4: Click first username in modal (natural navigation)
		// ═══════════════════════════════════════════════════════════════════════
		const firstUsername = batchUsernames[0];

		logger.debug(
			"NAVIGATION",
			`Clicking @${firstUsername} in modal (natural flow)`,
		);
		const clicked = await clickUsernameInModal(page, firstUsername);

		if (!clicked) {
			logger.debug(
				"NAVIGATION",
				`Direct click failed for @${firstUsername}, closing modal`,
			);
			await shortDelay(0.5, 1);
			await closeModal(page);
		}

		// ═══════════════════════════════════════════════════════════════════════
		// STEP 5: Process the batch
		// ═══════════════════════════════════════════════════════════════════════
		let batchProcessed = 0;

		// Process first profile (skip navigation if we successfully clicked in modal)
		try {
			const result = await processProfile(
				firstUsername,
				page,
				`following_of_${seedUsername}`,
				metricsTracker,
				sendDM,
				clicked, // skipNavigation - we already navigated via modal click
			);
			batchProcessed++;
			totalProcessed++;
			onProfileProcessed?.(result);
		} catch (profileError) {
			const error =
				profileError instanceof Error
					? profileError
					: new Error(String(profileError));
			recordError(error, `profile_processing_${firstUsername}`, firstUsername);
			logger.warn(
				"ERROR",
				`Failed to process @${firstUsername}, continuing...`,
			);
			onProfileProcessed?.({ wasCreator: false, hadEngagement: false });
		}

		// Process remaining profiles in batch (direct navigation)
		for (const username of batchUsernames.slice(1)) {
			if (!checkContinue()) {
				logger.warn(
					"PROFILE",
					`🛑 Processing interrupted at batch #${batchNumber} for seed @${seedUsername} | Reason: checkContinue() returned false | Profile: @${username}`,
				);
				return;
			}

			// Double-check not visited
			if (await wasVisited(username)) {
				logger.debug("PROFILE", `@${username} already visited, skipping`);
				continue;
			}

			try {
				const result = await processProfile(
					username,
					page,
					`following_of_${seedUsername}`,
					metricsTracker,
					sendDM,
				);
				batchProcessed++;
				totalProcessed++;
				onProfileProcessed?.(result);

				if (totalProcessed % 10 === 0) {
					logger.info(
						"PROFILE",
						`Progress: ${totalProcessed} profiles processed from @${seedUsername}`,
					);
				}
			} catch (profileError) {
				const error =
					profileError instanceof Error
						? profileError
						: new Error(String(profileError));
				recordError(error, `profile_processing_${username}`, username);
				logger.warn("ERROR", `Failed to process @${username}, continuing...`);
				onProfileProcessed?.({ wasCreator: false, hadEngagement: false });
			}
		}

		logger.info(
			"BATCH",
			`Batch #${batchNumber} complete: ${batchProcessed}/${batchUsernames.length} processed`,
		);

		// If batch was smaller than FOLLOWING_BATCH_SIZE, we've likely exhausted the list
		if (batchUsernames.length < FOLLOWING_BATCH_SIZE) {
			logger.info(
				"PROFILE",
				`Batch was smaller than ${FOLLOWING_BATCH_SIZE}, following list likely exhausted`,
			);
			followingListExhausted = true;
		}
	}

	logger.info(
		"PROFILE",
		`Finished processing @${seedUsername}'s following list`,
	);
	logger.info(
		"PROFILE",
		`Total processed: ${totalProcessed} profiles in ${batchNumber} batch(es)`,
	);
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
 * Main scrape function - does the full automation flow
 * @param options - Configuration options
 */
export async function scrape(
	options: { debug?: boolean; skipWarmup?: boolean } = {},
): Promise<void> {
	const { debug = false, skipWarmup = false } = options;

	logger.info(
		"ACTION",
		"🚀 Scout - Instagram Patreon Creator Discovery Agent",
	);
	logger.info("SYSTEM", `Debug: ${debug}, Skip warmup: ${skipWarmup}`);

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
		logger.info("ACTION", "✅ Session initialized!");

		// Warm up the session before starting automation (unless skipped)
		if (!skipWarmup) {
			logger.info("WARMUP", "🔥 Starting warm-up routine...");
			const warmupStats = await warmUpProfile(page, 1.5);
			logger.info(
				"WARMUP",
				`✅ Warm-up complete: ${warmupStats.scrolls} scrolls, ${warmupStats.likes} likes, ${warmupStats.reelsWatched} reels watched`,
			);
		} else {
			logger.info("WARMUP", "⏭️ Skipping warm-up (--skip-warmup)");
		}

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
 * @param options - Configuration options
 */
export async function scrapeWithoutDM(
	options: { debug?: boolean; skipWarmup?: boolean } = {},
): Promise<void> {
	const { debug = false, skipWarmup = false } = options;

	// Clear entry log for CLI users
	console.log("");
	console.log("═══════════════════════════════════════════════════════════");
	console.log("  🔍 DISCOVERY MODE ACTIVE — NO DMs WILL FIRE");
	console.log("═══════════════════════════════════════════════════════════");
	console.log("");

	logger.info(
		"ACTION",
		"🔍 Scout - Instagram Patreon Creator Discovery Agent (Discovery Mode - No DMs)",
	);
	logger.info("SYSTEM", `Debug: ${debug}, Skip warmup: ${skipWarmup}`);

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
		logger.info("ACTION", "✅ Session initialized!");

		// Warm up the session before starting automation (unless skipped)
		if (!skipWarmup) {
			logger.info("WARMUP", "🔥 Starting warm-up routine...");
			const warmupStats = await warmUpProfile(page, 1.5);
			logger.info(
				"WARMUP",
				`✅ Warm-up complete: ${warmupStats.scrolls} scrolls, ${warmupStats.likes} likes, ${warmupStats.reelsWatched} reels watched`,
			);
		} else {
			logger.info("WARMUP", "⏭️ Skipping warm-up (--skip-warmup)");
		}

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

		// Clear exit log for CLI users
		console.log("");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("  ✅ DISCOVERY MODE COMPLETE — 0 DMs SENT (as intended)");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("");
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
	const skipWarmup = process.argv.includes("--skip-warmup");

	const options = { debug, skipWarmup };

	if (noDM) {
		console.log("🔍 Running in DISCOVERY MODE (no DMs will be sent)");
		if (skipWarmup) console.log("⏭️ Skipping warmup");
		scrapeWithoutDM(options).catch((err) => {
			console.error(err);
			process.exit(1);
		});
	} else {
		console.log("🚀 Running in FULL MODE (will send DMs to creators)");
		if (skipWarmup) console.log("⏭️ Skipping warmup");
		scrape(options).catch((err) => {
			console.error(err);
			process.exit(1);
		});
	}
}
