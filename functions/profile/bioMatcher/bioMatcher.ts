/**
 * Bio matching logic - compound scoring system.
 *
 * Scores individual signals and compounds them together.
 * More signals = higher confidence.
 */

// === SIGNAL CATEGORIES ===

// Tier 1: DEFINITIVE (instant 100%) - explicit platform/content mentions
const DEFINITIVE_SIGNALS = [
	"patreon",
	"creator link",
	"ko-fi",
	"fanvue",
	"loyalfans",
	"manyvids",
	"exclusive",
	"+18",
	"nsfw",
	"xxx",
	"x-rated",
	"x rated",
];

// Tier 2: STRONG signals (25-40 points each)
const STRONG_SIGNALS: Array<{
	pattern: string | RegExp;
	points: number;
	label: string;
}> = [
	// "Yes I have one" / "I have one" - classic creator language meaning "Yes I have an Patreon"
	{ pattern: "yes i have one", points: 50, label: "yes_i_have_one" },
	{ pattern: "yep i have one", points: 50, label: "yes_i_have_one" },
	{ pattern: "yeah i have one", points: 50, label: "yes_i_have_one" },
	{ pattern: "i have one", points: 40, label: "i_have_one" },
	
	// Highlight redirects - classic creator tactic
	{ pattern: "highlight for more", points: 40, label: "highlight_redirect" },
	{ pattern: "highlights for more", points: 40, label: "highlight_redirect" },
	{ pattern: "check my highlight", points: 35, label: "highlight_redirect" },
	{ pattern: "check highlights", points: 35, label: "highlight_redirect" },
	{ pattern: "in my highlights", points: 35, label: "highlight_redirect" },
	{ pattern: "story highlights", points: 30, label: "highlight_redirect" },
	{ pattern: "link in highlight", points: 35, label: "highlight_redirect" },

	// Explicit content markers
	{ pattern: "xxx", points: 40, label: "explicit" },
	{ pattern: "x rated", points: 40, label: "explicit" },
	{ pattern: "uncensored", points: 35, label: "explicit" },
	{ pattern: "explicit", points: 30, label: "explicit" },
	{ pattern: "uncut", points: 30, label: "explicit" },

	// Premium content
	{ pattern: "exclusive content", points: 35, label: "premium" },
	{ pattern: "premium content", points: 35, label: "premium" },
	{ pattern: "private content", points: 35, label: "premium" },
	{ pattern: "custom content", points: 35, label: "premium" },
	{ pattern: "vip", points: 30, label: "premium" },

	// Link "fun" phrases
	{ pattern: "for all the fun", points: 40, label: "link_fun" },
	{ pattern: "all the fun", points: 35, label: "link_fun" },
	{ pattern: "for the fun", points: 30, label: "link_fun" },
	{ pattern: "more fun", points: 25, label: "link_fun" },
	{ pattern: "have fun", points: 20, label: "link_fun" },
	{ pattern: "some fun", points: 20, label: "link_fun" },
	{ pattern: "come play", points: 30, label: "link_fun" },
	{ pattern: "come see", points: 25, label: "link_fun" },

	// Creator phrases
	{ pattern: "you asked", points: 30, label: "creator_phrase" },
	{ pattern: "i delivered", points: 25, label: "creator_phrase" },
	{ pattern: "bts", points: 25, label: "creator_phrase" },
	{ pattern: "behind the scenes", points: 25, label: "creator_phrase" },
	{ pattern: "full video", points: 30, label: "creator_phrase" },
	{ pattern: "see more", points: 20, label: "creator_phrase" },
	{ pattern: "want more", points: 20, label: "creator_phrase" },

	// Link hints
	{ pattern: "link in bio", points: 25, label: "link_hint" },
	{ pattern: "linktree", points: 25, label: "link_hint" },
	{ pattern: "linktr.ee", points: 25, label: "link_hint" },
	{ pattern: "allmylinks", points: 25, label: "link_hint" },
	{ pattern: "beacons", points: 25, label: "link_hint" },

	// Subscription/payment
	{ pattern: "subscribe", points: 25, label: "subscription" },
	{ pattern: "dm for", points: 20, label: "subscription" },
	{ pattern: "dm me", points: 15, label: "subscription" },
	{ pattern: "collab", points: 20, label: "subscription" },
	{ pattern: /\d+%\s*off/i, points: 25, label: "discount" },
	{ pattern: "discount", points: 20, label: "discount" },
	{ pattern: "free trial", points: 25, label: "discount" },
];

