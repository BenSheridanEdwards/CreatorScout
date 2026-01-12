/**
 * Ramp-Up Test
 *
 * Gradually increases actions to test detection thresholds.
 * Monitors for Instagram flags and adjusts limits based on results.
 *
 * Usage: tsx scripts/test/ramp_up_test.ts --profile=<profile-id> [--dry-run]
 *
 * WARNING: This script performs real actions. Use with caution on real accounts.
 */
import { initializeInstagramSession } from "../../functions/auth/sessionInitializer/sessionInitializer.ts";
import {
	batchEngagements,
	EngagementTracker,
} from "../../functions/shared/engagement/engagementTracker.ts";
import { getLimitStatus } from "../../functions/shared/limits/actionLimits.ts";
import { createLogger } from "../../functions/shared/logger/logger.ts";
import {
	getProfileById,
	incrementProfileAction,
} from "../../functions/shared/profiles/profileManager.ts";
import {
	mediumDelay,
	shortDelay,
} from "../../functions/timing/humanize/humanize.ts";
import { warmUpProfile } from "../../functions/timing/warmup/warmup.ts";

const logger = createLogger(true);

interface RampUpArgs {
	profileId: string;
	dryRun: boolean;
	maxFollows?: number;
}

interface RampUpResults {
	followsAttempted: number;
	followsSuccessful: number;
	flagsDetected: string[];
	duration: number;
	recommendations: string[];
}

function parseArgs(): RampUpArgs {
	const args = process.argv.slice(2);
	const result: Partial<RampUpArgs> = { dryRun: false };

	for (const arg of args) {
		if (arg.startsWith("--profile=")) {
			result.profileId = arg.split("=")[1];
		} else if (arg === "--dry-run") {
			result.dryRun = true;
		} else if (arg.startsWith("--max-follows=")) {
			result.maxFollows = parseInt(arg.split("=")[1], 10);
		}
	}

	if (!result.profileId) {
		throw new Error("Missing required argument: --profile=<profile-id>");
	}

	return result as RampUpArgs;
}

async function checkForFlags(
	page: import("puppeteer").Page,
): Promise<string[]> {
	const flags: string[] = [];

	const checks = await page.evaluate(() => {
		const url = window.location.href;
		const bodyText = document.body.innerText.toLowerCase();

		return {
			loginRedirect: url.includes("/accounts/login"),
			challenge: url.includes("challenge"),
			suspicious: url.includes("suspicious"),
			actionBlocked: bodyText.includes("action blocked"),
			tryAgainLater: bodyText.includes("try again later"),
			rateLimit: bodyText.includes("please wait"),
			somethingWrong: bodyText.includes("something went wrong"),
		};
	});

	if (checks.loginRedirect) flags.push("LOGIN_REDIRECT");
	if (checks.challenge) flags.push("CHALLENGE");
	if (checks.suspicious) flags.push("SUSPICIOUS_ACTIVITY");
	if (checks.actionBlocked) flags.push("ACTION_BLOCKED");
	if (checks.tryAgainLater) flags.push("TRY_AGAIN_LATER");
	if (checks.rateLimit) flags.push("RATE_LIMIT");
	if (checks.somethingWrong) flags.push("SOMETHING_WRONG");

	return flags;
}

