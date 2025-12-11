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
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import {
	extractFollowingUsernames,
	openFollowingModal,
	scrollFollowingModal,
} from "../functions/navigation/modalOperations/modalOperations.ts";
import {
	ensureLoggedIn,
	navigateToProfileAndCheck,
} from "../functions/navigation/profileNavigation/profileNavigation.ts";
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
import {
	createLogger,
	type Logger,
} from "../functions/shared/logger/logger.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import { getDelay } from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

initDb();

/**
 * Process a single profile: visit, analyze, and take actions if creator.
 */
export async function processProfile(
	username: string,
	page: Page,
	source: string,
	logger: Logger,
): Promise<void> {
	logger.info("PROFILE", `[${source}] Processing @${username}...`);

	// Skip if already visited
	if (wasVisited(username)) {
		logger.debug("PROFILE", `Already visited, skipping @${username}`);
		return;
	}

	// Navigate to profile and check status
	try {
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

		// Check if profile is accessible
		if (status.notFound) {
			logger.warn("PROFILE", `Profile not found: @${username}`);
			markVisited(username, undefined, undefined, 0);
			return;
		}

		if (status.isPrivate) {
			logger.warn("PROFILE", `Profile is private: @${username}`);
			markVisited(username, undefined, undefined, 0);
			return;
		}

		// Ensure we're logged in
		await ensureLoggedIn(page);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		await logger.errorWithScreenshot(
			"ERROR",
			`Failed to load profile @${username}: ${errorMessage}`,
			page,
			`profile_load_${username}`,
		);
		return;
	}

	// Basic profile analysis
	const analysis = await analyzeProfileBasic(page, username);

	if (!analysis.bio) {
		logger.warn("ANALYSIS", `No bio found for @${username}`);
		markVisited(username, undefined, undefined, 0);
		return;
	}

	logger.info(
		"ANALYSIS",
		`Bio: ${analysis.bio.substring(0, 100)}${
			analysis.bio.length > 100 ? "..." : ""
		}`,
	);
	logger.info("ANALYSIS", `Bio score: ${analysis.bioScore}`);

	// Mark as visited with bio and score
	markVisited(username, undefined, analysis.bio, analysis.bioScore);

	// If not promising, skip expensive vision analysis
	if (!analysis.isLikely) {
		logger.debug(
			"ANALYSIS",
			`Bio score too low (${analysis.bioScore} < 40), skipping @${username}`,
		);
		return;
	}

	logger.info("ANALYSIS", `Link in bio: ${analysis.linkFromBio || "none"}`);

	// If has linktree/link aggregator, do vision analysis
	let confirmedCreator = false;
	let confidence = analysis.bioScore;

	if (analysis.linkFromBio) {
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
		} else {
			logger.debug(
				"ANALYSIS",
				`Vision did not confirm creator for @${username}`,
			);
		}
	} else if (analysis.bioScore >= CONFIDENCE_THRESHOLD) {
		// High bio score alone can indicate creator
		confirmedCreator = true;
		confidence = analysis.bioScore;
	}

	// If confirmed creator, take actions
	if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
		logger.info("ACTION", `CONFIRMED CREATOR (confidence: ${confidence}%)`);

		// Mark in database
		const proofPath = analysis.linkFromBio
			? await snapshot(page, `creator_${username}`)
			: null;
		if (proofPath) {
			logger.info("SCREENSHOT", `Creator proof saved: ${proofPath}`);
		}
		markAsCreator(username, confidence, proofPath);

		// Send DM (if not already sent)
		if (!wasDmSent(username)) {
			const [dmDelayMin, dmDelayMax] = getDelay("before_dm");
			const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
			logger.debug("DELAY", `Waiting ${Math.floor(dmWait)}s before DM...`);
			await sleep(dmWait * 1000);

			await sendDMToUser(page, username);
			logger.info("ACTION", `DM sent to @${username}`);
		} else {
			logger.debug("ACTION", `DM already sent to @${username}`);
		}

		// Follow (if not already following)
		if (!wasFollowed(username)) {
			await followUserAccount(page, username);
			logger.info("ACTION", `Followed @${username}`);
		} else {
			logger.debug("ACTION", `Already following @${username}`);
		}

		// Add their following to queue for expansion
		logger.info("QUEUE", `Adding @${username}'s following to queue...`);
		const added = await addFollowingToQueue(
			page,
			username,
			`following_of_${username}`,
			20,
		);
		if (added > 0) {
			logger.info("QUEUE", `Added ${added} profiles to queue`);
		}
	} else {
		logger.debug(
			"ANALYSIS",
			`Not confirmed (confidence: ${confidence}% < ${CONFIDENCE_THRESHOLD}%)`,
		);
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
}

/**
 * Process the following list of a seed profile.
 */
