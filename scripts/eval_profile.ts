/**
 * Evaluate a single Instagram profile
 *
 * Usage:
 *   npm run eval <username>
 *
 * Example:
 *   npm run eval real_siaasmr
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { navigateToProfileAndCheck } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import {
	markAsCreator,
	markVisited,
} from "../functions/shared/database/database.ts";

async function evaluateProfile(username: string) {
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
	console.log(`🔍 Evaluating profile: @${username}`);
	console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

	const startTime = Date.now();

	const { browser, page } = await initializeInstagramSession({
		headless: false,
		debug: true,
	});

	try {
		// Navigate to profile
		console.log(`📍 Navigating to @${username}...`);
		const status = await navigateToProfileAndCheck(page, username, {
			timeout: 15000,
		});

		if (status.notFound) {
			console.log("❌ Profile not found");
			return;
		}

		if (status.isPrivate) {
			console.log("🔒 Profile is private");
			return;
		}

		console.log(`✅ Profile loaded`);

		// Analyze profile
		console.log(`🔬 Analyzing profile...`);
		const analysis = await analyzeProfileComprehensive(page, username);

		// Mark as visited in database
		await markVisited(
			username,
			undefined,
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

		// Mark as creator if confidence is high enough
		if (analysis.isCreator) {
			await markAsCreator(username, analysis.confidence);
		}

		// Display results
		console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
		console.log(`📊 ANALYSIS RESULTS`);
		console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

		console.log(`
👤 Username:     @${username}
📝 Bio:          ${analysis.bio || "(none)"}
🔗 Link:         ${analysis.linkUrl || "(none)"}

📊 Scores:
   Bio Score:    ${analysis.bioScore}%
   Confidence:   ${analysis.confidence}%
   Is Creator:   ${analysis.isCreator ? "✅ YES" : "❌ NO"}

🎯 Indicators:
${analysis.indicators?.map((i) => `   • ${i}`).join("\n") || "   (none)"}

💡 Reason: ${analysis.reason || "(none)"}
		`);

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		console.log(`⏱️  Completed in ${duration}s`);
		console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

		// Recommendation
		if (analysis.isCreator && analysis.confidence >= 70) {
			console.log("\n✅ RECOMMENDATION: Strong creator signals - AUTO APPROVE");
		} else if (analysis.isCreator && analysis.confidence >= 50) {
			console.log(
				"\n⚠️  RECOMMENDATION: Moderate signals - MANUAL REVIEW recommended",
			);
		} else if (analysis.confidence < 50 && analysis.confidence > 30) {
			console.log("\n❓ RECOMMENDATION: Weak signals - likely NOT a creator");
		} else {
			console.log("\n❌ RECOMMENDATION: Very low confidence - NOT a creator");
		}

		console.log(`\n💡 View profile: https://instagram.com/${username}\n`);
	} catch (error) {
		console.error(`❌ Error: ${error}`);
		throw error;
	} finally {
		console.log("🔒 Closing browser...");
		await browser.close();
	}
}

// Parse command line arguments
const username = process.argv[2];

if (!username) {
	console.error("❌ Usage: npm run eval <username>");
	console.error("\nExample:");
	console.error("  npm run eval real_siaasmr");
	process.exit(1);
}

// Remove @ if present
const cleanUsername = username.replace(/^@/, "");

// Run evaluation
evaluateProfile(cleanUsername)
	.then(() => {
		console.log("✅ Evaluation complete");
		process.exit(0);
	})
	.catch((error) => {
		console.error("❌ Evaluation failed:", error);
		process.exit(1);
	});
