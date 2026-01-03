/**
 * Evaluate multiple Instagram profiles in batch
 *
 * Usage:
 *   npm run eval-batch [--profile <id>] <username1> <username2> <username3> ...
 *
 * Example:
 *   npm run eval-batch elaskas wettmelons utahjaz lilylaness
 *   npm run eval-batch --profile test-account elaskas wettmelons
 *
 * Note: Uses credentials from profiles.config.json (defaults to test-account)
 */

import type { Page } from "puppeteer";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { navigateToProfileAndCheck } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import { CONFIDENCE_THRESHOLD } from "../functions/shared/config/config.ts";
import {
	markAsCreator,
	markVisited,
} from "../functions/shared/database/database.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";

interface ProfileResult {
	username: string;
	success: boolean;
	isCreator: boolean;
	confidence: number;
	bioScore: number;
	reason?: string;
	error?: string;
	duration: number;
}

async function evaluateProfile(
	page: Page,
	username: string,
): Promise<ProfileResult> {
	const startTime = Date.now();
	console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`🔍 Evaluating profile: @${username}`);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

	try {
		// Navigate to profile
		console.log(`📍 Navigating to @${username}...`);
		const status = await navigateToProfileAndCheck(page, username, {
			timeout: 15000,
		});

		if (status.notFound) {
			console.log("❌ Profile not found");
			return {
				username,
				success: false,
				isCreator: false,
				confidence: 0,
				bioScore: 0,
				error: "Profile not found",
				duration: Date.now() - startTime,
			};
		}

		if (status.isPrivate) {
			console.log("🔒 Profile is private");
			return {
				username,
				success: false,
				isCreator: false,
				confidence: 0,
				bioScore: 0,
				error: "Profile is private",
				duration: Date.now() - startTime,
			};
		}

		console.log(`✅ Profile loaded`);

		// Analyze profile
		console.log(`📊 Analyzing profile...`);
		const analysis = await analyzeProfileComprehensive(page, username);

		console.log(`\n✅ Analysis complete!`);

		// Save to database
		await markVisited(
			username,
			undefined, // displayName - not available in ComprehensiveAnalysisResult
			analysis.bio || undefined,
			analysis.bioScore,
			analysis.links?.[0] || undefined,
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

		if (analysis.isCreator) {
			await markAsCreator(username, analysis.confidence);
		}

		// Display results
		console.log(`\n📋 Results for @${username}:`);
		console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
		console.log(
			`${analysis.isCreator ? "✅" : "❌"} Is Creator: ${analysis.isCreator ? "YES" : "NO"}`,
		);
		console.log(`📊 Confidence: ${analysis.confidence}%`);
		console.log(`📈 Bio Score: ${analysis.bioScore}%`);
		if (analysis.reason) {
			console.log(`💡 Reason: ${analysis.reason}`);
		}
		if (analysis.indicators && analysis.indicators.length > 0) {
			console.log(`🔍 Indicators:`);
			analysis.indicators.slice(0, 3).forEach((indicator) => {
				console.log(`   • ${indicator}`);
			});
		}
		if (analysis.isCreator && analysis.confidence >= CONFIDENCE_THRESHOLD) {
			console.log(
				`\n🎯 Action: AUTO-APPROVED (confidence ≥ ${CONFIDENCE_THRESHOLD}%)`,
			);
		} else if (analysis.isCreator) {
			console.log(
				`\n⚠️  Action: DETECTED but below threshold (${CONFIDENCE_THRESHOLD}%)`,
			);
		} else {
			console.log(`\n❌ Action: NOT A CREATOR`);
		}

		const duration = Date.now() - startTime;
		console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

		return {
			username,
			success: true,
			isCreator: analysis.isCreator,
			confidence: analysis.confidence,
			bioScore: analysis.bioScore,
			reason: analysis.reason || undefined,
			duration,
		};
	} catch (error) {
		console.error(`❌ Error analyzing @${username}:`, error);
		return {
			username,
			success: false,
			isCreator: false,
			confidence: 0,
			bioScore: 0,
			error: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		};
	}
}

