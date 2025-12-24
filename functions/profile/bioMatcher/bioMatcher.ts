/**
 * Bio matching logic - keyword and emoji detection.
 */

// Sexual/link emojis commonly used by creators
const LINK_EMOJIS = new Set([
	"🔥",
	"💋",
	"😈",
	"👅",
	"🍑",
	"🍒",
	"💦",
	"🥵",
	"😏",
	"💕",
	"❤️",
	"🖤",
	"💜",
	"🤍",
	"💗",
	"🔞",
	"⬇️",
	"👇",
	"📩",
	"💌",
	"🎀",
	"🌹",
	"💎",
	"✨",
	"⭐",
	"🌟",
	"💫",
	"🦋",
	"🐰",
	"😘",
	"🥰",
	"💞",
	"💓",
	"💝",
	"💖",
	"❣️",
	"💟",
	"♥️",
	"🫦",
	"👀",
]);

// Username keywords that suggest OF/premium content
const USERNAME_KEYWORDS = [
	"mistress",
	"goddess",
	"princess",
	"queen",
	"baby",
	"daddy",
	"slave",
	"sub",
	"dom",
	"domme",
	"kink",
	"fetish",
	"sugar",
	"escort",
	"model",
	"content",
	"creator",
	"spicy",
	"naughty",
	"bad",
	"good",
	"sweet",
	"hot",
	"sexy",
	"babe",
	"honey",
	"angel",
	"devil",
	"sin",
	"lust",
	"desire",
	"tempt",
	"seduce",
];

// Keywords that suggest OF/premium content
const KEYWORDS = [
	// Direct mentions
	"patreon",
	"creator link",
	"ko-fi",
	"fanvue",
	"loyalfans",
	"fanfix",
	"fanhouse",
	// Link hints
	"link in bio",
	"linkinbio",
	"linktr",
	"linktree",
	"beacons",
	"allmylinks",
	"tap here",
	"click here",
	"link below",
	"⬇️ link",
	"bio link",
	// Highlight hints
	"check my highlight",
	"check highlight",
	"see highlight",
	"highlight",
	"highlights",
	"my link",
	"my 🔗",
	"link in highlight",
	"official",
	"official account",
	"official accounts",
	"all my links",
	"all links",
	// Content hints
	"exclusive",
	"exclusive content",
	"spicy",
	"spicy content",
	"uncensored",
	"uncut",
	"explicit",
	"xxx",
	"x rated",
	"exclusive",
	"18 +",
	"+18",
	"🔞",
	"nsfw",
	"premium content",
	"content creator",
	"creator",
	// Subscription hints
	"subscribe",
	"subscription",
	"premium",
	"vip",
	"free trial",
	"dm for",
	"dm me",
	"message for",
	"collab",
	"collabs",
	"% off",
	"discount",
	"sale",
	"limited",
	"unlock",
	"join me",
	// Link phrases
	"come play",
	"come see",
	"see more",
	"want more",
	"full videos",
	"full content",
	"private content",
	"private page",
	"secret page",
	"naughty",
	"bad girl",
	"good girl",
	"daddy",
	"baby girl",
	"what you need",
	"all you need",
	"your girl",
	"your babe",
	"your queen",
	"your goddess",
	"custom",
	"custom content",
	"custom video",
	"rates",
	"menu",
	"pricing",
	"tip",
	"tips",
	"cashapp",
	"venmo",
	"paypal",
	"booking",
	"available",
	"open",
	"dm open",
	"dms open",
];

const DISCOUNT_PATTERNS = [
	/\d{1,3}\s*%\s*off/i,
	/\bdiscount\b/i,
	/\bsale\b/i,
	/limited\s+offer/i,
	/limited\s+time/i,
	/special\s+offer/i,
];

const EXCLUSIVE_PATTERNS = [
	/exclusive\s+content/i,
	/premium\s+content/i,
	/vip\s+access/i,
	/private\s+content/i,
	/uncensored/i,
	/unfiltered/i,
];

// Patterns for links
const LINK_PATTERNS = [
	/linktr\.ee\/\w+/i,
	/beacons\.ai\/\w+/i,
	/allmylinks\.com\/\w+/i,
	/patreon\.com\/\w+/i,
	/ko-fi\.com\/\w+/i,
	/fanvue\.com\/\w+/i,
	/fanfix\.io\/\w+/i,
	/fanhouse\.app\/\w+/i,
	/loyalfans\.com\/\w+/i,
	/manyvids\.com\/\w+/i,
];

export function countLinkEmojis(text: string): number {
	return Array.from(text).filter((char) => LINK_EMOJIS.has(char)).length;
}

export function findKeywords(text: string): string[] {
	const textLower = text.toLowerCase();
	return KEYWORDS.filter((kw) => textLower.includes(kw));
}

export function extractLinks(text: string): string[] {
	const links: string[] = [];
	for (const pattern of LINK_PATTERNS) {
		const matches = text.match(new RegExp(pattern));
		if (matches) {
			links.push(...matches);
		}
	}
	return links;
}

export interface BioScoreResult {
	score: number;
	reasons: string[];
	emojis: number;
	keywords: string[];
	links: string[];
	referencedProfiles: string[]; // Instagram @username mentions in bio
}

/**
 * Extract Instagram @username mentions from bio
 */
