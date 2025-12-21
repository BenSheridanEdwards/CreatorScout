/**
 * Robust profile checker that uses updated core functions for comprehensive analysis.
 *
 * Usage:
 *   node scripts/check_profile.js --user username [--debug]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Browser } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import type { ProfileCheckResult } from "../functions/shared/types/types.ts";
import { IG_USER, IG_PASS } from "../functions/shared/config/config.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function runProfileCheck(
	username: string,
	debug: boolean = false,
): Promise<ProfileCheckResult> {
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

	try {
		const session = await initializeInstagramSession({
			headless,
			debug: process.env.DEBUG_LOGS === "true" || debug,
			credentials: {
				username: IG_USER || process.env.INSTAGRAM_USERNAME!,
				password: IG_PASS || process.env.INSTAGRAM_PASSWORD!,
			},
		});
		browser = session.browser;
		const page = session.page;
		const logger = session.logger;

		logger.info(
			"ACTION",
			`Profile check start for @${username} (${headless ? "headless" : "headed"})`,
		);

		logger.info("ACTION", `Navigating to profile @${username}...`);
		await page.goto(`https://www.instagram.com/${username}/`, {
			waitUntil: "networkidle2",
			timeout: 30000,
		});

		// Check if profile exists
		const isNotFound = await page.$(
			'text="Sorry, this page isn\'t available."',
		);
		if (isNotFound) {
			logger.warn("PROFILE", "Profile not found or unavailable");
			result.errors.push("Profile not found or unavailable");
			return result;
		}

		// Check if profile is private
		const isPrivate = await page.$('text="This account is private"');
		if (isPrivate) {
			logger.warn("PROFILE", "Profile is private");
			result.errors.push("Profile is private");
			return result;
		}

		logger.info("ACTION", "Running comprehensive analysis...");

		// Use the updated core function that handles all the complex logic
		const analysis = await analyzeProfileComprehensive(page, username);

		result.bio = analysis.bio;
		result.links = analysis.links;
		result.confidence = analysis.confidence;
		result.indicators = analysis.indicators;
		result.screenshots = analysis.screenshots;
		result.isCreator = analysis.isCreator;
		result.reason = analysis.reason;

		if (result.isCreator) {
			const keyIndicators = result.indicators.filter(
				(indicator) =>
					indicator.includes("platform icons") ||
					indicator.includes("subscription") ||
					indicator.includes("aggregator") ||
					indicator.includes("creator keywords"),
			);

			logger.info(
				"ACTION",
				`🎯 CONFIRMED CREATOR (confidence: ${result.confidence}%, reason: ${result.reason})`,
			);

			if (keyIndicators.length > 0) {
				logger.info("ACTION", `💡 Key evidence: ${keyIndicators.join(" | ")}`);
			}
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
			// Give user time to check logs when running with visible browser
			if (!headless) {
				logger.info("ACTION", "Waiting 30 seconds before closing browser...");
				await new Promise((resolve) => setTimeout(resolve, 30000));
			}

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
