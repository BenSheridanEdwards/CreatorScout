/**
 * Enhanced scrape.ts with comprehensive logging and cycle tracking
 * This shows how to integrate the enhanced logging system
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
	analyzeLinkWithVision,
	analyzeProfileBasic,
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
} from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

// NOTE: Database init is async; queries will initialize schema on demand.

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
		if (!existsSync(filePath)) {
			logger.warn("QUEUE", `Seeds file not found: ${filePath}`);
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
				logger.debug("QUEUE", `Loaded seed: @${username}`);
			}
		}

		logger.info(
			"QUEUE",
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
): Promise<void> {
	logger.info("PROFILE", `[${source}] Processing @${username}...`);

	const timer = startTimer(`Profile processing: @${username}`);

	try {
		// Skip if already visited
		if (await wasVisited(username)) {
			logger.debug("PROFILE", `Already visited, skipping @${username}`);
			cycleManager.recordWarning(
				"PROFILE_NOT_FOUND",
				"Already visited",
				username,
			);
			timer.end();
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
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `profile_load_${username}`, username);

		if (metricsTracker) {
			metricsTracker.recordError(username, "profile_load_failed", errorMessage);
		}
		return;
	}

	try {
		// Basic profile analysis
		const analysis = await analyzeProfileBasic(page, username);

		if (!analysis.bio) {
			logger.warn("ANALYSIS", `No bio found for @${username}`);
			await markVisited(username, undefined, undefined, 0);
			return;
		}

		logger.info(
			"ANALYSIS",
			`Bio: ${analysis.bio.substring(0, 100)}${analysis.bio.length > 100 ? "..." : ""}`,
		);
		logger.info("ANALYSIS", `Bio score: ${analysis.bioScore}`);

		// Mark as visited with bio and score
		await markVisited(
			username,
			undefined,
			analysis.bio,
			analysis.bioScore,
			undefined,
			analysis.confidence,
		);

		// Parse discovery source to extract depth and source profile
		const discoveryDepth = source.split("_").length - 1; // Count underscores as depth
		const sourceProfile = source.includes("_of_")
			? source.split("_of_").pop()
			: undefined;

		// Record profile visit metrics
		if (metricsTracker) {
			const processingTime = timer.end(); // End timer here for initial processing
			metricsTracker.recordProfileVisit(
				username,
				processingTime,
				source,
				discoveryDepth,
				sourceProfile,
				[], // contentCategories will be filled later if creator found
				0, // visionApiCalls will be updated later
			);
		}

		// If not promising, skip expensive vision analysis
		if (!analysis.isLikely) {
			logger.debug(
				"ANALYSIS",
				`Bio score too low (${analysis.bioScore} < 40), skipping @${username}`,
			);
			cycleManager.recordProfileProcessed(username, false);
			return;
		}

		logger.info("ANALYSIS", `Link in bio: ${analysis.linkFromBio || "none"}`);

		// If has linktree/link aggregator, do vision analysis
		let confirmedCreator = false;
		let confidence = analysis.bioScore;

		if (analysis.linkFromBio) {
			try {
				const visionResult = await analyzeLinkWithVision(
					page,
					analysis.linkFromBio,
					username,
					"linktree",
				);

				if (visionResult.isCreator) {
					confirmedCreator = true;
					confidence = visionResult.confidence || analysis.bioScore;
					logger.info(
						"ANALYSIS",
						`Vision confirmed creator (confidence: ${confidence}%)`,
					);

					// Record vision API usage
					if (metricsTracker) {
						metricsTracker.recordVisionApiCall(0.001); // ~$0.001 per call
						metricsTracker.recordCreatorFound(username, confidence, 1);
					}
				} else {
					logger.debug(
						"ANALYSIS",
						`Vision did not confirm creator for @${username} - Confidence: ${visionResult.confidence || 0}%`,
					);

					// Still record vision API usage even if not a creator
					if (metricsTracker) {
						metricsTracker.recordVisionApiCall(0.001);
					}
				}
			} catch (visionError) {
				const error =
					visionError instanceof Error
						? visionError
						: new Error(String(visionError));
				recordError(error, `vision_analysis_${username}`, username);
				logger.warn(
					"ANALYSIS",
					`Vision analysis failed for @${username}, using bio score only`,
				);
			}
		}

		if (analysis.bioScore >= 70) {
			// High bio score alone can indicate creator (e.g., direct creator mention)
			confirmedCreator = true;
			confidence = analysis.bioScore;
			logger.info(
				"ANALYSIS",
				`High bio score (${analysis.bioScore}) - likely creator without linktree`,
			);

			// Record creator found without vision API
			if (metricsTracker) {
				metricsTracker.recordCreatorFound(username, confidence, 0);
			}
		} else if (analysis.bioScore >= CONFIDENCE_THRESHOLD) {
			// Fallback for very high confidence scores
			confirmedCreator = true;
			confidence = analysis.bioScore;

			// Record creator found
			if (metricsTracker) {
				metricsTracker.recordCreatorFound(username, confidence, 0);
			}
		}

		// If confirmed creator, take actions
		if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
			logger.info("ACTION", `CONFIRMED CREATOR (confidence: ${confidence}%)`);

			// Mark in database
			const proofPath = analysis.linkFromBio
				? await snapshot(page, `creator_${username}`, true) // force: true - functional screenshot
				: null;
			if (proofPath) {
				logger.info("SCREENSHOT", `Creator proof saved: ${proofPath}`);
			}
			await markAsCreator(username, confidence, proofPath);

			// Send DM (if not already sent)
			if (!(await wasDmSent(username))) {
				const [dmDelayMin, dmDelayMax] = getDelay("before_dm");
				const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
				logger.debug("DELAY", `Waiting ${Math.floor(dmWait)}s before DM...`);
				await sleep(dmWait * 1000);

				try {
					await sendDMToUser(page, username);
					logger.info("ACTION", `DM sent to @${username}`);
					cycleManager.recordDMSent(username);

					// Record DM sent
					if (metricsTracker) {
						metricsTracker.recordDMSent(username);
					}
				} catch (dmError) {
					const error =
						dmError instanceof Error ? dmError : new Error(String(dmError));
					recordError(error, `dm_send_${username}`, username);
				}
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
					logger.info("ACTION", `Followed @${username}`);
					cycleManager.recordFollowCompleted(username);

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
			}

			cycleManager.recordProfileProcessed(username, true);
		} else {
			logger.debug(
				"ANALYSIS",
				`Not confirmed (confidence: ${confidence}% < ${CONFIDENCE_THRESHOLD}%)`,
			);
			cycleManager.recordProfileProcessed(username, false);
		}

		// Human-like delay before next profile
		const [profileDelayMin, profileDelayMax] = getDelay("between_profiles");
		const profileWait =
			profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
		logger.debug(
			"DELAY",
			`Waiting ${Math.floor(profileWait)}s before next profile...`,
		);
		await sleep(profileWait * 1000);
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `profile_processing_${username}`, username);

		if (metricsTracker) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			metricsTracker.recordError(
				username,
				"profile_processing_failed",
				errorMessage,
			);
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
): Promise<void> {
	logger.info("PROFILE", `Processing following list of @${seedUsername}`);

	try {
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
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, `seed_profile_load_${seedUsername}`, seedUsername);
		return;
	}

	// Open following modal
	const modalOpened = await openFollowingModal(page);
	if (!modalOpened) {
		recordError(
			"Modal opening failed",
			`modal_open_${seedUsername}`,
			seedUsername,
		);
		return;
	}

	// Check if the modal is empty (no people followed)
	const { isFollowingModalEmpty } = await import(
		"../functions/navigation/modalOperations/modalOperations.ts"
	);
	const isEmpty = await isFollowingModalEmpty(page);
	if (isEmpty) {
		logger.warn(
			"PROFILE",
			`@${seedUsername} has an empty following list (no people followed), skipping seed`,
		);
		// Close the modal before returning
		await page.keyboard.press("Escape");
		await sleep(1000);
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
		await sleep(2000);
	}

	let processedInBatch = 0;
	const batchSize = 10;
	let consecutiveAllVisited = 0;
	const maxConsecutiveAllVisited = 3;

	while (consecutiveAllVisited < maxConsecutiveAllVisited && shouldContinue()) {
		try {
			// Extract usernames from modal
			const usernames = await extractFollowingUsernames(page, batchSize);

			if (usernames.length === 0) {
				logger.debug("NAVIGATION", "No more usernames in modal");
				break;
			}

			logger.debug("QUEUE", `Batch of ${usernames.length} profiles`);
			for (const u of usernames) {
				logger.debug("QUEUE", `  - @${u}`);
			}

			// Process each username
			let allVisited = true;
			for (const username of usernames) {
				if (!(await wasVisited(username))) {
					allVisited = false;

					// Close the modal before visiting profile
					await page.keyboard.press("Escape");
					await sleep(1000); // brief delay after modal close

					await processProfile(
						username,
						page,
						`following_of_${seedUsername}`,
						metricsTracker,
					);
					processedInBatch++;

					// Re-open the following modal
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
							await sleep(2000);
						}
					}
				} else {
					logger.debug("PROFILE", `@${username} already visited, skipping`);
				}
			}

			// If all in batch were already visited, scroll for more
			if (allVisited) {
				consecutiveAllVisited++;
				logger.debug(
					"NAVIGATION",
					`All profiles in batch already visited (${consecutiveAllVisited}/${maxConsecutiveAllVisited})`,
				);
				await scrollFollowingModal(page, 500);
				scrollIndex += 500;
				await updateScrollIndex(seedUsername, scrollIndex);
				await sleep(2000);
			} else {
				consecutiveAllVisited = 0;
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

		logger.info("QUEUE", `Queue: ${await queueCount()} remaining`);

		try {
			// Process their following list
			await processFollowingList(target, page, metricsTracker);

			// Print stats
			const stats = await getStats();
			logger.info(
				"STATS",
				`Visited: ${stats.total_visited} | Creators: ${stats.confirmed_creators} | DMs: ${stats.dms_sent} | Queue: ${stats.queue_size}`,
			);

			dmsSent = stats.dms_sent;

			// Long delay between seed profiles
			const [seedDelayMin, seedDelayMax] = getDelay("between_seeds");
			const seedWait =
				seedDelayMin + Math.random() * (seedDelayMax - seedDelayMin);
			logger.debug(
				"DELAY",
				`Waiting ${Math.floor(seedWait)}s before next seed...`,
			);
			await sleep(seedWait * 1000);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			recordError(error, `seed_processing_${target}`, target);
			// Continue to next seed despite errors
		}
	}

	const stats = await getStats();
	logger.info(
		"STATS",
		`Session complete! Total visited: ${stats.total_visited}`,
	);
	logger.info("STATS", `Confirmed creators: ${stats.confirmed_creators}`);
	logger.info("STATS", `DMs sent: ${stats.dms_sent}`);
}

/**
 * Main scrape function - does the full automation flow
 */