// Tier 3: MEDIUM signals (10-20 points each)
const MEDIUM_SIGNALS: Array<{
	pattern: string | RegExp;
	points: number;
	label: string;
}> = [
	// Body references (link when combined with emojis)
	{ pattern: "bigger", points: 15, label: "body_ref" },
	{ pattern: "curves", points: 15, label: "body_ref" },
	{ pattern: "assets", points: 15, label: "body_ref" },
	{ pattern: "booty", points: 20, label: "body_ref" },
	{ pattern: "thicc", points: 20, label: "body_ref" },

	// Backup/alt account (common for creators)
	{ pattern: "backup", points: 15, label: "alt_account" },
	{ pattern: "main @", points: 20, label: "alt_account" },
	{ pattern: "main account", points: 15, label: "alt_account" },
	{ pattern: "other account", points: 15, label: "alt_account" },
	{ pattern: "spicy account", points: 25, label: "alt_account" },

	// Link words
	{ pattern: "spicy", points: 20, label: "link" },
	{ pattern: "naughty", points: 20, label: "link" },
	{ pattern: "bad girl", points: 20, label: "link" },
	{ pattern: "good girl", points: 15, label: "link" },
	{ pattern: "daddy", points: 15, label: "link" },
	{ pattern: "baby girl", points: 15, label: "link" },
	{ pattern: "goddess", points: 15, label: "link" },
	{ pattern: "queen", points: 10, label: "link" },
	{ pattern: "princess", points: 10, label: "link" },

	// Content hints
	{ pattern: "content creator", points: 20, label: "content" },
	{ pattern: "creator", points: 15, label: "content" },
	{ pattern: "model", points: 10, label: "content" },
];

// Tier 4: LINK EMOJIS (5-15 points each, compound when multiple)
const EMOJI_SCORES: Record<string, number> = {
	// High signal emojis (15 points)
	"🔞": 15,
	"💦": 15,
	"🍑": 15,
	"🍒": 15,
	"👅": 15,
	"🫦": 15,

	// Medium signal emojis (10 points)
	"🔥": 10,
	"💋": 10,
	"😈": 10,
	"🥵": 10,
	"😏": 10,
	"👀": 10,
	"⬇️": 10,
	"👇": 10,
	"🔗": 10,

	// Lower signal emojis (5 points) - common but less specific
	"💕": 5,
	"❤️": 5,
	"🖤": 5,
	"💜": 5,
	"🤍": 5,
	"💙": 5,
	"💗": 5,
	"💖": 5,
	"✨": 5,
	"⭐": 5,
	"🌟": 5,
	"💫": 5,
	"🎀": 5,
	"🌹": 5,
	"💎": 5,
	"🦋": 5,
	"🐰": 5,
	"😘": 5,
	"🥰": 5,
};

// === SCORING FUNCTIONS ===

export interface BioScoreResult {
	score: number;
	reasons: string[];
	emojis: number;
	keywords: string[];
	links: string[];
	referencedProfiles: string[];
	signals: { category: string; matches: string[] }[];
}

function matchSignal(text: string, pattern: string | RegExp): boolean {
	if (typeof pattern === "string") {
		return text.toLowerCase().includes(pattern.toLowerCase());
	}
	return pattern.test(text);
}

function extractReferencedProfiles(
	bio: string,
	currentUsername?: string,
): string[] {
	const usernameRegex = /@([a-zA-Z0-9._]+)/g;
	const matches = bio.matchAll(usernameRegex);
	const profiles: string[] = [];

	for (const match of matches) {
		const username = match[1].toLowerCase();
		if (currentUsername && username === currentUsername.toLowerCase()) {
			continue;
		}
		profiles.push(username);
	}

	return [...new Set(profiles)];
}

function extractLinks(text: string): string[] {
	const linkPatterns = [
		/linktr\.ee\/\w+/gi,
		/beacons\.ai\/\w+/gi,
		/allmylinks\.com\/\w+/gi,
		/patreon\.com\/\w+/gi,
		/ko-fi\.com\/\w+/gi,
	];

	const links: string[] = [];
	for (const pattern of linkPatterns) {
		const matches = text.match(pattern);
		if (matches) links.push(...matches);
	}
	return links;
}