async function runRampUpTest(args: RampUpArgs): Promise<RampUpResults> {
	const { profileId, dryRun, maxFollows = 10 } = args;
	const startTime = Date.now();

	const results: RampUpResults = {
		followsAttempted: 0,
		followsSuccessful: 0,
		flagsDetected: [],
		duration: 0,
		recommendations: [],
	};

	logger.info(
		"RAMPUP",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("RAMPUP", "🔬 Ramp-Up Test");
	logger.info(
		"RAMPUP",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("RAMPUP", `Profile: ${profileId}`);
	logger.info("RAMPUP", `Dry run: ${dryRun}`);
	logger.info("RAMPUP", `Max follows: ${maxFollows}`);
	logger.info("RAMPUP", "");

	if (dryRun) {
		logger.info(
			"RAMPUP",
			"🏃 DRY RUN MODE - No real actions will be performed",
		);
		logger.info("RAMPUP", "");
	}

	// Load profile
	const profile = await getProfileById(profileId);
	if (!profile) {
		throw new Error(`Profile not found: ${profileId}`);
	}

	logger.info(
		"RAMPUP",
		`✅ Profile loaded: @${profile.username} (${profile.type})`,
	);

	// Check limits
	const limitStatus = getLimitStatus(profile);
	logger.info("RAMPUP", `Remaining follows: ${limitStatus.remainingFollows}`);
	logger.info("RAMPUP", `Remaining DMs: ${limitStatus.remainingDms}`);

	if (!limitStatus.canFollow) {
		logger.warn("RAMPUP", "⚠️ Follow limit already reached for today");
		results.recommendations.push("Wait until daily counter resets");
		return results;
	}

	// Initialize session
	logger.info("RAMPUP", "");
	logger.info("RAMPUP", "🚀 Initializing session...");

	const session = await initializeInstagramSession({
		headless: true,
		adsPowerProfileId: profile.adsPowerProfileId,
		profileId: profile.id,
		debug: true,
	});

	const { browser, page } = session;
	const engagementTracker = new EngagementTracker();

	try {
		// Warm-up (actions tracked for engagement ratio)
		logger.info("RAMPUP", "");
		logger.info("RAMPUP", "🔥 Running warm-up...");
		await warmUpProfile(page, 1, engagementTracker);

		// Ramp-up test: gradually increase actions
		logger.info("RAMPUP", "");
		logger.info("RAMPUP", "📈 Starting ramp-up test...");

		const followsToTest = Math.min(maxFollows, limitStatus.remainingFollows);

		for (let i = 0; i < followsToTest; i++) {
			// Check for flags before each action
			const flags = await checkForFlags(page);
			if (flags.length > 0) {
				logger.warn("RAMPUP", `⚠️ Flags detected: ${flags.join(", ")}`);
				results.flagsDetected.push(...flags);

				// Stop if critical flags
				if (
					flags.includes("ACTION_BLOCKED") ||
					flags.includes("CHALLENGE") ||
					flags.includes("SUSPICIOUS_ACTIVITY")
				) {
					logger.error("RAMPUP", "🛑 Critical flag detected, stopping test");
					results.recommendations.push("Reduce action frequency");
					results.recommendations.push("Increase warm-up time");
					results.recommendations.push("Wait 24-48 hours before resuming");
					break;
				}
			}

			// Maintain engagement ratio
			if (!engagementTracker.canPerformOutbound()) {
				const needed = engagementTracker.getRequiredEngagements();
				logger.info("RAMPUP", `   Performing ${needed} engagement actions...`);
				await batchEngagements(page, engagementTracker, needed);
			}

			// Simulate follow action
			results.followsAttempted++;
			logger.info("RAMPUP", `   Follow action ${i + 1}/${followsToTest}...`);

			if (!dryRun) {
				// TODO: Add real follow logic here
				// For now, just simulate with delays
				await shortDelay(2, 5);
				engagementTracker.recordOutbound("follow");
				results.followsSuccessful++;
			} else {
				await shortDelay(0.5, 1);
			}

			// Vary timing as we ramp up
			const baseDelay = 1 + (i / followsToTest) * 3; // 1s to 4s as we progress
			await shortDelay(baseDelay, baseDelay + 2);

			// Log progress
			if ((i + 1) % 5 === 0) {
				logger.info("RAMPUP", `   Progress: ${i + 1}/${followsToTest} actions`);
				engagementTracker.logStatus();
			}
		}

		// Final flag check
		const finalFlags = await checkForFlags(page);
		if (finalFlags.length > 0) {
			results.flagsDetected.push(...finalFlags);
		}

		// Take final screenshot
		const screenshotPath = `tmp/rampup_test_${profileId}_${Date.now()}.png`;
		await page.screenshot({ path: screenshotPath, fullPage: false });
		logger.info("RAMPUP", `📸 Screenshot saved: ${screenshotPath}`);
	} finally {
		await browser.close();
	}

	results.duration = Math.floor((Date.now() - startTime) / 1000);

	// Generate recommendations
	if (results.flagsDetected.length === 0) {
		results.recommendations.push(
			"✅ No flags detected - can increase limits gradually",
		);
		results.recommendations.push(
			`Consider: ${Math.floor(maxFollows * 1.2)} follows next test`,
		);
	} else {
		const uniqueFlags = [...new Set(results.flagsDetected)];
		results.recommendations.push(
			`Flags encountered: ${uniqueFlags.join(", ")}`,
		);

		if (uniqueFlags.includes("RATE_LIMIT")) {
			results.recommendations.push("Increase delays between actions");
		}
		if (uniqueFlags.includes("TRY_AGAIN_LATER")) {
			results.recommendations.push("Reduce action volume by 30-50%");
		}
	}

	// Summary
	logger.info("RAMPUP", "");
	logger.info(
		"RAMPUP",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("RAMPUP", "📊 Test Results");
	logger.info(
		"RAMPUP",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("RAMPUP", `Follows attempted: ${results.followsAttempted}`);
	logger.info("RAMPUP", `Follows successful: ${results.followsSuccessful}`);
	logger.info(
		"RAMPUP",
		`Flags detected: ${results.flagsDetected.length > 0 ? results.flagsDetected.join(", ") : "None"}`,
	);
	logger.info("RAMPUP", `Duration: ${results.duration}s`);
	logger.info("RAMPUP", "");
	logger.info("RAMPUP", "💡 Recommendations:");
	for (const rec of results.recommendations) {
		logger.info("RAMPUP", `   ${rec}`);
	}
	logger.info(
		"RAMPUP",
		"═══════════════════════════════════════════════════════════════",
	);

	return results;
}

// Main
runRampUpTest(parseArgs())
	.then(() => process.exit(0))
	.catch((error) => {
		logger.error("RAMPUP", `Test failed: ${error}`);
		process.exit(1);
	});