export async function scrape(debug: boolean = false): Promise<void> {
	logger.info("ACTION", "Scout - Instagram Patreon Creator Discovery Agent");

	// Initialize metrics tracking
	const metricsTracker = getGlobalMetricsTracker();
	logger.info(
		"STATS",
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
			logger.warn("QUEUE", "No data/seeds.txt found or no seeds loaded!");
			endCycle("FAILED", "No seeds loaded");
			await browser.close();
			return;
		}
		logger.info("QUEUE", `Loaded ${seedsLoaded} seeds`);

		// Start cycle tracking
		cycleId = startCycle("batch_scraping", seedsLoaded * 50); // Estimate profiles to process

		// Run main processing loop
		await runScrapeLoop(page, metricsTracker);

		// End metrics session
		metricsTracker.endSession();
		const finalMetrics = metricsTracker.getSessionMetrics();
		logger.info(
			"STATS",
			`Session completed - Profiles: ${finalMetrics.profilesVisited}, Creators: ${finalMetrics.creatorsFound}, DMs: ${finalMetrics.dmsSent}`,
		);

		endCycle("COMPLETED");
		await browser.close();
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		const error = err instanceof Error ? err : new Error(String(err));
		recordError(error, "scrape_fatal_error");

		endCycle("FAILED", errorMessage);

		if (browser) {
			try {
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
				logger.error("ERROR", `Failed to take screenshot: ${screenshotError}`);
			}
			await browser.close();
		} else {
			console.error("Fatal error before browser creation:", err);
		}
		throw err;
	}
}

// Run if executed directly
if (
	import.meta.url.endsWith(process.argv[1]?.replace(process.cwd(), "") || "")
) {
	const debug = process.argv.includes("--debug") || process.argv.includes("-d");
	scrape(debug).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
