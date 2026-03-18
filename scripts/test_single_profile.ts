#!/usr/bin/env npx tsx
/**
 * Test script for analyzing a single Instagram profile
 * Outputs detailed analysis for building test assertions
 *
 * Usage: npx tsx scripts/test_single_profile.ts <username>
 * Example: npx tsx scripts/test_single_profile.ts raeleerudolph22
 */

import "dotenv/config";
import type { Page } from "puppeteer";
import {
	getBioFromPage,
	validateBioExtraction,
} from "../functions/extraction/getBioFromPage/getBioFromPage.ts";
import {
	clickBioLink,
	getLinkFromBio,
} from "../functions/extraction/getLinkFromBio/getLinkFromBio.ts";
import { getProfileStats } from "../functions/extraction/getProfileStats/getProfileStats.ts";
import { getStoryHighlights } from "../functions/extraction/getStoryHighlights/getStoryHighlights.ts";
import {
	connectToAdsPowerProfile,
	stopAdsPowerProfile,
} from "../functions/navigation/browser/adsPowerConnector.ts";
import { calculateScore } from "../functions/profile/bioMatcher/bioMatcher.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import {
	analyzeLinktree,
	analyzeProfile,
} from "../functions/profile/vision/vision.ts";
import {
	getPrismaClient,
	initDb,
} from "../functions/shared/database/database.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import { shortDelay } from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

interface ProfileTestResult {
	username: string;
	timestamp: string;
	url: string;

	// Raw extraction results
	extraction: {
		bio: string | null;
		bioValidation: {
			valid: boolean;
			correctedBio: string | null;
		} | null;
		stats: {
			followers: number | null;
			following: number | null;
			posts: number | null;
			ratio: number | null;
		};
		highlights: Array<{
			title: string;
			coverUrl?: string;
		}>;
		primaryLink: string | null;
		allLinks: string[];
	};

	// Analysis results
	analysis: {
		bioScore: number;
		bioReasons: string[];
		comprehensiveConfidence: number;
		comprehensiveIndicators: string[];
		isCreator: boolean;
		reason: string | null;
	};

	// Vision analysis (if screenshots taken)
	vision: {
		profileAnalysis: {
			isCreator: boolean;
			confidence: number;
			indicators: string[];
			reason: string;
		} | null;
		linkPageAnalysis: {
			isCreator: boolean;
			confidence: number;
			indicators: string[];
			platform_links: string[];
			reason: string;
		} | null;
	};

	// Screenshots taken
	screenshots: {
		profile: string | null;
		linkPage: string | null;
	};

	// Database state (if exists)
	database: {
		exists: boolean;
		isCreator: boolean | null;
		confidence: number | null;
		bioText: string | null;
	} | null;

	// Final verdict
	verdict: {
		isCreator: boolean;
		confidence: number;
		primaryReason: string;
		allReasons: string[];
	};
}

async function extractAllLinks(page: Page): Promise<string[]> {
	try {
		const links = await page.$$eval("header a[href]", (els) =>
			els
				.map((e) => e.getAttribute("href"))
				.filter((h): h is string => h !== null && h.startsWith("http")),
		);
		return [...new Set(links)];
	} catch {
		return [];
	}
}

