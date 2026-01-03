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
		const statsData = await page.evaluate(() => {
			// Method 1: Look for links with href containing /followers/ or /following/
			const links = Array.from(document.querySelectorAll("a"));
			const followersLink = links.find((l) =>
				l.getAttribute("href")?.includes("/followers"),
			);
			const followingLink = links.find((l) =>
				l.getAttribute("href")?.includes("/following"),
			);

			// Extract text from links
			const followersText = followersLink?.textContent?.trim() || "";
			const followingText = followingLink?.textContent?.trim() || "";

			// Method 2: Parse from header text for edge cases (like 0 following)
			const header = document.querySelector("header");
			const headerText = header?.textContent || "";

			// Look for patterns like "314K followers", "346 K followers", "0 following", "31 posts"
			// Allow optional space between number and K/M/B suffix
			const followersMatch = headerText.match(
				/([\d,.]+)\s*([KMB])?\s*followers?/i,
			);
			const followingMatch = headerText.match(
				/([\d,.]+)\s*([KMB])?\s*following/i,
			);
			const postsMatch = headerText.match(/([\d,.]+)\s*([KMB])?\s*posts?/i);

			// Reconstruct the count string with suffix if present
			const extractCount = (match: RegExpMatchArray | null): string | null => {
				if (!match) return null;
				const num = match[1];
				const suffix = match[2] || "";
				return num + suffix;
			};

			return {
				followersText: followersText || extractCount(followersMatch) || null,
				followingText: followingText || extractCount(followingMatch) || null,
				postsText: extractCount(postsMatch) || null,
				// Check for 0 following specifically (no link created for 0)
				hasZeroFollowing: !followingLink && headerText.includes("0 following"),
			};
		});

		// Log raw extracted text for debugging
		logger.debug(
			"PROFILE",
			`Raw stats text - followers: "${statsData.followersText}", following: "${statsData.followingText}", posts: "${statsData.postsText}"`,
		);

		// Parse the counts
		if (statsData.hasZeroFollowing) {
			stats.following = 0;
		} else if (statsData.followingText) {
			stats.following = parseCount(statsData.followingText);
		}

		if (statsData.followersText) {
			stats.followers = parseCount(statsData.followersText);
		}

		if (statsData.postsText) {
			stats.posts = parseCount(statsData.postsText);
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
		logger.error("ERROR", `Error extracting profile stats: ${error}`);
	}

	return stats;
}
