/**
 * Check and update all manually confirmed creators
 *
 * This script:
 * 1. Fetches all manually confirmed creators from the database
 * 2. Re-analyzes each profile comprehensively
 * 3. Updates database with fresh data (bio, links, confidence, etc.)
 * 4. Preserves manual override status
 *
 * Usage:
 *   tsx scripts/check_manual_creators.ts [--profile <profile>] [--limit <number>] [--debug]
 *
 * Examples:
 *   tsx scripts/check_manual_creators.ts --profile test-account
 *   tsx scripts/check_manual_creators.ts --profile test-account --limit 10
 *   tsx scripts/check_manual_creators.ts --profile test-account --debug
 */

import dotenv from "dotenv";

dotenv.config();

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { getDelay } from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

// Parse arguments
const args = process.argv.slice(2);
const debug = args.includes("--debug") || args.includes("-d");

// Get profile
let profileId = "test-account"; // default
const profileIdx = args.findIndex((a) => a === "--profile");
if (profileIdx !== -1 && args[profileIdx + 1]) {
	profileId = args[profileIdx + 1];
}

// Get limit
let limit: number | undefined = undefined;
const limitIdx = args.findIndex((a) => a === "--limit");
if (limitIdx !== -1 && args[limitIdx + 1]) {
	limit = parseInt(args[limitIdx + 1], 10);
}

// Load profile config
const profileConfig = getProfile(profileId);
if (!profileConfig) {
	console.error(`❌ Profile not found: ${profileId}`);
	process.exit(1);
}

console.log(`🔍 Scout - Manual Creator Profile Checker`);
console.log(`📋 Using profile: @${profileConfig.username}`);
console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);
if (limit) {
	console.log(`📊 Limit: ${limit} profiles`);
}
console.log("");

