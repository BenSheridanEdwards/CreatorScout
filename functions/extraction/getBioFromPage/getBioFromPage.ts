/**
 * Bio extraction from Instagram profile page
 *
 * Uses the text array approach for robust extraction that works
 * regardless of Instagram's CSS class changes.
 */

import type { Page } from "puppeteer";
import { validateBioWithVision } from "../../profile/vision/vision.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";
import { humanClick } from "../../navigation/humanInteraction/humanInteraction.ts";
import { sleep } from "../../timing/sleep/sleep.ts";
import { identifyProfileElements } from "../textArrayExtraction.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Validate an extracted bio with vision to ensure we didn't miss content.
 * Call this when the bio looks suspiciously short or empty.
 */
export async function validateBioExtraction(
	page: Page,
	extractedBio: string | null,
	username: string,
): Promise<{ valid: boolean; correctedBio: string | null }> {
	try {
		const screenshotPath = await snapshot(page, `bio_validation_${username}`);
		if (!screenshotPath) {
			return { valid: true, correctedBio: null };
		}
		const visionResult = await validateBioWithVision(screenshotPath);

		if (visionResult) {
			if (visionResult.bio_visible && visionResult.bio_text) {
				const visionBioLength = visionResult.bio_text.length;
				const extractedLength = extractedBio?.length || 0;

				if (visionBioLength > extractedLength + 20) {
					logger.error(
						"ERROR",
						`🚨 BIO EXTRACTION INCOMPLETE: Vision found more content!`,
					);
					logger.error("ERROR", `Username: @${username}`);
					logger.error("ERROR", `Extracted: "${extractedBio}"`);
					logger.error("ERROR", `Vision found: "${visionResult.bio_text}"`);
					logger.error("ERROR", `Screenshot: ${screenshotPath}`);

					return { valid: false, correctedBio: visionResult.bio_text };
				}
			}
			return { valid: true, correctedBio: null };
		}
	} catch (e) {
		logger.warn("ANALYSIS", `Bio validation failed: ${e}`);
	}

	return { valid: true, correctedBio: null };
}

/**
 * Check if bio is truncated and has a "more" button, then click it to expand
 */
async function expandBioIfTruncated(page: Page): Promise<boolean> {
	try {
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
 * Extract all visible text from header in DOM order
 */
async function extractTextArrayFromPage(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const header = document.querySelector("header");
		if (!header) return [];

		const texts: string[] = [];
		const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
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
 * Extract bio from Instagram profile page
 *
 * Uses text array approach - extracts all text from header in order,
 * then identifies bio by position (after stats, before buttons).
 */
export async function getBioFromPage(page: Page): Promise<string | null> {
	// First, check if bio is truncated and expand it
	await expandBioIfTruncated(page);

	// Extract all text from header
	const texts = await extractTextArrayFromPage(page);

	if (texts.length === 0) {
		return null;
	}

	// Use the pure function to identify profile elements
	const profile = identifyProfileElements(texts);

	return profile.bio;
}
