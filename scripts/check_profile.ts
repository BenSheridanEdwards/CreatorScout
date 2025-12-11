/**
 * Reusable profile checker used by tests and app scripts.
 * Exposes runProfileCheck(username) that:
 *  - logs into Instagram (puppeteer + stealth)
 *  - loads profile, extracts bio + external links
 *  - follows link aggregators, screenshots, and calls Python vision pipeline
 * Returns structured result with reasons, indicators, confidence, and screenshots.
 *
 * Usage:
 *   node scripts/check_profile.js --user username
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Browser } from "puppeteer";
import {
	collectAggregatorLinks,
	hasDirectCreatorLink,
	toSafeHttps,
} from "../functions/extraction/linkExtraction/linkExtraction.ts";
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import {
	ensureLoggedIn,
	navigateToProfileAndCheck,
} from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { classifyWithVision } from "../functions/profile/classifyWithVision/classifyWithVision.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import type { ProfileCheckResult } from "../functions/shared/types/types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function runProfileCheck(
	username: string,
	debug: boolean = false,
): Promise<ProfileCheckResult> {
	const logger = createLogger(debug);
	const headless = process.env.HEADLESS !== "false";

	let browser: Browser | null = null;
	const result: ProfileCheckResult = {
		username,
		isCreator: false,
		confidence: 0,
		indicators: [],
		bio: null,
		links: [],
		screenshots: [],
		errors: [],
		reason: null,
	};

	logger.info(
		"ACTION",
		`Profile check start for @${username} (${headless ? "headless" : "headed"})`,
	);

	try {
		browser = await createBrowser({ headless });
		const page = await createPage(browser);

		logger.info("ACTION", "Logging in...");
		await ensureLoggedIn(page);
		logger.info("ACTION", "Login complete");

		logger.info("ACTION", `Navigating to profile @${username}...`);
		const status = await navigateToProfileAndCheck(page, username, {
			timeout: 20000,
			waitForHeader: true,
		});

		if (status.notFound) {
			logger.warn("PROFILE", "Profile not found or unavailable");
			result.errors.push("Profile not found or unavailable");
			return result;
		}

		if (status.isPrivate) {
			logger.warn("PROFILE", "Profile is private");
			result.errors.push("Profile is private");
			return result;
		}

		logger.info("ACTION", "Running comprehensive analysis...");
		const analysis = await analyzeProfileComprehensive(page, username);

		result.bio = analysis.bio;
		result.links = analysis.links;
		result.confidence = analysis.confidence;
		result.indicators = analysis.indicators;
		result.screenshots = analysis.screenshots;
		result.isCreator = analysis.isCreator;
		result.reason = analysis.reason;

		if (result.bio) {
			logger.info(
				"ANALYSIS",
				`Bio: ${result.bio.substring(0, 100)}${
					result.bio.length > 100 ? "..." : ""
				}`,
			);
			logger.info("ANALYSIS", `Bio score: ${analysis.bioScore}`);
		} else {
			logger.warn("ANALYSIS", "No bio found");
			const isLocal = process.env.HEADLESS === "false" || !process.env.CI;
			if (isLocal) {
				const shot = await snapshot(page, `bio_extraction_failed_${username}`);
				result.screenshots.push(shot);
				logger.info("SCREENSHOT", `Bio extraction screenshot: ${shot}`);
			}
		}

		if (analysis.stats) {
			logger.info(
				"ANALYSIS",
				`Followers: ${analysis.stats.followers ?? "N/A"} | Following: ${
					analysis.stats.following ?? "N/A"
				} | Ratio: ${analysis.stats.ratio ?? "N/A"}`,
			);
		}

		if (analysis.highlights.length > 0) {
			logger.info(
				"ANALYSIS",
				`Highlights: ${analysis.highlights.map((h) => `"${h.title}"`).join(", ")}`,
			);
		}

		if (result.links.length > 0) {
			logger.info(
				"ANALYSIS",
				`Links (${result.links.length}): ${result.links.join(", ")}`,
			);
		}

		if (hasDirectCreatorLink(result.links)) {
			logger.info("ANALYSIS", "Direct creator link detected");
		}

		// Check link aggregators if still not confirmed
		if (!result.isCreator && result.links.length) {
			const aggregators = collectAggregatorLinks(result.links);
			logger.info(
				"ANALYSIS",
				`Aggregator links to check: ${aggregators.length}`,
			);

			for (let i = 0; i < aggregators.length && !result.isCreator; i++) {
				const safeUrl = toSafeHttps(aggregators[i]);
				logger.info("ANALYSIS", `[${i + 1}/${aggregators.length}] ${safeUrl}`);

				const extPage = await browser.newPage();
				try {
					const response = await extPage.goto(safeUrl, {
						waitUntil: "networkidle2",
						timeout: 15000,
					});
					const finalUrl = response?.url() || safeUrl;

					if (finalUrl.toLowerCase().includes("patreon.com")) {
						result.isCreator = true;
						result.confidence = 90;
						result.reason = "redirect_patreon";
						logger.info("ANALYSIS", "Redirected to Patreon");
						break;
					}

					const shot = await snapshot(extPage, `linkagg_${username}`);
					result.screenshots.push(shot);
					logger.info("SCREENSHOT", `Aggregator screenshot: ${shot}`);

					const visionResult = await classifyWithVision(shot);
					if (visionResult.ok) {
						result.isCreator = true;
						result.confidence = visionResult.data?.confidence || 70;
						result.indicators = visionResult.data?.indicators || [];
						result.reason = visionResult.data?.reason || "vision_detected";
						logger.info(
							"ANALYSIS",
							`Vision confirmed creator (confidence: ${result.confidence}%)`,
						);
					} else {
						logger.debug("ANALYSIS", "Vision did not confirm creator");
					}
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					logger.warn("ERROR", `Aggregator load failed: ${message}`);
					result.errors.push(`Aggregator load failed: ${message}`);
				} finally {
					await extPage.close().catch(() => {});
				}
			}
		}

		if (result.isCreator) {
			logger.info(
				"ACTION",
				`Flagged as creator (confidence: ${result.confidence}%, reason: ${result.reason})`,
			);
		} else {
			logger.info("ACTION", "Not confirmed as creator");
		}

		return result;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		result.errors.push(message);
		logger.error("ERROR", `Error occurred: ${message}`);
		return result;
	} finally {
		if (browser) {
			await browser.close().catch(() => {});
			logger.info("ACTION", "Browser closed");
		}
	}
}

// CLI usage
if (process.argv.includes("--user")) {
	const idx = process.argv.indexOf("--user");
	const user = process.argv[idx + 1];
	const debug = process.argv.includes("--debug") || process.argv.includes("-d");
	if (!user) {
		console.error("Usage: node scripts/check_profile.js --user <username>");
		process.exit(1);
	}
	runProfileCheck(user, debug)
		.then((res) => {
			console.log(JSON.stringify(res, null, 2));
		})
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}

export { runProfileCheck };