async function main() {
	console.log("🚀 Starting manual creator check...");
	console.log("📋 This will:");
	console.log("   • Fetch all manually confirmed creators from database");
	console.log("   • Re-analyze each profile comprehensively");
	console.log("   • Update bio, links, confidence, followers, etc.");
	console.log("   • Preserve manual override status");
	console.log("");

	// Get all manually confirmed creators
	const { getPrismaClient } = await import(
		"../functions/shared/database/database.ts"
	);
	const prisma = getPrismaClient();
	const manualCreators = await prisma.profile.findMany({
		where: {
			manualOverride: true,
			manuallyMarkedCreator: true,
		},
		select: {
			username: true,
			bioText: true,
			confidence: true,
			manualOverrideReason: true,
			manualOverrideAt: true,
		},
		orderBy: {
			manualOverrideAt: "desc",
		},
		take: limit,
	});

	if (manualCreators.length === 0) {
		console.log("📭 No manually confirmed creators found in database");
		console.log(
			"💡 Use 'npm run manual:mark-creator -- <username> \"<reason>\"' to mark creators",
		);
		return;
	}

	console.log(`📊 Found ${manualCreators.length} manually confirmed creators:`);
	for (const creator of manualCreators.slice(0, 10)) {
		console.log(
			`   • @${creator.username} - ${creator.manualOverrideReason || "No reason"}`,
		);
	}
	if (manualCreators.length > 10) {
		console.log(`   ... and ${manualCreators.length - 10} more`);
	}
	console.log("");

	// Initialize session with AdsPower
	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug,
		adsPowerProfileId: profileConfig?.adsPowerProfileId,
		credentials: {
			username: profileConfig?.username || "",
			password: profileConfig?.password || "",
		},
	});

	try {
		logger.info("ACTION", "✅ Session initialized!");
		logger.info(
			"ACTION",
			`🔍 Starting profile checks for ${manualCreators.length} creators...`,
		);

		let processed = 0;
		let updated = 0;
		let errors = 0;

		for (const creator of manualCreators) {
			processed++;
			const username = creator.username;

			logger.info(
				"PROFILE",
				`[${processed}/${manualCreators.length}] Checking @${username}...`,
			);

			try {
				// Navigate to profile
				logger.info("ACTION", `Navigating to @${username}...`);
				await page.goto(`https://www.instagram.com/${username}/`, {
					waitUntil: "networkidle2",
					timeout: 30000,
				});

				// Check if profile exists
				const isNotFound = await page.evaluate(() => {
					const text = document.body.innerText;
					return (
						text.includes("Sorry, this page isn't available") ||
						text.includes("Page Not Found")
					);
				});

				if (isNotFound) {
					logger.warn(
						"PROFILE",
						`Profile @${username} not found or unavailable`,
					);
					// Mark as error but don't update - maybe temporarily down
					errors++;
					continue;
				}

				// Check if profile is private
				const isPrivate = await page.evaluate(() => {
					const text = document.body.innerText;
					return text.includes("This account is private");
				});

				if (isPrivate) {
					logger.warn("PROFILE", `Profile @${username} is private`);
					// Note: Private profiles will be handled by analyzeProfileComprehensive
					// which will save bioText as "[Private Account]" if detected
					updated++;
					continue;
				}

				// Run comprehensive analysis (automatically saves to database)
				logger.info("ACTION", `Analyzing @${username}...`);
				const analysis = await analyzeProfileComprehensive(page, username);

				logger.info(
					"SUCCESS",
					`✅ Updated @${username} - Confidence: ${analysis.confidence}%, Followers: ${analysis.stats?.followers?.toLocaleString() || "N/A"}`,
				);
				updated++;
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				await logger.errorWithScreenshot(
					"ERROR",
					`Failed to check @${username}: ${errorMessage}`,
					page,
					`manual_check_${username}`,
				);
				errors++;
			}

			// Humanized delay between profiles
			if (processed < manualCreators.length) {
				const [delayMin, delayMax] = getDelay("between_profiles");
				const waitTime = delayMin + Math.random() * (delayMax - delayMin);
				logger.info(
					"DELAY",
					`Waiting ${Math.floor(waitTime)}s before next profile... (${processed}/${manualCreators.length} complete)`,
				);
				await sleep(waitTime * 1000);
			}
		}

		logger.info("ACTION", "📊 Manual creator check completed");
		logger.info(
			"STATS",
			`Processed: ${processed} | Updated: ${updated} | Errors: ${errors}`,
		);
	} finally {
		// IMPORTANT: Stop AdsPower profile FIRST, then disconnect
		// This ensures the browser window actually closes
		if (profileConfig?.adsPowerProfileId) {
			try {
				logger.info("ACTION", "Stopping AdsPower profile...");
				await stopAdsPowerProfile(profileConfig.adsPowerProfileId);
				logger.info("SUCCESS", "✅ AdsPower profile stopped");
			} catch (e) {
				logger.warn(
					"SYSTEM",
					`⚠️  Could not stop AdsPower profile via API: ${e}`,
				);
				logger.info("ACTION", "Attempting to disconnect browser anyway...");
			}
		}

		// Then disconnect Puppeteer
		try {
			await browser.disconnect();
			logger.info("SUCCESS", "✅ Browser disconnected");
		} catch (e) {
			logger.warn("SYSTEM", `⚠️  Could not disconnect browser: ${e}`);
		}
	}
}

main().catch((err) => {
	const errorMessage = err instanceof Error ? err.message : String(err);
	console.error("💥 Check failed:", errorMessage);

	// If it's a login timeout, don't exit - keep the process running so browser stays open
	if (errorMessage.includes("Login timeout")) {
		console.log(
			"\n⚠️  Login timeout detected - keeping browser open for inspection",
		);
		console.log(
			"💡 Check the browser window and complete login manually if needed",
		);
		console.log("💡 Press Ctrl+C when done to exit\n");
		return;
	}

	process.exit(1);
});
