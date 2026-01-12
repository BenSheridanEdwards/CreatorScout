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

const logger = createLogger();

import { recordActivity } from "../../shared/dashboard/dashboard.ts";
import {
	queueAdd,
	updateProfileFromAnalysis,
} from "../../shared/database/database.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { mediumDelay, shortDelay } from "../../timing/humanize/humanize.ts";
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
			`📎 Bio references other profiles: ${scoreData.referencedProfiles.map((p) => `@${p}`).join(", ")}`,
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

	// Track which steps completed for better error context
	const completedSteps: string[] = [];
	let currentStep = "init";

	// Helper to check if error is a bundler __name error
	const isBundlerError = (error: unknown): boolean => {
		const msg = error instanceof Error ? error.message : String(error);
		return msg.includes("__name") || msg.includes("is not defined");
	};

	// Wrap error with context about which step failed
	const wrapError = (error: unknown, step: string): Error => {
		const msg = error instanceof Error ? error.message : String(error);
		const completed =
			completedSteps.length > 0 ? completedSteps.join(" → ") : "none";
		return new Error(`[${step}] ${msg} (completed: ${completed})`);
	};

	// Extract bio - wrap in try-catch for bundler errors
	currentStep = "bio_extract";
	try {
		result.bio = await getBioFromPage(page);
		completedSteps.push("bio");
		if (result.bio) {
			const bioPreview =
				result.bio.length > 80
					? `${result.bio.substring(0, 80)}...`
					: result.bio;
			logger.info("EXTRACTION", `Bio: "${bioPreview.replace(/\n/g, " ")}"`);
		}
	} catch (bioError) {
		if (isBundlerError(bioError)) {
			result.errors?.push(`bio_extract: bundler`);
		} else {
			throw wrapError(bioError, currentStep);
		}
	}

	// Validate bio extraction if it looks short or empty
	if (!result.bio || result.bio.length < 30) {
		currentStep = "bio_validate";
		try {
			const validation = await validateBioExtraction(
				page,
				result.bio,
				username,
			);
			if (!validation.valid && validation.correctedBio) {
				result.bio = validation.correctedBio;
			}
			completedSteps.push("bio_validate");
		} catch (valError) {
			if (!isBundlerError(valError)) {
				throw wrapError(valError, currentStep);
			}
			result.errors?.push(`bio_validate: bundler`);
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

		// Log bio analysis result with confidence
		logger.info(
			"EXTRACTION",
			`Bio score: ${bioScore.score}% | Likely creator: ${isLikely ? "YES" : "NO"} | Conf: ${result.confidence}%`,
		);

		// Queue referenced Instagram profiles for follow-up analysis
		if (bioScore.referencedProfiles && bioScore.referencedProfiles.length > 0) {
			for (const refProfile of bioScore.referencedProfiles) {
				try {
					await queueAdd(refProfile, 15, "referenced_profile");
				} catch {
					// Failed to queue - continue
				}
			}
		}
	}

	// Extract links - wrap in try-catch for bundler errors
	currentStep = "link_extract";
	let primary: string | null = null;
	try {
		primary = await getLinkFromBio(page);
		completedSteps.push("links");
	} catch (linkError) {
		if (isBundlerError(linkError)) {
			result.errors?.push(`link_extract: bundler`);
		} else {
			throw wrapError(linkError, currentStep);
		}
	}

	currentStep = "header_links";
	let headerHrefs: string[] = [];
	try {
		headerHrefs = await page.$$eval(
			"header a",
			(els) =>
				els.map((e) => e.getAttribute("href")).filter(Boolean) as string[],
		);
	} catch (evalError) {
		if (isBundlerError(evalError)) {
			result.errors?.push(`header_links: bundler`);
		} else {
			throw wrapError(evalError, currentStep);
		}
	}
	const html = await page.content();
	result.links = buildUniqueLinks(html, headerHrefs, primary);

	if (result.links.length > 0) {
		logger.info("EXTRACTION", `Links: ${result.links.length} found`);
	}

	// Profile stats (follower ratio) - wrap in try-catch for bundler errors
	currentStep = "stats";
	let stats: { followers?: number; following?: number; ratio?: number } = {};
	try {
		const rawStats = await getProfileStats(page);
		stats = {
			followers: rawStats.followers ?? undefined,
			following: rawStats.following ?? undefined,
			ratio: rawStats.ratio ?? undefined,
		};
		completedSteps.push("stats");

		// Log stats
		const followersStr =
			stats.followers !== undefined
				? `${stats.followers.toLocaleString()} followers`
				: "? followers";
		const followingStr =
			stats.following !== undefined
				? `${stats.following.toLocaleString()} following`
				: "? following";
		logger.info("EXTRACTION", `Stats: ${followersStr}, ${followingStr}`);
	} catch (statsError) {
		if (isBundlerError(statsError)) {
			result.errors?.push(`stats: bundler`);
		} else {
			throw wrapError(statsError, currentStep);
		}
	}

	result.stats = stats;

	if (stats.ratio && stats.ratio > 100) {
		result.confidence = Math.max(result.confidence, 30);
		result.indicators.push(`High follower ratio (${stats.ratio.toFixed(1)}x)`);
	}

	// Story highlights analysis - wrap in try-catch for bundler errors
	currentStep = "highlights";
	let rawHighlights: Awaited<ReturnType<typeof getStoryHighlights>> = [];
	try {
		rawHighlights = await getStoryHighlights(page);
		completedSteps.push("highlights");
	} catch (highlightsError) {
		if (isBundlerError(highlightsError)) {
			result.errors?.push(`highlights: bundler`);
		} else {
			throw wrapError(highlightsError, currentStep);
		}
	}

	const highlights = rawHighlights;
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

			// Boost confidence if bio also mentions highlights
			const bioMentionsHighlights =
				result.bio &&
				(result.bio.toLowerCase().includes("in my highlight") ||
					result.bio.toLowerCase().includes("check my highlight") ||
					result.bio.toLowerCase().includes("what you're looking for is in"));

			if (bioMentionsHighlights && linkHighlights.length > 0) {
				result.confidence = Math.max(result.confidence, 50);
				result.indicators.push(
					"Bio directs to highlights with link names",
				);
			} else {
				result.confidence = Math.max(result.confidence, 30);
			}
		}

		// Log highlights analysis
		const linkCount = highlights.filter((h) =>
			isLinkInBioHighlight(h.title),
		).length;
		if (linkCount > 0) {
			logger.info(
				"EXTRACTION",
				`Highlights: ${highlights.length} total, ${linkCount} link | Conf: ${result.confidence}%`,
			);
		}
	}

	// Analyze external links properly
	const externalLinks = result.links
		.map((link) => decodeInstagramRedirect(link)) // Decode Instagram redirects
		.filter((link) => link?.includes("http") && !link.includes("instagram.com"))
		.filter((link, index, arr) => arr.indexOf(link) === index); // Remove duplicates

	if (externalLinks.length > 0) {
		result.indicators.push("External links in profile");

		// Save current URL to return to profile
		const profileUrl = page.url();

		// Screenshot BEFORE clicking link - proof of profile state (shows link exists)
		const preClickScreenshot = await snapshot(
			page,
			`profile_before_link_${username}`,
			true,
		);
		if (preClickScreenshot) {
			result.screenshots.push(preClickScreenshot);
		}

		// First, try to click the bio link like a user would
		const clickResult = await clickBioLink(page);

		if (clickResult.success && clickResult.finalUrl) {
			// Log the external link navigation
			const linkDomain = new URL(clickResult.finalUrl).hostname.replace(
				"www.",
				"",
			);
			logger.info(
				"LINK_ANALYSIS",
				`🔗 Opened: ${linkDomain} | Conf so far: ${result.confidence}%`,
			);

			try {
				// Analyze the page we landed on
				const linkAnalysis = await executeWithCircuitBreaker(
					() => analyzeExternalLink(page, clickResult.finalUrl ?? ""),
					`link_analysis_${username}`,
				);

				// Log text analysis result
				logger.info(
					"LINK_ANALYSIS",
					`📝 Text analysis: ${linkAnalysis.confidence}% | Creator: ${linkAnalysis.isCreator ? "YES" : "NO"} | ${linkAnalysis.reason || "no reason"}`,
				);

				// Take screenshot of link page (use workingPage which may be a new tab)
				const linkScreenshot = await snapshot(
					linkAnalysis.workingPage,
					`link_analysis_${username}`,
					true,
				);
				if (linkScreenshot) {
					result.screenshots.push(linkScreenshot);
				}

				if (linkAnalysis.isCreator) {
					// Combine link confidence with bio score
					const bioScore = result.bioScore || 0;
					let adjustedConfidence = linkAnalysis.confidence;

					if (linkAnalysis.confidence < 50 && bioScore < 40) {
						// Both are weak signals - likely false positive
						adjustedConfidence = Math.min(linkAnalysis.confidence, 35);
						result.indicators.push(
							"⚠️ Weak combined signals (generic content creator, not influencer)",
						);
						logger.info(
							"LINK_ANALYSIS",
							`⚠️ Weak signals: link ${linkAnalysis.confidence}% + bio ${bioScore}% → adjusted to ${adjustedConfidence}%`,
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
				if (
					!SKIP_VISION &&
					linkScreenshot &&
					linkAnalysis.confidence < VISION_SKIP_THRESHOLD
				) {
					logger.info(
						"VISION",
						`🤖 Running AI vision (text conf ${linkAnalysis.confidence}% < ${VISION_SKIP_THRESHOLD}% threshold)...`,
					);
					try {
						const [isCreatorVision, visionData] =
							await isConfirmedCreator(linkScreenshot);
						const visionConfidence = visionData?.confidence || 0;

						if (isCreatorVision && visionData) {
							// Vision found creator - use vision confidence if higher than text
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
								logger.info(
									"VISION",
									`✅ Vision: ${visionConfidence}% | Creator: YES | ${visionData.reason || "confirmed"}`,
								);
							} else {
								result.indicators.push(
									`Vision analysis: ${visionConfidence}% (text analysis was ${linkAnalysis.confidence}%)`,
								);
								logger.info(
									"VISION",
									`🤷 Vision: ${visionConfidence}% (not higher than text ${linkAnalysis.confidence}%)`,
								);
							}
						} else {
							result.indicators.push(`Vision analysis did not confirm creator`);
							logger.info(
								"VISION",
								`❌ Vision: ${visionConfidence}% | Creator: NO`,
							);
						}
					} catch (visionError) {
						logger.warn("VISION", `Vision failed: ${visionError}`);
						result.errors?.push(`Vision analysis failed: ${visionError}`);
					}
				} else if (
					!SKIP_VISION &&
					linkAnalysis.confidence >= VISION_SKIP_THRESHOLD
				) {
					logger.info(
						"VISION",
						`⏭️ Skipped (text conf ${linkAnalysis.confidence}% >= ${VISION_SKIP_THRESHOLD}% threshold)`,
					);
				}
			} catch (error) {
				result.errors?.push(`Link analysis failed: ${error}`);
			}

			// Close any extra tabs that were opened during link analysis
			const allPages = await page.browser().pages();
			for (const p of allPages) {
				if (p !== page && !p.url().includes("instagram.com")) {
					try {
						await p.close();
					} catch {
						// Ignore close errors
					}
				}
			}

			// Bring original page back to front and navigate back to profile
			await page.bringToFront();
			await page.goto(profileUrl, {
				waitUntil: "networkidle2",
				timeout: 15000,
			});
			await shortDelay(1, 2);
		} else {
			// Fallback: analyze each external link by navigating directly
			logger.info(
				"LINK_ANALYSIS",
				`Bio link click failed, trying direct navigation...`,
			);

			for (const linkUrl of externalLinks) {
				if (!linkUrl || result.confidence >= CONFIDENCE_THRESHOLD) break;

				try {
					const linkDomain = new URL(linkUrl).hostname.replace("www.", "");
					logger.info("LINK_ANALYSIS", `🔗 Navigating to: ${linkDomain}`);

					const linkAnalysis = await executeWithCircuitBreaker(
						() => analyzeExternalLink(page, linkUrl),
						`link_analysis_${username}`,
					);

					logger.info(
						"LINK_ANALYSIS",
						`📝 Text analysis: ${linkAnalysis.confidence}% | Creator: ${linkAnalysis.isCreator ? "YES" : "NO"}`,
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
							logger.info(
								"LINK_ANALYSIS",
								`⚠️ Weak signals: link ${linkAnalysis.confidence}% + bio ${bioScore}% → ${adjustedConfidence}%`,
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

						// Take screenshot of the link page (use workingPage for consistency)
						const linkScreenshot = await snapshot(
							linkAnalysis.workingPage,
							`link_analysis_${username}`,
							true,
						);
						if (linkScreenshot) {
							result.screenshots.push(linkScreenshot);
						}

						// Vision analysis (only if text confidence is below threshold)
						if (
							!SKIP_VISION &&
							linkScreenshot &&
							linkAnalysis.confidence < VISION_SKIP_THRESHOLD
						) {
							logger.info(
								"VISION",
								`🤖 Running AI vision (text conf ${linkAnalysis.confidence}% < threshold)...`,
							);
							try {
								const [isCreatorVision, visionData] =
									await isConfirmedCreator(linkScreenshot);
								const visionConfidence = visionData?.confidence || 0;

								if (isCreatorVision && visionData) {
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
										logger.info(
											"VISION",
											`✅ Vision: ${visionConfidence}% | Creator: YES`,
										);
									} else {
										result.indicators.push(
											`Vision analysis: ${visionConfidence}% (text analysis was ${linkAnalysis.confidence}%)`,
										);
										logger.info(
											"VISION",
											`🤷 Vision: ${visionConfidence}% (not higher than text)`,
										);
									}
								} else {
									result.indicators.push(
										`Vision analysis did not confirm creator`,
									);
									logger.info(
										"VISION",
										`❌ Vision: ${visionConfidence}% | Creator: NO`,
									);
								}
							} catch (visionError) {
								logger.warn("VISION", `Vision failed: ${visionError}`);
								result.errors?.push(`Vision analysis failed: ${visionError}`);
							}
						} else if (linkAnalysis.confidence >= VISION_SKIP_THRESHOLD) {
							logger.info(
								"VISION",
								`⏭️ Skipped (text conf ${linkAnalysis.confidence}% >= threshold)`,
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

	// Save analysis results to database
	try {
		await updateProfileFromAnalysis(username, {
			bio: result.bio,
			bioScore: result.bioScore,
			confidence: result.confidence,
			links: result.links,
			stats: result.stats,
		});
	} catch (dbError) {
		logger.error("DATABASE", `Failed to save profile @${username}: ${dbError}`);
		// Don't throw - analysis succeeded, just DB save failed
	}

	// Log any bundler errors that occurred (non-fatal)
	if (result.errors && result.errors.length > 0) {
		const bundlerErrors = result.errors.filter((e) => e.includes("bundler"));
		if (bundlerErrors.length > 0) {
			logger.warn(
				"ANALYSIS",
				`@${username}: ${bundlerErrors.length} bundler issue(s) in: ${bundlerErrors.join(", ")} (OK: ${completedSteps.join(", ")})`,
			);
		}
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