async function testProfile(username: string): Promise<ProfileTestResult> {
	const result: ProfileTestResult = {
		username,
		timestamp: new Date().toISOString(),
		url: `https://www.instagram.com/${username}/`,
		extraction: {
			bio: null,
			bioValidation: null,
			stats: { followers: null, following: null, posts: null, ratio: null },
			highlights: [],
			primaryLink: null,
			allLinks: [],
		},
		analysis: {
			bioScore: 0,
			bioReasons: [],
			comprehensiveConfidence: 0,
			comprehensiveIndicators: [],
			isCreator: false,
			reason: null,
		},
		vision: {
			profileAnalysis: null,
			linkPageAnalysis: null,
		},
		screenshots: {
			profile: null,
			linkPage: null,
		},
		database: null,
		verdict: {
			isCreator: false,
			confidence: 0,
			primaryReason: "Not analyzed",
			allReasons: [],
		},
	};

	console.log("\n" + "=".repeat(60));
	console.log(`🔍 TESTING PROFILE: @${username}`);
	console.log("=".repeat(60));

	// Connect to browser
	const profileId = process.env.ADSPOWER_PROFILE_ID || "k188xsiv";
	console.log(`\n📱 Connecting to AdsPower profile: ${profileId}`);
	const browser = await connectToAdsPowerProfile(profileId);
	const pages = await browser.pages();
	const page = pages[0] || (await browser.newPage());

	try {
		// Navigate to profile
		console.log(`\n🌐 Navigating to ${result.url}`);
		await page.goto(result.url, { waitUntil: "networkidle2", timeout: 30000 });
		await shortDelay(1, 2);

		// ===== STEP 1: RAW EXTRACTION =====
		console.log("\n" + "-".repeat(40));
		console.log("📋 STEP 1: Raw Data Extraction");
		console.log("-".repeat(40));

		// Bio extraction
		console.log("\n[BIO] Extracting bio text...");
		result.extraction.bio = await getBioFromPage(page);
		console.log(
			`[BIO] Result: ${result.extraction.bio ? `"${result.extraction.bio}"` : "NULL"}`,
		);

		// Bio validation with vision
		if (!result.extraction.bio || result.extraction.bio.length < 30) {
			console.log("[BIO] Bio looks short/empty, validating with vision...");
			result.extraction.bioValidation = await validateBioExtraction(
				page,
				result.extraction.bio,
				username,
			);
			console.log(
				`[BIO] Validation: ${JSON.stringify(result.extraction.bioValidation)}`,
			);
		}

		// Stats extraction
		console.log("\n[STATS] Extracting profile stats...");
		const stats = await getProfileStats(page);
		result.extraction.stats = {
			followers: stats.followers,
			following: stats.following,
			posts: stats.posts,
			ratio: stats.ratio,
		};
		console.log(
			`[STATS] Followers: ${stats.followers?.toLocaleString() || "N/A"}`,
		);
		console.log(
			`[STATS] Following: ${stats.following?.toLocaleString() || "N/A"}`,
		);
		console.log(`[STATS] Posts: ${stats.posts?.toLocaleString() || "N/A"}`);
		console.log(`[STATS] Ratio: ${stats.ratio?.toFixed(2) || "N/A"}`);

		// Highlights extraction
		console.log("\n[HIGHLIGHTS] Extracting story highlights...");
		const highlights = await getStoryHighlights(page);
		result.extraction.highlights = highlights.map((h) => ({
			title: h.title,
			coverUrl: h.coverImageUrl ?? undefined,
		}));
		console.log(`[HIGHLIGHTS] Found ${highlights.length} highlights:`);
		for (const h of highlights) {
			console.log(`  - "${h.title}"`);
		}

		// Link extraction
		console.log("\n[LINKS] Extracting links...");
		result.extraction.primaryLink = await getLinkFromBio(page);
		result.extraction.allLinks = await extractAllLinks(page);
		console.log(
			`[LINKS] Primary link: ${result.extraction.primaryLink || "N/A"}`,
		);
		console.log(
			`[LINKS] All links: ${result.extraction.allLinks.join(", ") || "None"}`,
		);

		// ===== STEP 2: TAKE PROFILE SCREENSHOT =====
		console.log("\n" + "-".repeat(40));
		console.log("📸 STEP 2: Profile Screenshot & Vision Analysis");
		console.log("-".repeat(40));

		result.screenshots.profile = await snapshot(
			page,
			`test_profile_${username}`,
		);
		console.log(`[SCREENSHOT] Profile saved: ${result.screenshots.profile}`);

		// Vision analysis of profile
		console.log("[VISION] Analyzing profile screenshot...");
		try {
			const profileVision = await analyzeProfile(result.screenshots.profile);
			if (profileVision) {
				result.vision.profileAnalysis = {
					isCreator: profileVision.isCreator,
					confidence: profileVision.confidence,
					indicators: profileVision.indicators,
					reason: profileVision.reason,
				};
				console.log(
					`[VISION] Is influencer: ${profileVision.isCreator}`,
				);
				console.log(`[VISION] Confidence: ${profileVision.confidence}`);
				console.log(
					`[VISION] Indicators: ${profileVision.indicators.join(", ")}`,
				);
				console.log(`[VISION] Reason: ${profileVision.reason}`);
			} else {
				console.log("[VISION] Profile analysis returned null");
			}
		} catch (e) {
			console.log(`[VISION] Profile analysis error: ${e}`);
		}

		// ===== STEP 3: BIO SCORING =====
		console.log("\n" + "-".repeat(40));
		console.log("🎯 STEP 3: Bio Scoring");
		console.log("-".repeat(40));

		if (result.extraction.bio) {
			const bioScore = calculateScore(result.extraction.bio, username);
			result.analysis.bioScore = bioScore.score;
			result.analysis.bioReasons = bioScore.reasons;
			console.log(`[SCORE] Bio score: ${bioScore.score}`);
			console.log(`[SCORE] Reasons: ${bioScore.reasons.join(", ") || "None"}`);
		} else {
			console.log("[SCORE] No bio to score");
		}

		// ===== STEP 4: CLICK BIO LINK =====
		console.log("\n" + "-".repeat(40));
		console.log("🔗 STEP 4: Bio Link Click & Analysis");
		console.log("-".repeat(40));

		if (result.extraction.primaryLink) {
			console.log("[LINK] Attempting to click bio link...");
			const profileUrl = page.url();
			const clickResult = await clickBioLink(page);
			console.log(`[LINK] Click result: ${JSON.stringify(clickResult)}`);

			if (clickResult.success && clickResult.finalUrl) {
				// First, do text-based analysis (fast and free)
				console.log("[LINK] Running text-based analysis...");
				const { analyzeExternalLink } = await import(
					"../functions/extraction/linkExtraction/linkExtraction.ts"
				);
				const textAnalysis = await analyzeExternalLink(
					page,
					clickResult.finalUrl,
				);
				console.log(
					`[LINK] Text analysis: isCreator=${textAnalysis.isCreator}, confidence=${textAnalysis.confidence}`,
				);
				console.log(
					`[LINK] Text indicators: ${textAnalysis.indicators.join(", ")}`,
				);

				// Take screenshot of link page
				result.screenshots.linkPage = await snapshot(
					page,
					`test_linkpage_${username}`,
				);
				console.log(
					`[SCREENSHOT] Link page saved: ${result.screenshots.linkPage}`,
				);

				// Only call vision if text analysis confidence is below threshold
				const { VISION_SKIP_THRESHOLD } = await import(
					"../functions/extraction/linkExtraction/linkExtraction.ts"
				);
				if (textAnalysis.confidence >= VISION_SKIP_THRESHOLD) {
					console.log(
						`[VISION] Skipping link page vision - text confidence ${textAnalysis.confidence}% >= ${VISION_SKIP_THRESHOLD}% threshold`,
					);
					// Use text analysis results as "vision" results for consistency
					result.vision.linkPageAnalysis = {
						isCreator: textAnalysis.isCreator,
						confidence: textAnalysis.confidence,
						indicators: textAnalysis.indicators,
						platform_links: [],
						reason: `Text analysis: ${textAnalysis.reason}`,
					};
				} else {
					// Vision analysis of link page (only when text analysis is uncertain)
					console.log(
						`[VISION] Text confidence ${textAnalysis.confidence}% < ${VISION_SKIP_THRESHOLD}%, running vision analysis...`,
					);
					try {
						const linkVision = await analyzeLinktree(
							result.screenshots.linkPage,
						);
						if (linkVision) {
							result.vision.linkPageAnalysis = {
								isCreator: linkVision.isCreator,
								confidence: linkVision.confidence,
								indicators: linkVision.indicators,
								platform_links: linkVision.platform_links,
								reason: linkVision.reason,
							};
							console.log(
								`[VISION] Is influencer: ${linkVision.isCreator}`,
							);
							console.log(`[VISION] Confidence: ${linkVision.confidence}`);
							console.log(
								`[VISION] Indicators: ${linkVision.indicators.join(", ")}`,
							);
							console.log(
								`[VISION] Platform links: ${linkVision.platform_links.join(", ")}`,
							);
							console.log(`[VISION] Reason: ${linkVision.reason}`);
						} else {
							console.log("[VISION] Link page analysis returned null");
						}
					} catch (e) {
						console.log(`[VISION] Link page analysis error: ${e}`);
					}
				}

				// Navigate back to profile
				console.log("[LINK] Navigating back to profile...");
				await page.goto(profileUrl, {
					waitUntil: "networkidle2",
					timeout: 15000,
				});
				await shortDelay(0.5, 1);
			}
		} else {
			console.log("[LINK] No bio link to click");
		}

		// ===== STEP 5: COMPREHENSIVE ANALYSIS =====
		console.log("\n" + "-".repeat(40));
		console.log("🔬 STEP 5: Comprehensive Profile Analysis");
		console.log("-".repeat(40));

		const comprehensive = await analyzeProfileComprehensive(page, username);
		result.analysis.comprehensiveConfidence = comprehensive.confidence;
		result.analysis.comprehensiveIndicators = comprehensive.indicators;
		result.analysis.isCreator = comprehensive.isCreator;
		result.analysis.reason = comprehensive.reason;

		console.log(`[ANALYSIS] Confidence: ${comprehensive.confidence}`);
		console.log(`[ANALYSIS] Is Creator: ${comprehensive.isCreator}`);
		console.log(`[ANALYSIS] Reason: ${comprehensive.reason}`);
		console.log(`[ANALYSIS] Indicators:`);
		for (const ind of comprehensive.indicators) {
			console.log(`  - ${ind}`);
		}

		// ===== STEP 6: DATABASE CHECK =====
		console.log("\n" + "-".repeat(40));
		console.log("💾 STEP 6: Database State");
		console.log("-".repeat(40));

		try {
			await initDb();
			const prisma = getPrismaClient();
			const dbProfile = await prisma.profile.findUnique({
				where: { username },
			});

			if (dbProfile) {
				result.database = {
					exists: true,
					isCreator: dbProfile.isCreator,
					confidence: dbProfile.confidence,
					bioText: dbProfile.bioText,
				};
				console.log(`[DB] Profile exists in database`);
				console.log(`[DB] Is Creator: ${dbProfile.isCreator}`);
				console.log(`[DB] Confidence: ${dbProfile.confidence}`);
				console.log(`[DB] Bio: ${dbProfile.bioText || "N/A"}`);
			} else {
				result.database = {
					exists: false,
					isCreator: null,
					confidence: null,
					bioText: null,
				};
				console.log(`[DB] Profile NOT in database`);
			}
		} catch (e) {
			console.log(`[DB] Database check error: ${e}`);
		}

		// ===== STEP 7: FINAL VERDICT =====
		console.log("\n" + "-".repeat(40));
		console.log("⚖️  STEP 7: Final Verdict");
		console.log("-".repeat(40));

		const allReasons: string[] = [];

		// Collect all reasons
		if (result.analysis.bioReasons.length > 0) {
			allReasons.push(...result.analysis.bioReasons.map((r) => `[Bio] ${r}`));
		}
		if (result.analysis.comprehensiveIndicators.length > 0) {
			allReasons.push(
				...result.analysis.comprehensiveIndicators.map(
					(r) => `[Analysis] ${r}`,
				),
			);
		}
		if (result.vision.profileAnalysis?.indicators.length) {
			allReasons.push(
				...result.vision.profileAnalysis.indicators.map(
					(r) => `[ProfileVision] ${r}`,
				),
			);
		}
		if (result.vision.linkPageAnalysis?.indicators.length) {
			allReasons.push(
				...result.vision.linkPageAnalysis.indicators.map(
					(r) => `[LinkVision] ${r}`,
				),
			);
		}

		// Determine final verdict
		const maxConfidence = Math.max(
			result.analysis.bioScore,
			result.analysis.comprehensiveConfidence,
			result.vision.profileAnalysis?.confidence || 0,
			result.vision.linkPageAnalysis?.confidence || 0,
		);

		const isCreator =
			result.analysis.isCreator ||
			result.vision.profileAnalysis?.isCreator ||
			result.vision.linkPageAnalysis?.isCreator ||
			maxConfidence >= 70;

		let primaryReason = "No strong indicators found";
		if (result.vision.linkPageAnalysis?.isCreator) {
			primaryReason = `Link page confirms: ${result.vision.linkPageAnalysis.reason}`;
		} else if (result.vision.profileAnalysis?.isCreator) {
			primaryReason = `Profile analysis confirms: ${result.vision.profileAnalysis.reason}`;
		} else if (result.analysis.isCreator) {
			primaryReason =
				result.analysis.reason || "Comprehensive analysis confirmed";
		} else if (result.analysis.bioScore >= 70) {
			primaryReason = `High bio score: ${result.analysis.bioReasons.join(", ")}`;
		}

		result.verdict = {
			isCreator,
			confidence: maxConfidence,
			primaryReason,
			allReasons,
		};

		console.log(
			`\n${"🟢".repeat(isCreator ? 1 : 0)}${"🔴".repeat(isCreator ? 0 : 1)} VERDICT: ${isCreator ? "IS CREATOR" : "NOT CREATOR"}`,
		);
		console.log(`📊 Confidence: ${maxConfidence}`);
		console.log(`📝 Primary Reason: ${primaryReason}`);
		console.log(`\n📋 All Reasons (${allReasons.length}):`);
		for (const reason of allReasons) {
			console.log(`  • ${reason}`);
		}
	} finally {
		browser.disconnect();
		await stopAdsPowerProfile(profileId);
	}

	return result;
}

