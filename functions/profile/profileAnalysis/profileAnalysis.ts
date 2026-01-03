/**
 * Profile analysis functions - basic and comprehensive analysis.
 */
import type { Page } from "puppeteer";
import {
	getBioFromPage,
	validateBioExtraction,
} from "../../extraction/getBioFromPage/getBioFromPage.ts";
import {
	clickBioLink,
	getLinkFromBio,
} from "../../extraction/getLinkFromBio/getLinkFromBio.ts";
import { getProfileStats } from "../../extraction/getProfileStats/getProfileStats.ts";
import {
	getHighlightTitlesText,
	getStoryHighlights,
	isLinkInBioHighlight,
} from "../../extraction/getStoryHighlights/getStoryHighlights.ts";
import {
	analyzeExternalLink,
	buildUniqueLinks,
	decodeInstagramRedirect,
	hasDirectCreatorLink,
	VISION_SKIP_THRESHOLD,
} from "../../extraction/linkExtraction/linkExtraction.ts";
import { executeWithCircuitBreaker } from "../../shared/circuitBreaker/circuitBreaker.ts";
import {
	CONFIDENCE_THRESHOLD,
	SKIP_VISION,
} from "../../shared/config/config.ts";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

import { recordActivity } from "../../shared/dashboard/dashboard.ts";
import { queueAdd } from "../../shared/database/database.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { mediumDelay, shortDelay } from "../../timing/humanize/humanize.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { findKeywords, isLikelyCreator } from "../bioMatcher/bioMatcher.ts";
import { isConfirmedCreator } from "../vision/vision.ts";

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
	errors?: string[];
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

	// Queue referenced Instagram profiles for follow-up analysis
	if (scoreData.referencedProfiles && scoreData.referencedProfiles.length > 0) {
		logger.info(
			"ANALYSIS",
			`📎 Bio references other profiles: ${scoreData.referencedProfiles.map((p) => "@" + p).join(", ")}`,
		);

		for (const refProfile of scoreData.referencedProfiles) {
			try {
				await queueAdd(refProfile, 15, "referenced_profile");
				logger.info(
					"ANALYSIS",
					`  ➕ Added @${refProfile} to queue for analysis`,
				);
			} catch (error) {
				logger.info("ANALYSIS", `  ⚠️ Failed to queue @${refProfile}: ${error}`);
			}
		}
	}

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
		errors: [],
		isCreator: false,
		reason: null,
	};

	// Extract bio
	result.bio = await getBioFromPage(page);

	// Validate bio extraction if it looks short or empty
	if (!result.bio || result.bio.length < 30) {
		const validation = await validateBioExtraction(page, result.bio, username);
		if (!validation.valid && validation.correctedBio) {
			logger.warn(
				"ANALYSIS",
				`Bio validation corrected: "${result.bio}" -> "${validation.correctedBio}"`,
			);
			result.bio = validation.correctedBio;
		}
	}

	// Bio analysis with username
	if (result.bio) {
		const [isLikely, bioScore] = isLikelyCreator(result.bio, 40, username);
		result.isLikely = isLikely;
		result.bioScore = bioScore.score;

		if (isLikely) {
			result.confidence = Math.min(bioScore.score, 85);
			result.indicators.push(...bioScore.reasons);
		}

		// Queue referenced Instagram profiles for follow-up analysis
		if (bioScore.referencedProfiles && bioScore.referencedProfiles.length > 0) {
			logger.info(
				"ANALYSIS",
				`📎 Bio references other profiles: ${bioScore.referencedProfiles.map((p) => "@" + p).join(", ")}`,
			);

			for (const refProfile of bioScore.referencedProfiles) {
				try {
					await queueAdd(refProfile, 15, "referenced_profile");
					logger.info(
						"ANALYSIS",
						`  ➕ Added @${refProfile} to queue for analysis`,
					);
				} catch (error) {
					logger.info(
						"ANALYSIS",
						`  ⚠️ Failed to queue @${refProfile}: ${error}`,
					);
				}
			}
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

	result.stats = {
		followers: stats.followers ?? undefined,
		following: stats.following ?? undefined,
		ratio: stats.ratio ?? undefined,
	};

	if (stats.ratio && stats.ratio > 100) {
		result.confidence = Math.max(result.confidence, 30);
		result.indicators.push(`High follower ratio (${stats.ratio.toFixed(1)}x)`);
	}

	// Story highlights analysis
	const highlights = await getStoryHighlights(page);
	result.highlights = highlights.map((h) => ({
		title: h.title,
		coverUrl: h.coverImageUrl ?? undefined,
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

			// Boost confidence if bio also mentions highlights (but not too much)
			const bioMentionsHighlights =
				result.bio &&
				(result.bio.toLowerCase().includes("in my highlight") ||
					result.bio.toLowerCase().includes("check my highlight") ||
					result.bio.toLowerCase().includes("what you're looking for is in"));

			if (bioMentionsHighlights && linkHighlights.length > 0) {
				// Bio directs to highlights + link names = medium-high signal (50%)
				result.confidence = Math.max(result.confidence, 50);
				result.indicators.push(
					"Bio directs to highlights with link names",
				);
			} else {
				// Link highlights alone = low-medium signal (30%)
				result.confidence = Math.max(result.confidence, 30);
			}
		}
	}

	// Analyze external links properly
	const externalLinks = result.links
		.map((link) => decodeInstagramRedirect(link)) // Decode Instagram redirects
		.filter((link) => link?.includes("http") && !link.includes("instagram.com"))
		.filter((link, index, arr) => arr.indexOf(link) === index); // Remove duplicates

	if (externalLinks.length > 0) {
		result.indicators.push("External links in profile");
		
		// ALWAYS check links - they're the best indicator of a creator
		logger.info("ANALYSIS", `🔗 Found ${externalLinks.length} external link(s) - checking all regardless of bio score`);

		// Save current URL to return to profile
		const profileUrl = page.url();

		// First, try to click the bio link like a user would
		console.log(`[ANALYSIS] Attempting to click bio link for @${username}...`);
		const clickResult = await clickBioLink(page);

		if (clickResult.success && clickResult.finalUrl) {
			console.log(
				`[ANALYSIS] Bio link clicked, now at: ${clickResult.finalUrl}`,
			);

			try {
				// Analyze the page we landed on
				const linkAnalysis = await executeWithCircuitBreaker(
					() => analyzeExternalLink(page, clickResult.finalUrl ?? ""),
					`link_analysis_${username}`,
				);

				// ALWAYS take screenshot of link page - best evidence for creator verification
				// Do this BEFORE checking isCreator so vision can run even if text analysis missed it
				const linkScreenshot = await snapshot(
					page,
					`link_analysis_${username}`,
					true, // force: true - functional screenshot for vision analysis
				);
				if (linkScreenshot) {
					result.screenshots.push(linkScreenshot);
					logger.info("ANALYSIS", `📸 Screenshot saved: ${linkScreenshot}`);
				} else {
					logger.warn("ANALYSIS", `⚠️ Failed to take screenshot of link page`);
				}

				if (linkAnalysis.isCreator) {
					// Combine link confidence with bio score
					// If link confidence is LOW (30-50%) AND bio score is also LOW (<40),
					// it's probably a generic content creator (fitness, gaming, etc.)
					const bioScore = result.bioScore || 0;
					let adjustedConfidence = linkAnalysis.confidence;

					if (linkAnalysis.confidence < 50 && bioScore < 40) {
						// Both are weak signals - likely false positive
						adjustedConfidence = Math.min(linkAnalysis.confidence, 35);
						result.indicators.push(
							"⚠️ Weak combined signals (generic content creator, not influencer)",
						);
						console.log(
							`[ANALYSIS] ⚠️ Low link confidence (${linkAnalysis.confidence}%) + low bio score (${bioScore}) = likely NOT influencer`,
						);
					} else if (linkAnalysis.confidence >= 70 || bioScore >= 60) {
						// At least one strong signal - trust it
						result.isCreator = true;
						adjustedConfidence = linkAnalysis.confidence;
					} else {
						// Medium signals - require BOTH to be decent
						result.isCreator = linkAnalysis.confidence + bioScore >= 90;
						adjustedConfidence = linkAnalysis.confidence;
						if (!result.isCreator) {
							result.indicators.push(
								`⚠️ Medium signals - needs stronger bio or link indicators`,
							);
						}
					}

					result.confidence = Math.max(result.confidence, adjustedConfidence);
					result.indicators.push(...linkAnalysis.indicators);
					result.reason = linkAnalysis.reason;
				} else {
					// Text analysis didn't detect creator, but still add indicators and reason
					result.indicators.push(...linkAnalysis.indicators);
					result.reason = linkAnalysis.reason;
				}

				// Vision analysis (only if text confidence is below threshold and SKIP_VISION is false)
				// Run vision even if text analysis said isCreator=false - vision might catch what text missed
				if (
					!SKIP_VISION &&
					linkScreenshot &&
					linkAnalysis.confidence < VISION_SKIP_THRESHOLD
				) {
					console.log(
						`[VISION] Text confidence ${linkAnalysis.confidence}% < ${VISION_SKIP_THRESHOLD}%, running vision analysis...`,
					);
					try {
						const [isCreatorVision, visionData] =
							await isConfirmedCreator(linkScreenshot);
						if (isCreatorVision && visionData) {
							// Vision found creator - use vision confidence if higher than text
							const visionConfidence = visionData.confidence || 0;
							if (visionConfidence > linkAnalysis.confidence) {
								result.confidence = Math.max(
									result.confidence,
									visionConfidence,
								);
								result.isCreator = true;
								result.indicators.push(
									`Vision confirmed creator (${visionConfidence}% confidence)`,
								);
								if (visionData.indicators) {
									result.indicators.push(...visionData.indicators);
								}
								result.reason = `vision_${visionData.reason || "confirmed"}`;
								console.log(
									`[VISION] Vision confirmed creator with ${visionConfidence}% confidence`,
								);
							} else {
								result.indicators.push(
									`Vision analysis: ${visionConfidence}% (text analysis was ${linkAnalysis.confidence}%)`,
								);
							}
						} else {
							console.log(
								`[VISION] Vision did not confirm creator (confidence: ${visionData?.confidence || 0}%)`,
							);
							result.indicators.push(`Vision analysis did not confirm creator`);
						}
					} catch (visionError) {
						console.log(`[VISION] Vision analysis error: ${visionError}`);
						result.errors?.push(`Vision analysis failed: ${visionError}`);
					}
				} else {
					// Log why vision didn't run
					if (SKIP_VISION) {
						console.log(`[VISION] Skipping vision - SKIP_VISION is enabled`);
					} else if (!linkScreenshot) {
						console.log(
							`[VISION] Skipping vision - screenshot was not taken (linkScreenshot is null)`,
						);
					} else if (linkAnalysis.confidence >= VISION_SKIP_THRESHOLD) {
						console.log(
							`[VISION] Skipping vision - text confidence ${linkAnalysis.confidence}% >= ${VISION_SKIP_THRESHOLD}% threshold`,
						);
					}
				}
			} catch (error) {
				result.errors?.push(`Link analysis failed: ${error}`);
			}

			// Navigate back to the profile
			console.log(`[ANALYSIS] Navigating back to profile...`);
			await page.goto(profileUrl, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
			await shortDelay(1, 2);
		} else {
			console.log(`[ANALYSIS] Could not click bio link: ${clickResult.error}`);

			// Fallback: analyze each external link by navigating directly
			for (const linkUrl of externalLinks) {
				if (!linkUrl || result.confidence >= CONFIDENCE_THRESHOLD) break; // Stop if we already have high confidence

				try {
					const linkAnalysis = await executeWithCircuitBreaker(
						() => analyzeExternalLink(page, linkUrl),
						`link_analysis_${username}`,
					);

					if (linkAnalysis.isCreator) {
						// Apply same combined signal logic
						const bioScore = result.bioScore || 0;
						let adjustedConfidence = linkAnalysis.confidence;

						if (linkAnalysis.confidence < 50 && bioScore < 40) {
							adjustedConfidence = Math.min(linkAnalysis.confidence, 35);
							result.indicators.push(
								"⚠️ Weak combined signals (generic content creator)",
							);
							console.log(
								`[ANALYSIS] ⚠️ Low link confidence (${linkAnalysis.confidence}%) + low bio score (${bioScore}) = likely NOT influencer`,
							);
						} else if (linkAnalysis.confidence >= 70 || bioScore >= 60) {
							result.isCreator = true;
							adjustedConfidence = linkAnalysis.confidence;
						} else {
							result.isCreator = linkAnalysis.confidence + bioScore >= 90;
							adjustedConfidence = linkAnalysis.confidence;
							if (!result.isCreator) {
								result.indicators.push(
									`⚠️ Medium signals - needs stronger indicators`,
								);
							}
						}

						result.confidence = Math.max(result.confidence, adjustedConfidence);
						result.indicators.push(...linkAnalysis.indicators);
						result.reason = linkAnalysis.reason;

						// Take screenshot of the link page for records (functional - always enabled)
						const linkScreenshot = await snapshot(
							page,
							`link_analysis_${username}`,
							true, // force: true - functional screenshot for vision analysis
						);
						if (linkScreenshot) {
							result.screenshots.push(linkScreenshot);
						}

						// Vision analysis (only if text confidence is below threshold and SKIP_VISION is false)
						if (
							!SKIP_VISION &&
							linkScreenshot &&
							linkAnalysis.confidence < VISION_SKIP_THRESHOLD
						) {
							console.log(
								`[VISION] Text confidence ${linkAnalysis.confidence}% < ${VISION_SKIP_THRESHOLD}%, running vision analysis...`,
							);
							try {
								const [isCreatorVision, visionData] =
									await isConfirmedCreator(linkScreenshot);
								if (isCreatorVision && visionData) {
									// Vision found creator - use vision confidence if higher than text
									const visionConfidence = visionData.confidence || 0;
									if (visionConfidence > linkAnalysis.confidence) {
										result.confidence = Math.max(
											result.confidence,
											visionConfidence,
										);
										result.isCreator = true;
										result.indicators.push(
											`Vision confirmed creator (${visionConfidence}% confidence)`,
										);
										if (visionData.indicators) {
											result.indicators.push(...visionData.indicators);
										}
										result.reason = `vision_${visionData.reason || "confirmed"}`;
										console.log(
											`[VISION] Vision confirmed creator with ${visionConfidence}% confidence`,
										);
									} else {
										result.indicators.push(
											`Vision analysis: ${visionConfidence}% (text analysis was ${linkAnalysis.confidence}%)`,
										);
									}
								} else {
									console.log(
										`[VISION] Vision did not confirm creator (confidence: ${visionData?.confidence || 0}%)`,
									);
									result.indicators.push(
										`Vision analysis did not confirm creator`,
									);
								}
							} catch (visionError) {
								console.log(`[VISION] Vision analysis error: ${visionError}`);
								result.errors?.push(`Vision analysis failed: ${visionError}`);
							}
						} else if (linkAnalysis.confidence >= VISION_SKIP_THRESHOLD) {
							console.log(
								`[VISION] Skipping vision - text confidence ${linkAnalysis.confidence}% >= ${VISION_SKIP_THRESHOLD}% threshold`,
							);
						}
					}
				} catch (error) {
					result.errors?.push(`Link analysis failed: ${error}`);
				}
			}

			// Navigate back to the profile if we navigated away
			if (page.url() !== profileUrl) {
				await page.goto(profileUrl, {
					waitUntil: "networkidle2",
					timeout: 15000,
				});
				await shortDelay(1, 2);
			}
		}
	}

	// Vision analysis is ONLY used for external links (Linktree, link.me, etc.)
	// NOT for Instagram profiles - that's wasteful and unreliable
	// External link vision analysis happens in analyzeExternalLink() above

	// Direct Patreon shortcut (fallback for backward compatibility)
	if (hasDirectCreatorLink(result.links)) {
		result.isCreator = true;
		result.confidence = 100;
		result.reason = "direct_patreon_link";
	}

	// Final decision - require confidence threshold
	if (!result.isCreator && result.confidence >= CONFIDENCE_THRESHOLD) {
		result.isCreator = true;
		result.reason = result.reason || "combined_signals";
	}

	// Record activity for dashboard
	if (result.isCreator) {
		recordActivity(
			"creator_found",
			username,
			"success",
			`confidence: ${result.confidence}%, reason: ${result.reason}`,
		);
	} else {
		recordActivity(
			"profile_analyzed",
			username,
			"success",
			`confidence: ${result.confidence}%`,
		);
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
		// Wait for page to fully load before doing any checks
		console.log(`[VISION] Waiting for page to fully load...`);
		await mediumDelay(2, 4);

		// Take screenshot (functional - always enabled for vision analysis)
		const screenshotPath = await snapshot(
			page,
			`${screenshotPrefix}_${username}`,
			true, // force: true - functional screenshot for vision analysis
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
