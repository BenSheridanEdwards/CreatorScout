/**
 * Text Array Extraction
 *
 * Simple approach: Extract all text from header in DOM order,
 * then identify profile elements by position and pattern.
 *
 * This avoids complex DOM simulation and works regardless of CSS class changes.
 */

export interface ProfileElements {
	username: string | null;
	displayName: string | null;
	posts: number | null;
	followers: number | null;
	following: number | null;
	bio: string | null;
	bioLink: string | null;
	highlights: string[];
}

/**
 * Extract all visible text from HTML in DOM order
 * Returns an array of text strings in the order they appear
 */
export function extractTextArrayFromHTML(html: string): string[] {
	const texts: string[] = [];

	// Remove script and style tags
	const cleaned = html
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
		.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "") // Remove SVG icons
		.replace(/<!--[\s\S]*?-->/g, ""); // Remove comments

	// Extract text from tags in order
	// Match text between tags, handling nested structures
	const textPattern = />([^<]+)</g;
	const matches = cleaned.matchAll(textPattern);

	for (const match of matches) {
		const text = match[1]
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.trim();

		if (text && text.length > 0) {
			texts.push(text);
		}
	}

	return texts;
}

/**
 * Parse a number string like "239K", "1.2M", "878", "1,376"
 */
export function parseStatNumber(text: string): number | null {
	if (!text) return null;

	// Remove commas
	const cleaned = text.replace(/,/g, "");

	// Handle K/M/B suffixes
	const match = cleaned.match(/^([\d.]+)([KMB])?$/i);
	if (!match) return null;

	let num = parseFloat(match[1]);
	const suffix = match[2]?.toUpperCase();

	if (suffix === "K") num *= 1000;
	else if (suffix === "M") num *= 1000000;
	else if (suffix === "B") num *= 1000000000;

	return Math.round(num);
}

/**
 * Identify profile elements from an ordered text array
 * Uses position and pattern matching - no DOM traversal needed
 */
