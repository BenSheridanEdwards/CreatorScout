/**
 * Extract story highlights from Instagram profile page.
 * Returns highlight titles and cover image URLs for analysis.
 */
import type { ElementHandle, Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

export interface StoryHighlight {
	title: string;
	coverImageUrl: string | null;
	element: ElementHandle<Element>;
}

export async function getStoryHighlights(
	page: Page,
): Promise<StoryHighlight[]> {
	const highlights: StoryHighlight[] = [];

	try {
		// Wait for highlights to load (they're usually in a horizontal scroll container)
		await page.waitForSelector('div[role="tablist"]', { timeout: 5000 });
	} catch {
		// No highlights section found
		return highlights;
	}

	try {
		// Find all highlight elements
		// Instagram highlights are typically in: header > section > div > div[role="button"]
		const highlightElements = await page.$$(
			'header section div[role="button"][tabindex="0"]',
		);

		// Alternative selectors if the above doesn't work
		if (highlightElements.length === 0) {
			const altElements = await page.$$(
				'header a[href*="/stories/highlights/"]',
			);
			for (const el of altElements) {
				try {
					const title = await el.evaluate((node) => {
						const titleEl = node.querySelector("span");
						return titleEl?.textContent?.trim() || "";
					});
					const coverImageUrl = await el.evaluate((node) => {
						const img = node.querySelector("img");
						return img?.src || img?.getAttribute("src") || null;
					});
					if (title || coverImageUrl) {
						highlights.push({ title, coverImageUrl, element: el });
					}
				} catch {}
			}
			return highlights;
		}

		// Extract title and cover image from each highlight
		for (const el of highlightElements) {
			try {
				const data = await el.evaluate((node) => {
					// Try to find title (usually in a span)
					const titleEl =
						node.querySelector("span") ||
						node.querySelector('div[dir="auto"]') ||
						node.querySelector("div");
					const title = titleEl?.textContent?.trim() || "";

					// Try to find cover image
					const img = node.querySelector("img");
					const coverImageUrl = img?.src || img?.getAttribute("src") || null;

					return { title, coverImageUrl };
				});

				if (data.title || data.coverImageUrl) {
					highlights.push({
						title: data.title,
						coverImageUrl: data.coverImageUrl,
						element: el,
					});
				}
			} catch {}
		}
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		logger.error("ERROR", `Error extracting highlights: ${error}`);
	}

	return highlights;
}

/**
 * Check if a highlight title suggests premium content.
 */
export function isLinkInBioHighlight(title: string): boolean {
	const titleLower = title.toLowerCase();
	const linkPatterns = [
		// DEFINITIVE platform mentions
		/patreon/i,
		/ko-fi/i,
		/fanvue/i,
		/loyalfans/i,
		// "OF" abbreviation (common for Patreon)
		/^of\s+/i, // link pattern
		/\sof\s+/i, // "OF" as standalone word
		// Link indicators (must have emoji or very specific)
		/my\s*🔗/i,
		/🔗\s*link/i,
		/link\s*🔗/i,
		// "its here 🔗" pattern - link emoji suggests premium content link
		/its?\s+here\s*🔗/i,
		/here\s*🔗/i,
		// Chat/DM patterns suggesting direct messaging for premium content
		/chat\s+w\s+me/i,
		/chat\s+with\s+me/i,
		/dm\s+me/i,
		/message\s+me/i,
		/telegram/i, // Telegram is commonly used for premium content
		// Content indicators (must be specific)
		/exclusive\s+content/i,
		/premium\s+content/i,
		/custom\s+content/i,
		// Service indicators (requires context)
		/menu/i, // Price menu
		/rates/i, // Service rates
		/pricing/i,
		// Adult emojis (strong signal)
		/💋/,
		/🍑/,
		/💦/,
		/😈/,
		/👅/,
		/🍒/,
		/🥵/,
	];

	return linkPatterns.some((pattern) => pattern.test(titleLower));
}

/**
 * Extract all highlight titles as a string for keyword matching.
 */
export function getHighlightTitlesText(highlights: StoryHighlight[]): string {
	return highlights
		.map((h) => h.title)
		.join(" ")
		.toLowerCase();
}