async function main() {
	const args = process.argv.slice(2);

	// Parse profile flag (optional, defaults to test-account)
	let profileId = "test-account";
	const profileIdx = args.findIndex((a) => a === "--profile");
	if (profileIdx !== -1 && args[profileIdx + 1]) {
		profileId = args[profileIdx + 1];
		// Remove profile args from usernames
		args.splice(profileIdx, 2);
	}

	const usernames = args;

	if (usernames.length === 0) {
		console.log("❌ No usernames provided");
		console.log(
			"\nUsage: npm run eval-batch [--profile <id>] <username1> <username2> ...",
		);
		console.log("Example: npm run eval-batch elaskas wettmelons utahjaz");
		console.log(
			"Example: npm run eval-batch --profile test-account elaskas wettmelons",
		);
		process.exit(1);
	}

	// Load profile config
	const profileConfig = getProfile(profileId);
	if (!profileConfig) {
		console.error(`❌ Profile not found: ${profileId}`);
		console.error("Available profiles are defined in profiles.config.json");
		process.exit(1);
	}

	console.log(`📋 Using profile: @${profileConfig.username}`);
	if (profileConfig.adsPowerProfileId) {
		console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);
	}

	console.log(
		`\n🚀 Starting batch evaluation for ${usernames.length} profiles`,
	);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`📝 Profiles: ${usernames.join(", ")}`);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

	const overallStartTime = Date.now();

	// Initialize browser session once with profile credentials
	console.log(`\n🌐 Initializing Instagram session...`);
	const { browser, page } = await initializeInstagramSession({
		headless: false,
		debug: false,
		adsPowerProfileId: profileConfig.adsPowerProfileId,
		credentials: {
			username: profileConfig.username,
			password: profileConfig.password,
		},
	});

	const results: ProfileResult[] = [];

	try {
		// Process each username
		for (let i = 0; i < usernames.length; i++) {
			const username = usernames[i].trim().toLowerCase().replace("@", "");
			console.log(
				`\n[${i + 1}/${usernames.length}] Processing @${username}...`,
			);

			const result = await evaluateProfile(page, username);
			results.push(result);

			// Small delay between profiles
			if (i < usernames.length - 1) {
				console.log(`\n⏳ Waiting 2s before next profile...`);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}
	} finally {
		// Always close browser
		console.log(`\n🔒 Closing browser...`);
		browser.disconnect();

		// Stop AdsPower profile
		if (profileConfig.adsPowerProfileId) {
			try {
				await stopAdsPowerProfile(profileConfig.adsPowerProfileId);
				console.log("✅ AdsPower profile stopped");
			} catch (e) {
				console.warn(`⚠️  Could not stop AdsPower profile: ${e}`);
			}
		}
	}

	// Display summary
	const overallDuration = Date.now() - overallStartTime;
	const successCount = results.filter((r) => r.success).length;
	const creatorCount = results.filter((r) => r.isCreator).length;
	const autoApprovedCount = results.filter(
		(r) => r.isCreator && r.confidence >= CONFIDENCE_THRESHOLD,
	).length;

	console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`📊 BATCH EVALUATION SUMMARY`);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`📝 Total Profiles: ${usernames.length}`);
	console.log(`✅ Successful: ${successCount}`);
	console.log(`❌ Failed: ${usernames.length - successCount}`);
	console.log(`🎯 Creators Found: ${creatorCount}`);
	console.log(
		`🚀 Auto-Approved: ${autoApprovedCount} (≥${CONFIDENCE_THRESHOLD}%)`,
	);
	console.log(
		`⏱️  Total Duration: ${(overallDuration / 1000).toFixed(2)}s (${(overallDuration / 1000 / usernames.length).toFixed(2)}s per profile)`,
	);
	console.log(`\n📋 Individual Results:`);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

	results.forEach((result) => {
		const statusEmoji = result.success
			? result.isCreator
				? "✅"
				: "❌"
			: "⚠️ ";
		const autoApproved =
			result.isCreator && result.confidence >= CONFIDENCE_THRESHOLD
				? " 🚀"
				: "";
		console.log(
			`${statusEmoji} @${result.username.padEnd(20)} ${result.success ? `${result.confidence}% confidence, ${result.bioScore}% bio${autoApproved}` : `ERROR: ${result.error}`}`,
		);
	});

	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main()
	.then(() => {
		console.log("✅ Batch evaluation complete!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("❌ Batch evaluation failed:", error);
		process.exit(1);
	});
