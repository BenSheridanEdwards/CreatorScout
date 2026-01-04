/**
 * Unified profile extraction using text array approach
 *
 * Extracts all text from header in DOM order, then identifies elements
 * by position. This is robust against Instagram's frequent CSS class changes.
 *
 * Flow:
 * 1. Extract all text from header using TreeWalker (simple DOM walk)
 * 2. Use identifyProfileElements() pure function for username, displayName, bio, stats
 * 3. Use specialized functions for things that need DOM access (links, highlights)
 */

import type { Page } from "puppeteer";
import {
	identifyProfileElements,
	type ProfileElements,
} from "../textArrayExtraction.ts";
import { getLinkFromBio } from "../getLinkFromBio/getLinkFromBio.ts";
import { getStoryHighlights } from "../getStoryHighlights/getStoryHighlights.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { humanClick } from "../../navigation/humanInteraction/humanInteraction.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

export interface ProfileExtraction {
	username: string | null;
	displayName: string | null;
	bio: string | null;
	bioLink: string | null;
	stats: {
		posts: number | null;
		followers: number | null;
		following: number | null;
		ratio: number | null;
	};
	highlights: Array<{ title: string; coverImageUrl: string | null }>;
}

/**
 * Extract all visible text from header in DOM order
 * Uses TreeWalker for a simple, robust DOM walk
 */
async function extractTextArrayFromPage(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const header = document.querySelector("header");
		if (!header) return [];

		const texts: string[] = [];

		// Use TreeWalker to get all text nodes in DOM order
		const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				// Skip script/style content
				const parent = node.parentElement;
				if (!parent) return NodeFilter.FILTER_REJECT;
				const tag = parent.tagName.toLowerCase();
				if (tag === "script" || tag === "style" || tag === "svg") {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		while (walker.nextNode()) {
			const text = walker.currentNode.textContent?.trim();
			if (text && text.length > 0) {
				texts.push(text);
			}
		}

		return texts;
	});
}

/**
 * Check if bio is truncated and has a "more" button, then click it to expand
 */
async function expandBioIfTruncated(page: Page): Promise<boolean> {
	try {
		// Look for "more" button in the bio area
		const moreButtonInfo = await page.evaluate(() => {
			const buttons = Array.from(
				document.querySelectorAll(
					'header section div[role="button"][tabindex="0"]',
				),
			);

			for (const btn of buttons) {
				const text = (btn.textContent || "").trim().toLowerCase();
				if (text === "more") {
					const parentSpan = btn.closest('span[dir="auto"]');
					if (parentSpan) {
						const parentText = (parentSpan.textContent || "").toLowerCase();
						const parentHTML = parentSpan.innerHTML || "";

						if (
							(parentHTML.includes("...") || parentText.includes("...")) &&
							!parentText.includes("followers") &&
							!parentText.includes("following") &&
							!parentText.includes("posts") &&
							!parentText.includes("highlight") &&
							parentText.length > 10
						) {
							return { found: true };
						}
					}
				}
			}
			return { found: false };
		});

		if (!moreButtonInfo.found) {
			return false;
		}

		// Find and click the "more" button
		const buttons = await page.$$(
			'header section div[role="button"][tabindex="0"]',
		);
		for (const btn of buttons) {
			const text = await btn.evaluate((el) =>
				(el.textContent || "").trim().toLowerCase(),
			);
			if (text === "more") {
				const isInBioArea = await btn.evaluate((el) => {
					const parentSpan = el.closest('span[dir="auto"]');
					if (!parentSpan) return false;

					const parentText = (parentSpan.textContent || "").toLowerCase();
					const parentHTML = parentSpan.innerHTML || "";

					return (
						(parentHTML.includes("...") || parentText.includes("...")) &&
						!parentText.includes("followers") &&
						!parentText.includes("following") &&
						!parentText.includes("posts") &&
						!parentText.includes("highlight") &&
						parentText.length > 10
					);
				});

				if (isInBioArea) {
					logger.debug(
						"PROFILE",
						"Found truncated bio with 'more' button, expanding...",
					);
					await humanClick(page, btn, { elementType: "button" });
					await sleep(800 + Math.random() * 400);
					return true;
				}
			}
		}

		return false;
	} catch (error) {
		logger.warn("PROFILE", `Failed to expand truncated bio: ${error}`);
		return false;
	}
}

/**
 * Comprehensive profile extraction using text array approach
 *
 * This is the main entry point for profile extraction.
 * Uses a simple, robust approach that works regardless of CSS class changes.
 */
export async function extractProfile(page: Page): Promise<ProfileExtraction> {
	const extraction: ProfileExtraction = {
		username: null,
		displayName: null,
		bio: null,
		bioLink: null,
		stats: {
			posts: null,
			followers: null,
			following: null,
			ratio: null,
		},
		highlights: [],
	};

	try {
		// First, expand truncated bio if present
		await expandBioIfTruncated(page);

		// Extract all text from header in DOM order
		const texts = await extractTextArrayFromPage(page);

		if (texts.length === 0) {
			logger.warn("PROFILE", "No text found in header");
			return extraction;
		}

		logger.debug("PROFILE", `Extracted ${texts.length} text elements`);

		// Use the pure function to identify profile elements
		const profile: ProfileElements = identifyProfileElements(texts);

		// Map to extraction result
		extraction.username = profile.username;
		extraction.displayName = profile.displayName;
		extraction.bio = profile.bio;
		extraction.stats = {
			posts: profile.posts,
			followers: profile.followers,
			following: profile.following,
			ratio:
				profile.followers && profile.following
					? profile.followers / profile.following
					: null,
		};

		// Extract bio link (needs DOM access for href attributes)
		try {
			extraction.bioLink = await getLinkFromBio(page);
		} catch (e) {
			logger.debug("PROFILE", `Bio link extraction failed: ${e}`);
		}

		// Extract highlights (needs DOM access for images and structure)
		try {
			const highlights = await getStoryHighlights(page);
			extraction.highlights = highlights.map((h) => ({
				title: h.title,
				coverImageUrl: h.coverImageUrl,
			}));
		} catch (e) {
			logger.debug("PROFILE", `Highlights extraction failed: ${e}`);
		}
	} catch (error) {
		logger.error("PROFILE", `Profile extraction failed: ${error}`);
	}

	return extraction;
}

// Re-export for backward compatibility
export { identifyProfileElements, type ProfileElements };