async function main() {
	const username = process.argv[2];

	if (!username) {
		console.error("Usage: npx tsx scripts/test_single_profile.ts <username>");
		console.error(
			"Example: npx tsx scripts/test_single_profile.ts raeleerudolph22",
		);
		process.exit(1);
	}

	// Remove @ if provided
	const cleanUsername = username.replace(/^@/, "").replace(/\/$/, "");

	try {
		const result = await testProfile(cleanUsername);

		// Output JSON for test assertions
		console.log("\n" + "=".repeat(60));
		console.log("📄 JSON OUTPUT (for test assertions)");
		console.log("=".repeat(60));
		console.log(JSON.stringify(result, null, 2));

		// Summary for quick reference
		console.log("\n" + "=".repeat(60));
		console.log("📊 SUMMARY");
		console.log("=".repeat(60));
		console.log(`Username: @${result.username}`);
		console.log(`Is Creator: ${result.verdict.isCreator ? "✅ YES" : "❌ NO"}`);
		console.log(`Confidence: ${result.verdict.confidence}%`);
		console.log(`Bio Score: ${result.analysis.bioScore}`);
		console.log(
			`Profile Vision: ${result.vision.profileAnalysis?.confidence || "N/A"}%`,
		);
		console.log(
			`Link Vision: ${result.vision.linkPageAnalysis?.confidence || "N/A"}%`,
		);
		console.log(`Primary Reason: ${result.verdict.primaryReason}`);
		console.log(`Screenshots:`);
		console.log(`  - Profile: ${result.screenshots.profile}`);
		console.log(`  - Link Page: ${result.screenshots.linkPage || "N/A"}`);
	} catch (e) {
		console.error("Error testing profile:", e);
		process.exit(1);
	}
}

main();