export function calculateScore(bio: string, username?: string): BioScoreResult {
	if (!bio) {
		return {
			score: 0,
			reasons: [],
			emojis: 0,
			keywords: [],
			links: [],
			referencedProfiles: [],
			signals: [],
		};
	}

	const bioLower = bio.toLowerCase();
	const signals: { category: string; matches: string[] }[] = [];
	const reasons: string[] = [];
	let score = 0;

	// === CHECK DEFINITIVE SIGNALS (instant 100%) ===
	for (const signal of DEFINITIVE_SIGNALS) {
		if (bioLower.includes(signal)) {
			return {
				score: 100,
				reasons: [`DEFINITIVE: "${signal}" found`],
				emojis: 0,
				keywords: [signal],
				links: extractLinks(bio),
				referencedProfiles: extractReferencedProfiles(bio, username),
				signals: [{ category: "definitive", matches: [signal] }],
			};
		}
	}

	// === CHECK STRONG SIGNALS ===
	const strongMatches: string[] = [];
	for (const signal of STRONG_SIGNALS) {
		if (matchSignal(bio, signal.pattern)) {
			score += signal.points;
			strongMatches.push(
				typeof signal.pattern === "string" ? signal.pattern : signal.label,
			);
			reasons.push(`${signal.label}: +${signal.points}`);
		}
	}
	if (strongMatches.length > 0) {
		signals.push({ category: "strong", matches: strongMatches });
	}

	// === CHECK MEDIUM SIGNALS ===
	const mediumMatches: string[] = [];
	for (const signal of MEDIUM_SIGNALS) {
		if (matchSignal(bio, signal.pattern)) {
			score += signal.points;
			mediumMatches.push(
				typeof signal.pattern === "string" ? signal.pattern : signal.label,
			);
			reasons.push(`${signal.label}: +${signal.points}`);
		}
	}
	if (mediumMatches.length > 0) {
		signals.push({ category: "medium", matches: mediumMatches });
	}

	// === COUNT EMOJIS (compound scoring) ===
	let emojiScore = 0;
	let emojiCount = 0;
	const emojiMatches: string[] = [];

	for (const [emoji, points] of Object.entries(EMOJI_SCORES)) {
		const count = (bio.match(new RegExp(emoji, "g")) || []).length;
		if (count > 0) {
			emojiScore += points * count;
			emojiCount += count;
			emojiMatches.push(`${emoji}(${count})`);
		}
	}

	// Emoji compound bonus: more emojis = multiplier
	if (emojiCount >= 5) {
		emojiScore = Math.round(emojiScore * 1.5); // 50% bonus for 5+ emojis
		reasons.push(`${emojiCount} emojis (1.5x bonus): +${emojiScore}`);
	} else if (emojiCount >= 3) {
		emojiScore = Math.round(emojiScore * 1.2); // 20% bonus for 3-4 emojis
		reasons.push(`${emojiCount} emojis (1.2x bonus): +${emojiScore}`);
	} else if (emojiCount > 0) {
		reasons.push(`${emojiCount} emoji(s): +${emojiScore}`);
	}

	score += emojiScore;
	if (emojiMatches.length > 0) {
		signals.push({ category: "emojis", matches: emojiMatches });
	}

	// === COMBINATION BONUSES ===

	// Body ref + link emoji = big bonus
	const hasBodyRef = mediumMatches.some(
		(m) =>
			m === "body_ref" ||
			["bigger", "curves", "assets", "booty", "thicc"].some((b) =>
				bioLower.includes(b),
			),
	);
	const hasLinkEmoji = ["🍑", "🍒", "💦", "👅", "🫦"].some((e) =>
		bio.includes(e),
	);
	if (hasBodyRef && hasLinkEmoji) {
		score += 25;
		reasons.push("COMBO: body reference + link emoji: +25");
	}

	// Multiple strong signals = compound bonus
	if (strongMatches.length >= 3) {
		const bonus = strongMatches.length * 10;
		score += bonus;
		reasons.push(`COMBO: ${strongMatches.length} strong signals: +${bonus}`);
	} else if (strongMatches.length >= 2) {
		score += 15;
		reasons.push("COMBO: 2 strong signals: +15");
	}

	// Highlight redirect + emojis = very likely creator
	const hasHighlightRedirect = strongMatches.some((m) =>
		m.includes("highlight"),
	);
	if (hasHighlightRedirect && emojiCount >= 2) {
		score += 20;
		reasons.push("COMBO: highlight redirect + emojis: +20");
	}

	// "Yes I have one" / "I have one" + highlight redirect = DEFINITIVE creator signal
	// This phrase specifically means "Yes I have an Patreon"
	const hasIHaveOne = strongMatches.some(
		(m) => m === "yes i have one" || m === "yep i have one" || m === "yeah i have one" || 
		       m === "i have one" || m === "yes_i_have_one" || m === "i_have_one",
	);
	if (hasIHaveOne && hasHighlightRedirect) {
		score += 30;
		reasons.push("COMBO: 'i have one' + highlight redirect = DEFINITIVE: +30");
	}

	// Alt account reference + any link content
	const hasAltAccount = mediumMatches.some(
		(m) =>
			m === "alt_account" ||
			["backup", "main @", "main account"].some((a) => bioLower.includes(a)),
	);
	if (hasAltAccount && (strongMatches.length > 0 || emojiCount >= 3)) {
		score += 20;
		reasons.push("COMBO: alt account + link content: +20");
	}

	// === REFERENCED PROFILES BONUS ===
	const referencedProfiles = extractReferencedProfiles(bio, username);
	if (referencedProfiles.length > 0) {
		score += 10;
		reasons.push(`References @${referencedProfiles[0]}: +10`);
	}

	// === EXTRACT DATA ===
	const links = extractLinks(bio);
	if (links.length > 0) {
		score += 15;
		reasons.push(`Link found: +15`);
	}

	// Collect all matched keywords
	const keywords = [...strongMatches, ...mediumMatches];

	return {
		score: Math.min(score, 100),
		reasons,
		emojis: emojiCount,
		keywords,
		links,
		referencedProfiles,
		signals,
	};
}

export function isLikelyCreator(
	bio: string,
	threshold: number = 40,
	username?: string,
): [boolean, BioScoreResult] {
	const result = calculateScore(bio, username);
	return [result.score >= threshold, result];
}

// Legacy exports for backwards compatibility
export function countLinkEmojis(text: string): number {
	let count = 0;
	for (const emoji of Object.keys(EMOJI_SCORES)) {
		count += (text.match(new RegExp(emoji, "g")) || []).length;
	}
	return count;
}

export function findKeywords(text: string): string[] {
	const result = calculateScore(text);
	return result.keywords;
}
