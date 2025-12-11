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

export async function getProfileStats(page: Page): Promise<ProfileStats> {
	const stats: ProfileStats = {
		followers: null,
		following: null,
		posts: null,
		ratio: null,
	};

	try {
		// Instagram stores stats in various places - try multiple selectors
		const statsData = await page.evaluate(() => {
			// Method 1: Look for links with href containing /followers/ or /following/
			const links = Array.from(document.querySelectorAll("a"));
			const followersLink = links.find((l) =>
				l.getAttribute("href")?.includes("/followers/"),
			);
			const followingLink = links.find((l) =>
				l.getAttribute("href")?.includes("/following/"),
			);
			const postsLink = links.find((l) =>
				l.getAttribute("href")?.includes("/p/"),
			);

			// Extract text from these links or their parent elements
			const getCount = (link: Element | undefined): number | null => {
				if (!link) return null;
				const text = link.textContent?.trim() || "";
				// Handle formats like "110K", "1.2M", "5,234"
				const match = text.match(/([\d.]+)([KMB]?)/i);
				if (!match) return null;
				const num = parseFloat(match[1]);
				const suffix = match[2].toUpperCase();
				if (suffix === "K") return Math.round(num * 1000);
				if (suffix === "M") return Math.round(num * 1000000);
				if (suffix === "B") return Math.round(num * 1000000000);
				return Math.round(num);
			};

			// Method 2: Look in header section for spans/divs with numbers
			const header = document.querySelector("header");
			if (header) {
				const allText = header.textContent || "";
				// Try to find patterns like "110K followers", "194 following"
				const followersMatch = allText.match(
					/([\d.]+[KMB]?)\s*(followers?|follower)/i,
				);
				const followingMatch = allText.match(/([\d.]+[KMB]?)\s*(following)/i);
				const postsMatch = allText.match(/([\d.]+[KMB]?)\s*(posts?|post)/i);

				const parseCount = (match: RegExpMatchArray | null): number | null => {
					if (!match) return null;
					const num = parseFloat(match[1]);
					const suffix = match[1].match(/[KMB]/i)?.[0]?.toUpperCase();
					if (suffix === "K") return Math.round(num * 1000);
					if (suffix === "M") return Math.round(num * 1000000);
					if (suffix === "B") return Math.round(num * 1000000000);
					return Math.round(num);
				};

				return {
					followers:
						parseCount(followersMatch) || getCount(followersLink as Element),
					following:
						parseCount(followingMatch) || getCount(followingLink as Element),
					posts: parseCount(postsMatch) || getCount(postsLink as Element),
				};
			}

			return {
				followers: getCount(followersLink as Element),
				following: getCount(followingLink as Element),
				posts: getCount(postsLink as Element),
			};
		});

		stats.followers = statsData.followers;
		stats.following = statsData.following;
		stats.posts = statsData.posts;

		// Calculate ratio
		if (stats.followers && stats.following && stats.following > 0) {
			stats.ratio = stats.followers / stats.following;
		}
	} catch (error) {
		logger.error("ERROR", `Error extracting profile stats: ${error}`);
	}

	return stats;
}
