/**
 * Extract follower and following counts from Instagram profile.
 */
import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

export interface ProfileStats {
	followers: number | null;
	following: number | null;
	posts: number | null;
	ratio: number | null; // followers / following ratio
}

/**
 * Parse a count string like "314K", "1.2M", "5,234", "0" into a number
 */
export function parseCount(text: string): number | null {
	if (!text) return null;

	// Clean the text
	const cleaned = text.replace(/,/g, "").trim();

	// Handle formats like "110K", "1.2M", "5234"
	const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
	if (!match) return null;

	const num = parseFloat(match[1]);
	const suffix = match[2]?.toUpperCase();

	if (suffix === "K") return Math.round(num * 1000);
	if (suffix === "M") return Math.round(num * 1000000);
	if (suffix === "B") return Math.round(num * 1000000000);

	return Math.round(num);
}

export async function getProfileStats(page: Page): Promise<ProfileStats> {
	const stats: ProfileStats = {
		followers: null,
		following: null,
		posts: null,
		ratio: null,
	};

	try {
		// Extract raw text data from page - keep evaluate simple to avoid __name issues
		const rawData = await page.evaluate(() => {
			const links = Array.from(document.querySelectorAll("a"));
			
			let followersText = "";
			let followingText = "";
			
			for (const link of links) {
				const href = link.getAttribute("href") || "";
				const text = link.textContent?.trim() || "";
				if (href.includes("/followers") && !href.includes("/following")) {
					followersText = text;
				} else if (href.includes("/following")) {
					followingText = text;
				}
			}

			// Get header text for fallback parsing
			const header = document.querySelector("header");
			const headerText = header?.textContent || "";

			return { followersText, followingText, headerText };
		});

		// Parse counts outside of evaluate to avoid __name issues
		if (rawData.followersText) {
			stats.followers = parseCount(rawData.followersText);
		}
		
		if (rawData.followingText) {
			stats.following = parseCount(rawData.followingText);
		}

		// Always parse posts from header text (even if followers/following were found from links)
		const headerText = rawData.headerText;
		const postsMatch = headerText.match(/([\d,.]+)\s*([KMB])?\s*posts?/i);
		if (postsMatch) {
			const countStr = postsMatch[1] + (postsMatch[2] || "");
			stats.posts = parseCount(countStr);
		}

		// Fallback: parse followers/following from header text if not found from links
		if (!stats.followers || !stats.following) {
			const followersMatch = headerText.match(/([\d,.]+)\s*([KMB])?\s*followers?/i);
			const followingMatch = headerText.match(/([\d,.]+)\s*([KMB])?\s*following/i);

			if (!stats.followers && followersMatch) {
				const countStr = followersMatch[1] + (followersMatch[2] || "");
				stats.followers = parseCount(countStr);
			}
			
			if (!stats.following && followingMatch) {
				const countStr = followingMatch[1] + (followingMatch[2] || "");
				stats.following = parseCount(countStr);
			}

			// Check for 0 following specifically
			if (!stats.following && headerText.includes("0 following")) {
				stats.following = 0;
			}
		}

		// Calculate ratio
		if (stats.followers && stats.following && stats.following > 0) {
			stats.ratio = stats.followers / stats.following;
		}

		logger.debug(
			"PROFILE",
			`Stats: ${stats.followers} followers, ${stats.following} following, ${stats.posts} posts`,
		);
	} catch (error) {
		logger.warn("PROFILE", `Could not extract profile stats: ${error}`);
	}

	return stats;
}
