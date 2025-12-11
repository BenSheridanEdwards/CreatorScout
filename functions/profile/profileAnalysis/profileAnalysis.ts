/**
 * Profile analysis functions - basic and comprehensive analysis.
 */
import type { Page } from "puppeteer";
import { getBioFromPage } from "../../extraction/getBioFromPage/getBioFromPage.ts";
import { getLinkFromBio } from "../../extraction/getLinkFromBio/getLinkFromBio.ts";
import { getProfileStats } from "../../extraction/getProfileStats/getProfileStats.ts";
import {
	getHighlightTitlesText,
	getStoryHighlights,
	isLinkInBioHighlight,
} from "../../extraction/getStoryHighlights/getStoryHighlights.ts";
import {
	buildUniqueLinks,
	hasDirectCreatorLink,
} from "../../extraction/linkExtraction/linkExtraction.ts";
import { SKIP_VISION } from "../../shared/config/config.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { findKeywords, isLikelyCreator } from "../bioMatcher/bioMatcher.ts";
import { analyzeProfile, isConfirmedCreator } from "../vision/vision.ts";

export interface BasicAnalysisResult {
	bio: string | null;
	bioScore: number;
	isLikely: boolean;
	linkFromBio: string | null;
	confidence: number;
}

export interface ComprehensiveAnalysisResult {
	bio: string | null;
	bioScore: number;
	isLikely: boolean;
	links: string[];
	stats: {
		followers?: number;
		following?: number;
		ratio?: number;
	} | null;
	highlights: Array<{ title: string; coverUrl?: string }>;
	confidence: number;
	indicators: string[];
	screenshots: string[];
	isCreator: boolean;
	reason: string | null;
}

/**
 * Basic profile analysis - fast, lightweight.
 * Used by scrape.ts for quick filtering.
 */
export async function analyzeProfileBasic(
	page: Page,
	username: string,
): Promise<BasicAnalysisResult> {
	// Extract bio
	const bio = await getBioFromPage(page);
	if (!bio) {
		return {
			bio: null,
			bioScore: 0,
			isLikely: false,
			linkFromBio: null,
			confidence: 0,
		};
	}

	// Bio matching
	const [isLikely, scoreData] = isLikelyCreator(bio, 40, username);
	const bioScore = scoreData.score;

	// Extract link from bio
	const linkFromBio = await getLinkFromBio(page);

	return {
		bio,
		bioScore,
		isLikely,
		linkFromBio,
		confidence: bioScore,
	};
}

/**
 * Comprehensive profile analysis - deep inspection.
 * Used by check_profile.ts for detailed analysis.
 */
export async function analyzeProfileComprehensive(
	page: Page,
	username: string,
): Promise<ComprehensiveAnalysisResult> {
	const result: ComprehensiveAnalysisResult = {
		bio: null,
		bioScore: 0,
		isLikely: false,
		links: [],
		stats: null,
		highlights: [],
		confidence: 0,
		indicators: [],
		screenshots: [],
		isCreator: false,
		reason: null,
	};

	// Extract bio
	result.bio = await getBioFromPage(page);

	// Bio analysis with username
	if (result.bio) {
		const [isLikely, bioScore] = isLikelyCreator(result.bio, 40, username);
		result.isLikely = isLikely;
		result.bioScore = bioScore.score;

		if (isLikely) {
			result.confidence = Math.min(bioScore.score, 85);
			result.indicators.push(...bioScore.reasons);
		}
	}

	// Extract links
	const primary = await getLinkFromBio(page);
	const headerHrefs = await page.$$eval(
		"header a",
		(els) => els.map((e) => e.getAttribute("href")).filter(Boolean) as string[],
	);
	const html = await page.content();
	result.links = buildUniqueLinks(html, headerHrefs, primary);

	// Profile stats (follower ratio)
	const stats = await getProfileStats(page);
	result.stats = stats;
	if (stats.ratio && stats.ratio > 100) {
		result.confidence = Math.max(result.confidence, 30);
		result.indicators.push(`High follower ratio (${stats.ratio.toFixed(1)}x)`);
	}

	// Story highlights analysis
	const highlights = await getStoryHighlights(page);
	result.highlights = highlights.map((h) => ({
		title: h.title,
		coverUrl: h.coverImageUrl,
	}));

	if (highlights.length > 0) {
		// Check highlight titles for keywords
		const highlightTitles = getHighlightTitlesText(highlights);
		const highlightKeywords = findKeywords(highlightTitles);
		if (highlightKeywords.length > 0) {
			result.confidence = Math.max(result.confidence, 20);
			result.indicators.push(
				`Highlight keywords: ${highlightKeywords.join(", ")}`,
			);
		}

		const linkHighlights = highlights.filter((h) =>
			isLinkInBioHighlight(h.title),
		);
		if (linkHighlights.length > 0) {
			linkHighlights.forEach((h) => {
				result.indicators.push(`Link highlight: "${h.title}"`);
			});
			result.confidence = Math.max(result.confidence, 25);
		}
	}

	// Take profile screenshot for vision analysis
	if (highlights.length > 0 || result.confidence > 0) {
		try {
			await page.evaluate(() => {
				window.scrollTo(0, 0);
			});
			await sleep(1000);

			const profileScreenshot = await snapshot(page, `profile_${username}`);
			result.screenshots.push(profileScreenshot);

			const visionResult = await analyzeProfile(profileScreenshot);
			if (visionResult?.is_adult_creator) {
				result.isCreator = true;
				result.confidence = Math.max(
					result.confidence,
					visionResult.confidence,
				);
				if (visionResult.indicators) {
					result.indicators.push(...visionResult.indicators);
				}
				result.reason = visionResult.reason || "profile_vision";
			}
		} catch {
			// Vision analysis failed, continue
		}
	}

	// Direct Patreon shortcut
	if (hasDirectCreatorLink(result.links)) {
		result.isCreator = true;
		result.confidence = 90;
		result.reason = "direct_patreon_link";
	}

	// Final decision based on combined signals
	if (!result.isCreator && result.confidence >= 50) {
		result.isCreator = true;
		result.reason = result.reason || "combined_signals";
	}

	return result;
}

/**
 * Analyze linktree/aggregator link with vision.
 * Used by both scripts for link analysis.
 */
export async function analyzeLinkWithVision(
	page: Page,
	linkUrl: string,
	username: string,
	screenshotPrefix: string = "linktree",
): Promise<{
	isCreator: boolean;
	confidence: number;
	screenshotPath: string | null;
}> {
	if (SKIP_VISION) {
		return { isCreator: false, confidence: 0, screenshotPath: null };
	}

	try {
		await page.goto(linkUrl, {
			waitUntil: "networkidle2",
			timeout: 15000,
		});
		await sleep(3000);

		// Take screenshot
		const screenshotPath = await snapshot(
			page,
			`${screenshotPrefix}_${username}`,
		);

		// Vision analysis
		const [isCreator, visionData] = await isConfirmedCreator(screenshotPath);

		if (isCreator && visionData) {
			return {
				isCreator: true,
				confidence: visionData.confidence || 0,
				screenshotPath,
			};
		}

		return { isCreator: false, confidence: 0, screenshotPath };
	} catch {
		return { isCreator: false, confidence: 0, screenshotPath: null };
	}
}
