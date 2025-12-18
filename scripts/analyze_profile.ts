/**
 * Analyze a single Instagram profile
 *
 * Usage: tsx scripts/analyze_profile.ts <username>
 * Example: tsx scripts/analyze_profile.ts patreon_creator
 */

import type { Browser, Page } from "puppeteer";
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import {
	ensureLoggedIn,
	navigateToProfileAndCheck,
} from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import { CONFIDENCE_THRESHOLD } from "../functions/shared/config/config.ts";

async function analyzeProfile(username: string): Promise<void> {
	console.log(`🔍 Analyzing profile: @${username}`);

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

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

		console.log("🧠 Analyzing profile...");
		const analysis = await analyzeProfileComprehensive(page, username);

		console.log("\n📊 Analysis Results:");
		console.log(
			`Bio: ${analysis.bio ? analysis.bio.substring(0, 100) + (analysis.bio.length > 100 ? "..." : "") : "No bio found"}`,
		);
		console.log(`Confidence: ${analysis.confidence}%`);
		console.log(`Is Creator: ${analysis.isCreator ? "✅ YES" : "❌ NO"}`);
		console.log(`Reason: ${analysis.reason || "N/A"}`);

		if (analysis.links && analysis.links.length > 0) {
			console.log(`Links found: ${analysis.links.length}`);
			analysis.links.forEach((link) => console.log(`  • ${link}`));
		}

		if (analysis.indicators && analysis.indicators.length > 0) {
			console.log("Key indicators:");
			analysis.indicators.forEach((indicator) =>
				console.log(`  • ${indicator}`),
			);
		}

		const meetsThreshold = analysis.confidence >= CONFIDENCE_THRESHOLD;
		console.log(
			`\n🎯 Meets confidence threshold (${CONFIDENCE_THRESHOLD}%): ${meetsThreshold ? "✅ YES" : "❌ NO"}`,
		);
	} catch (error) {
		console.error("❌ Analysis failed:", error);
	} finally {
		await browser.close();
	}
}

// Script entry point
const username = process.argv[2];
if (!username) {
	console.error("❌ Please provide a username");
	console.error("Usage: tsx scripts/analyze_profile.ts <username>");
	process.exit(1);
}

analyzeProfile(username).catch(console.error);