export function identifyProfileElements(texts: string[]): ProfileElements {
	const result: ProfileElements = {
		username: null,
		displayName: null,
		posts: null,
		followers: null,
		following: null,
		bio: null,
		bioLink: null,
		highlights: [],
	};

	if (texts.length === 0) return result;

	// Find key anchor indices - support both separate and combined patterns
	// e.g., "followers" OR "100 followers"
	let postsIdx = texts.findIndex((t) => t.toLowerCase() === "posts");
	let followersIdx = texts.findIndex((t) => t.toLowerCase() === "followers");
	let followingIdx = texts.findIndex((t) => t.toLowerCase() === "following");

	// Also check for combined patterns like "100 followers", "239K followers", "1,376 posts"
	const postsPattern = /^[\d,]+[KMB]?\s*posts?$/i;
	const followersPattern = /^[\d,]+[KMB]?\s*followers?$/i;
	const followingPattern = /^[\d,]+[KMB]?\s*following$/i;

	for (let i = 0; i < texts.length; i++) {
		const t = texts[i];
		if (postsIdx === -1 && postsPattern.test(t)) {
			postsIdx = i;
			const numMatch = t.match(/^([\d,KMB.]+)/i);
			if (numMatch) result.posts = parseStatNumber(numMatch[1]);
		}
		if (followersIdx === -1 && followersPattern.test(t)) {
			followersIdx = i;
			const numMatch = t.match(/^([\d,KMB.]+)/i);
			if (numMatch) result.followers = parseStatNumber(numMatch[1]);
		}
		if (followingIdx === -1 && followingPattern.test(t)) {
			followingIdx = i;
			const numMatch = t.match(/^([\d,KMB.]+)/i);
			if (numMatch) result.following = parseStatNumber(numMatch[1]);
		}
	}

	// Find button indices (these mark the end of bio)
	const buttonPatterns = [
		"Follow",
		"Following",
		"Message",
		"Requested",
		"Download All",
	];
	const buttonIdx = texts.findIndex((t) => buttonPatterns.some((p) => t === p));

	// Username = first text item (almost always the username from h2)
	// Skip obvious non-username items
	const skipPatterns = ["Options", "Verified", "•"];
	for (let i = 0; i < texts.length; i++) {
		const t = texts[i];
		if (
			!skipPatterns.includes(t) &&
			!t.match(/^\d+$/) &&
			!postsPattern.test(t) &&
			!followersPattern.test(t) &&
			!followingPattern.test(t)
		) {
			result.username = t;
			break;
		}
	}

	// Stats = numbers immediately before posts/followers/following (for separate patterns)
	// Skip if already parsed from combined patterns
	if (postsIdx > 0 && result.posts === null) {
		result.posts = parseStatNumber(texts[postsIdx - 1]);
	}
	if (followersIdx > 0 && result.followers === null) {
		result.followers = parseStatNumber(texts[followersIdx - 1]);
	}
	if (followingIdx > 0 && result.following === null) {
		result.following = parseStatNumber(texts[followingIdx - 1]);
	}

	// Find the end of stats section
	const statsEnd = Math.max(postsIdx, followersIdx, followingIdx) + 1;
	const usernameIdx = texts.indexOf(result.username || "");

	// Find where stats actually start (the first stats-related item)
	const statsStart = [postsIdx, followersIdx, followingIdx]
		.filter((i) => i >= 0)
		.sort((a, b) => a - b)[0];

	// Display name: text between username and first stats
	// Usually a capitalized name like "Gracie Dzeja" or "Minki Minna"
	if (
		usernameIdx >= 0 &&
		statsStart !== undefined &&
		statsStart > usernameIdx
	) {
		for (let i = usernameIdx + 1; i < statsStart; i++) {
			const t = texts[i];
			// Skip numbers, UI elements, and stats patterns
			if (
				!t.match(/^\d/) &&
				!skipPatterns.includes(t) &&
				!postsPattern.test(t) &&
				!followersPattern.test(t) &&
				!followingPattern.test(t) &&
				!["posts", "followers", "following"].includes(t.toLowerCase()) &&
				t.length > 1
			) {
				result.displayName = t;
				break;
			}
		}
	}

	// Bio: text between stats end and buttons
	// Exclude numbers, UI text, and highlight titles
	const bioEnd = buttonIdx > statsEnd ? buttonIdx : texts.length;
	const bioTexts: string[] = [];

	for (let i = statsEnd; i < bioEnd; i++) {
		const t = texts[i];
		// Skip numbers, UI elements
		if (
			t.match(/^\d+$/) ||
			skipPatterns.includes(t) ||
			buttonPatterns.includes(t)
		) {
			continue;
		}
		// Skip if it looks like a URL
		if (t.match(/^https?:\/\//)) {
			result.bioLink = t;
			continue;
		}
		// Skip short link text patterns
		if (t.match(/\.(com|me|co|link|bio)\//i)) {
			result.bioLink = t;
			continue;
		}
		bioTexts.push(t);
	}

	if (bioTexts.length > 0) {
		result.bio = bioTexts.join(" ").trim();
	}

	// Highlights: text after buttons
	if (buttonIdx > 0) {
		for (let i = buttonIdx + 1; i < texts.length; i++) {
			const t = texts[i];
			// Skip obvious non-highlights
			if (
				t.length > 0 &&
				!skipPatterns.includes(t) &&
				!buttonPatterns.includes(t) &&
				!t.match(/^\d+$/)
			) {
				result.highlights.push(t);
			}
		}
	}

	return result;
}

/**
 * Extract profile elements directly from HTML string
 * Convenience function combining text extraction and identification
 */
export function extractProfileFromHTML(html: string): ProfileElements {
	const texts = extractTextArrayFromHTML(html);
	return identifyProfileElements(texts);
}