function extractReferencedProfiles(
	bio: string,
	currentUsername?: string,
): string[] {
	// Match @username pattern (alphanumeric, underscores, periods)
	const usernameRegex = /@([a-zA-Z0-9._]+)/g;
	const matches = bio.matchAll(usernameRegex);
	const profiles: string[] = [];

	for (const match of matches) {
		const username = match[1].toLowerCase();
		// Don't include the current profile's own username
		if (currentUsername && username === currentUsername.toLowerCase()) {
			continue;
		}
		profiles.push(username);
	}

	return [...new Set(profiles)]; // Remove duplicates
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
		};
	}

	const emojiCount = countLinkEmojis(bio);
	const keywords = findKeywords(bio);
	const links = extractLinks(bio);
	const referencedProfiles = extractReferencedProfiles(bio, username);
	const bioLower = bio.toLowerCase();
	const usernameLower = username?.toLowerCase() || "";
	const hasDiscount = DISCOUNT_PATTERNS.some((p) => p.test(bioLower));
	const hasExclusive = EXCLUSIVE_PATTERNS.some((p) => p.test(bioLower));

	// Check for username keywords
	const usernameKeyword = USERNAME_KEYWORDS.find((kw) =>
		usernameLower.includes(kw),
	);

	// Check for "check my highlight" pattern with link emoji
	const hasHighlightHint =
		(bioLower.includes("check my highlight") ||
			bioLower.includes("check highlight") ||
			bioLower.includes("see highlight")) &&
		(bio.includes("🔗") || bio.includes("link"));

	let score = 0;
	const reasons: string[] = [];

	// ULTIMATE SIGNALS: Definitive creator indicators = instant 100% confidence
	const definitiveSignals = [
		{ text: "exclusive content", label: "EXCLUSIVE CONTENT" },
		{ text: "patreon", label: "PATREON" },
		{ text: "creator link", label: "PATREON" },
		{ text: "ko-fi", label: "KO-FI" },
		{ text: "premium content", label: "PREMIUM CONTENT" },
		{ text: "nsfw", label: "NSFW" },
		{ text: "exclusive", label: "exclusive" },
		{ text: "18 +", label: "exclusive" },
		{ text: "+18", label: "exclusive" },
		{ text: "fanvue", label: "FANVUE" },
		{ text: "custom content", label: "CUSTOM CONTENT" },
		{ text: "loyalfans", label: "LOYALFANS" },
		{ text: "manyvids", label: "MANYVIDS" },
	];

	for (const signal of definitiveSignals) {
		if (bioLower.includes(signal.text)) {
			score = 100;
			reasons.push(`${signal.label} - definitive creator signal`);
			return {
				score: 100,
				reasons,
				emojis: emojiCount,
				keywords,
				links,
				referencedProfiles,
			};
		}
	}

	// Username keyword scoring (max 20 points)
	if (usernameKeyword) {
		score += 20;
		reasons.push(`Username contains "${usernameKeyword}"`);
	}

	// Highlight hint scoring (max 15 points)
	if (hasHighlightHint) {
		score += 15;
		reasons.push("Bio directs to highlights for links");
	}

	// Emoji scoring (max 25 points)
	if (emojiCount >= 5) {
		score += 25;
		reasons.push(`${emojiCount} link emojis`);
	} else if (emojiCount >= 3) {
		score += 15;
		reasons.push(`${emojiCount} link emojis`);
	} else if (emojiCount >= 1) {
		score += 5;
		reasons.push(`${emojiCount} link emoji`);
	}

	// Keyword scoring (max 50 points base + bonus heuristics)
	const keywordsLower = keywords.map((k) => k.toLowerCase());
	if (keywordsLower.includes("patreon")) {
		score += 50;
		reasons.push("mentions Patreon directly");
	} else if (
		["ko-fi", "fanvue", "loyalfans"].some((k) => keywordsLower.includes(k))
	) {
		score += 45;
		reasons.push("mentions adult platform");
	} else if (
		["exclusive", "exclusive", "nsfw", "spicy"].some((k) => keywordsLower.includes(k))
	) {
		score += 30;
		reasons.push("premium content keywords");
	} else if (
		["link in bio", "linktree", "linktr"].some((k) => keywordsLower.includes(k))
	) {
		score += 15;
		reasons.push("link in bio hint");
	} else if (keywords.length > 0) {
		score += 10;
		reasons.push(`keywords: ${keywords.slice(0, 3).join(", ")}`);
	}

	// Heuristic: exclusive content + discount language (strong signal even without explicit OF link)
	if (hasExclusive && hasDiscount) {
		score += 25;
		reasons.push("exclusive content + discount offer");
	} else if (hasExclusive) {
		score += 10;
		reasons.push("exclusive content wording");
	} else if (hasDiscount) {
		score += 8;
		reasons.push("discount/promo wording");
	}

	// Link scoring (max 25 points)
	if (links.some((l) => l.toLowerCase().includes("patreon"))) {
		score += 25;
		reasons.push("creator link in bio");
	} else if (links.length > 0) {
		score += 15;
		reasons.push(`has linktree: ${links[0]}`);
	}

	// Boost confidence if referencing another Instagram profile
	if (referencedProfiles.length > 0) {
		score += 10;
		reasons.push(
			`references Instagram profile(s): ${referencedProfiles.map((p) => "@" + p).join(", ")}`,
		);
	}

	return {
		score: Math.min(score, 100),
		reasons,
		emojis: emojiCount,
		keywords,
		links,
		referencedProfiles,
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