export async function processFollowingList(
	seedUsername: string,
	page: Page,
	logger: Logger,
): Promise<void> {
	logger.info("PROFILE", `Processing following list of @${seedUsername}`);

	// Navigate to seed profile
	try {
		const status = await navigateToProfileAndCheck(page, seedUsername, {
			timeout: 15000,
		});

		if (status.notFound || status.isPrivate) {
			logger.warn(
				"PROFILE",
				`Seed profile @${seedUsername} is ${
					status.notFound ? "not found" : "private"
				}`,
			);
			return;
		}

		// Ensure we're logged in
		await ensureLoggedIn(page);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		await logger.errorWithScreenshot(
			"ERROR",
			`Failed to load seed profile @${seedUsername}: ${errorMessage}`,
			page,
			`seed_profile_load_${seedUsername}`,
		);
		return;
	}

	// Open following modal
	const modalOpened = await openFollowingModal(page);
	if (!modalOpened) {
		await logger.errorWithScreenshot(
			"ERROR",
			`Could not open following modal for @${seedUsername}`,
			page,
			`modal_open_${seedUsername}`,
		);
		return;
	}

	// Get current scroll index
	let scrollIndex = getScrollIndex(seedUsername);
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

	while (true) {
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
			if (!wasVisited(username)) {
				allVisited = false;
				await processProfile(
					username,
					page,
					`following_of_${seedUsername}`,
					logger,
				);
				processedInBatch++;
			} else {
				logger.debug("PROFILE", `@${username} already visited, skipping`);
			}
		}

		// If all in batch were already visited, scroll for more
		if (allVisited) {
			logger.debug(
				"NAVIGATION",
				"All profiles in batch already visited, scrolling...",
			);
			await scrollFollowingModal(page, 500);
			scrollIndex += 500;
			updateScrollIndex(seedUsername, scrollIndex);
			await sleep(2000);
		} else {
			// Processed new profiles, continue with next batch
			break;
		}

		// Safety: don't process too many in one go
		if (processedInBatch >= 50) {
			logger.warn("PROFILE", "Processed 50 profiles, pausing...");
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
 * Load seeds from file into queue
 */
export function loadSeeds(filePath: string = "seeds.txt"): number {
	if (!existsSync(filePath)) {
		return 0;
	}

	const seedsContent = readFileSync(filePath, "utf-8");
	const lines = seedsContent.split("\n");
	let seedsLoaded = 0;
	for (const line of lines) {
		const u = line.trim().toLowerCase();
		if (u && !u.startsWith("#")) {
			queueAdd(u, 100, "seed");
			seedsLoaded++;
		}
	}
	return seedsLoaded;
}

/**
 * Run the main scrape loop
 */
export async function runScrapeLoop(page: Page, logger: Logger): Promise<void> {
	let dmsSent = 0;

	while (dmsSent < MAX_DMS_PER_DAY) {
		// Get next profile from queue
		const target = queueNext();

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

		logger.info("QUEUE", `Queue: ${queueCount()} remaining`);

		// Process their following list
		await processFollowingList(target, page, logger);

		// Print stats
		const stats = getStats();
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
	}

	const stats = getStats();
	logger.info(
		"STATS",
		`Session complete! Total visited: ${stats.total_visited}`,
	);
	logger.info("STATS", `Confirmed creators: ${stats.confirmed_creators}`);
	logger.info("STATS", `DMs sent: ${stats.dms_sent}`);
}

/**
 * Main scrape function - does the full automation flow
 * @param debug - If true, enables logging output
 */
export async function scrape(debug: boolean = false): Promise<void> {
	const logger = createLogger(debug);

	logger.info("ACTION", "Scout - Instagram Patreon Creator Discovery Agent");

	let browser: Browser | null = null;
	try {
		// Connect to browser
		logger.info("ACTION", "Connecting to browser...");
		browser = await createBrowser({ headless: true });
		const page = await createPage(browser);

		// Login (will use saved session if available)
		logger.info("ACTION", "Logging in to Instagram...");
		await ensureLoggedIn(page);
		logger.info("ACTION", "Logged in!");

		// Load seeds
		const seedsLoaded = loadSeeds();
		if (seedsLoaded === 0) {
			logger.warn("QUEUE", "No seeds.txt found or no seeds loaded!");
			await browser.close();
			return;
		}
		logger.info("QUEUE", `Loaded ${seedsLoaded} seeds`);

		// Run main processing loop
		await runScrapeLoop(page, logger);

		await browser.close();
	} catch (err) {
		if (browser) {
			const page = await browser.newPage().catch(() => null);
			if (page) {
				const logger = createLogger(debug);
				await logger.errorWithScreenshot(
					"ERROR",
					`Fatal error in scrape: ${
						err instanceof Error ? err.message : String(err)
					}`,
					page,
					"scrape_fatal_error",
				);
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
