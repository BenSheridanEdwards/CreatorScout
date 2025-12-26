import type { Page } from "puppeteer";
import { CONFIDENCE_THRESHOLD } from "../../shared/config/config.ts";

const INSTAGRAM_HOST = "instagram.com";

const AGGREGATOR_REGEX =
	/linktr\.ee|link\.me|beacons\.ai|allmylinks|linkin\.bio|bio\.link|stan\.store|fanhouse/i;

const CREATOR_HOST_REGEX = /patreon\.com/i;

// Domains that should NEVER be considered creator links
export const BLACKLISTED_DOMAINS = [
	"meta.com",
	"facebook.com",
	"instagram.com",
	"twitter.com",
	"x.com",
	"threads.net",
	"threads.com",
	"linkedin.com",
	"youtube.com",
	"tiktok.com",
	"snapchat.com",
	"imdb.com",
	"wikipedia.org",
	"amazon.com",
	"ebay.com",
	"google.com",
	"spotify.com",
	"apple.com",
];

const CREATOR_PLATFORMS = [
	"patreon.com",
	"ko-fi.com",
	"fanvue.com",
	"loyalfans.com",
	"manyvids.com",
	"justforfans.com",
	"patreon.com",
	"subscribestar.com",
];

const AGGREGATOR_DOMAINS = [
	"linktr.ee",
	"link.me",
	"linkin.bio",
	"allmylinks.com",
	"beacons.ai",
];

const CREATOR_KEYWORDS = [
	"patreon",
	"fanvue",
	"loyal fans",
	"manyvids",
	"justforfans",
	"subscribe",
	"exclusive content",
	"premium content",
	"nsfw",
	"premium content",
	"vip",
	"patreon",
	"subscribestar",
	"buy me a coffee",
	"ko-fi",
	"cashapp",
	"venmo",
	"private account",
	"get access",
	"limited time",
	"my content",
	"chat with me",
	"content",
	"account",
];

/**
 * Normalize and filter candidate links collected from profile HTML, primary bio link,
 * and header anchor tags.
 */
export function buildUniqueLinks(
	html: string,
	headerHrefs: Array<string | null | undefined>,
	primaryBioLink?: string | null,
): string[] {
	const candidates: Set<string> = new Set();

	// Always include the primary bio link if it exists
	if (primaryBioLink) candidates.add(primaryBioLink);

	// Include header hrefs that are external
	headerHrefs.filter(Boolean).forEach((href) => {
		if (
			(href as string).includes("http") &&
			!(href as string).includes(INSTAGRAM_HOST)
		) {
			candidates.add(href as string);
		}
	});

	// Include URLs from HTML that match creator platforms or aggregators
	const urlMatches = html.match(/https?:\/\/[^\s"'<]+/gi) || [];
	urlMatches
		.filter((u) => CREATOR_HOST_REGEX.test(u) || AGGREGATOR_REGEX.test(u))
		.forEach((u) => {
			candidates.add(u);
		});

	const jsonLink = html.match(/"external_url":"(https?:[^\\"\\s]+)"/i);
	if (jsonLink) candidates.add(jsonLink[1].replace(/\\u0026/g, "&"));

	return [...candidates].filter(
		(u) =>
			u?.startsWith("http") &&
			// Allow Instagram redirect URLs that point to external sites
			(!u.includes(INSTAGRAM_HOST) || u.includes("l.instagram.com")),
	);
}

export function hasDirectCreatorLink(links: string[]): boolean {
	return links.some((u) => CREATOR_HOST_REGEX.test(u));
}

export function collectAggregatorLinks(links: string[]): string[] {
	return links.filter((u) => AGGREGATOR_REGEX.test(u));
}

/**
 * Ensure link is a valid https URL and strip leading slashes.
 */
export function toSafeHttps(url: string): string {
	if (!url) return url;
	const normalized = url.startsWith("http")
		? url
		: `https://${url.replace(/^[/]+/, "")}`;
	return normalized.replace(/^http:\/\//i, "https://");
}

// Helper function to decode Instagram redirect URLs
export function decodeInstagramRedirect(url: string): string | null {
	try {
		// Handle l.instagram.com redirect URLs
		if (url.includes("l.instagram.com/?u=")) {
			const urlParam = new URL(url).searchParams.get("u");
			if (urlParam) {
				return decodeURIComponent(urlParam);
			}
		}
		return url;
	} catch {
		return url; // Return original URL if decoding fails
	}
}

/**
 * Analyze an external link by following it and checking the destination content.
 * If we're already on the target URL (or a related page), skip navigation.
 */
export async function analyzeExternalLink(
	page: Page,
	linkUrl: string,
): Promise<{
	isCreator: boolean;
	confidence: number;
	reason: string;
	indicators: string[];
}> {
	const result = {
		isCreator: false,
		confidence: 0,
		reason: "",
		indicators: [] as string[],
	};

	let isAggregator = false; // Track if it's an aggregator for later use

	try {
		const currentUrl = page.url();

		// Check if we're already on an external page (not Instagram)
		// This happens when clickBioLink was used before calling this function
		const isAlreadyOnExternalPage =
			!currentUrl.includes("instagram.com") && currentUrl.includes("http");

		let finalUrl: string;

		if (isAlreadyOnExternalPage) {
			console.log(`[LINK_ANALYSIS] Already on external page: ${currentUrl}`);
			finalUrl = currentUrl;
		} else {
			// Navigate to the external link
			console.log(`[LINK_ANALYSIS] Navigating to: ${linkUrl}`);
			await page.goto(linkUrl, { waitUntil: "networkidle2", timeout: 15000 });
			finalUrl = page.url();
		}

		// Check if the URL is blacklisted (non-creator domains)
		const finalUrlLower = finalUrl.toLowerCase();
		const isBlacklisted = BLACKLISTED_DOMAINS.some((domain) =>
			finalUrlLower.includes(domain),
		);

		if (isBlacklisted) {
			console.log(
				`[LINK_ANALYSIS] ⛔ Blacklisted domain detected: ${finalUrl}`,
			);
			result.isCreator = false;
			result.confidence = 0;
			result.reason = "blacklisted_domain";
			result.indicators.push(
				`Blacklisted domain (not a creator platform): ${new URL(finalUrl).hostname}`,
			);
			return result;
		}

		// Check for direct creator platform redirects
		const isCreatorPlatform = CREATOR_PLATFORMS.some((platform) =>
			finalUrlLower.includes(platform),
		);

		if (isCreatorPlatform) {
			result.isCreator = true;
			// Major adult platforms = 100%, others = 95%
			const majorPlatforms = [
				"patreon",
				"ko-fi",
				"fanvue",
				"loyalfans",
				"manyvids",
			];
			const isMajorPlatform = majorPlatforms.some((p) =>
				finalUrlLower.includes(p),
			);
			result.confidence = isMajorPlatform ? 100 : 95;
			result.reason = "direct_creator_platform";
			result.indicators.push(
				`Direct link to creator platform: ${new URL(finalUrl).hostname}`,
			);
			return result;
		}

		// Check if it's a known aggregator platform
		isAggregator = AGGREGATOR_DOMAINS.some((domain) =>
			finalUrl.toLowerCase().includes(domain),
		);

		if (isAggregator) {
			result.isCreator = true;
			result.confidence = 40;
			result.reason = "aggregator_platform";
			result.indicators.push(
				`Uses creator aggregator: ${new URL(finalUrl).hostname}`,
			);
			console.log(
				`[LINK_ANALYSIS] 📋 Detected aggregator platform: ${new URL(finalUrl).hostname}`,
			);
			// Don't return early - continue analyzing content for higher confidence
		}

		console.log(`[LINK_ANALYSIS] 🔎 Analyzing page content at: ${finalUrl}`);

		// Extract and analyze page content for keywords and creator indicators
		const pageContent = await page.evaluate(() => {
			// Check for Linktree's "Sensitive Content" gate (strong indicator)
			const hasSensitiveContentGate =
				document.body.textContent?.includes("Sensitive Content") &&
				(document.body.textContent?.includes(
					"not appropriate for all audiences",
				) ||
					document.body.textContent?.includes("Continue"));

			// Get text content
			const elements = document.querySelectorAll("h1, h2, h3, p, span, div, a");
			const texts = Array.from(elements)
				.map((el) => (el as HTMLElement).innerText?.trim())
				.filter((text) => text && text.length > 3 && text.length < 200)
				.slice(0, 50);

			// Get image alt texts and titles (for social media icons)
			const images = document.querySelectorAll("img");
			const imageAlts = Array.from(images)
				.map((img) => img.getAttribute("alt") || img.getAttribute("title"))
				.filter(Boolean)
				.map((alt) => alt!.toLowerCase());

			// Look for social media icons by src patterns
			const socialIcons = Array.from(images)
				.filter((img) => {
					const src = img.getAttribute("src") || "";
					return (
						src.includes("patreon") ||
						src.includes("fanvue") ||
						src.includes("loyalfans") ||
						src.includes("manyvids") ||
						src.includes("justforfans") ||
						src.includes("patreon") ||
						src.includes("subscribestar")
					);
				})
				.map((img) => img.getAttribute("alt") || "social_icon");

			// Look for subscription forms
			const hasEmailForm =
				document.querySelector('input[type="email"]') !== null;
			const hasSubscribeButton =
				document.querySelector("button, a") &&
				Array.from(document.querySelectorAll("button, a")).some((el) =>
					(el as HTMLElement).innerText?.toLowerCase().includes("subscribe"),
				);

			// Look for pricing/subscription indicators in buttons and text
			const hasPricingIndicator = Array.from(
				document.querySelectorAll("button, a, div, span, p"),
			).some((el) => {
				const text = (el as HTMLElement).innerText?.toLowerCase() || "";
				return (
					(text.includes("$") &&
						(text.includes("/m") ||
							text.includes("/month") ||
							text.includes("month"))) ||
					text.includes("private account") ||
					text.includes("get access") ||
					text.includes("limited time") ||
					(text.includes("content") &&
						(text.includes("my") || text.includes("exclusive")))
				);
			});

			// Look for premium content indicators
			const hasMonetizationIndicator = Array.from(
				document.querySelectorAll("button, a, div, span, p"),
			).some((el) => {
				const text = (el as HTMLElement).innerText?.toLowerCase() || "";
				return (
					text.includes("🥵") ||
					(text.includes("hot") && text.includes("content")) ||
					text.includes("chat with me") ||
					text.includes("don't tell") ||
					text.includes("dont tell")
				);
			});

			// Look for creator-specific text patterns
			// NOTE: These should be DEFINITIVE phrases, not generic words
			const creatorTextPatterns = [
				// Definitive creator platform signals
				"patreon",
				"creator link",
				"ko-fi",
				"fanvue",
				"loyalfans",
				"loyal fans",
				"manyvids",
				"justforfans",
				// Definitive content signals
				"exclusive content",
				"premium content",
				"custom content",
				"premium content",
				"nsfw",
				"exclusive",
				"+18",
				// Context-specific signals (must include context)
				"private account",
				"get access",
				"my content",
				"chat with me",
				"subscribe to",
				"subscribe for",
				"vip access",
				"vip content",
			];

			return {
				title: document.title,
				texts: texts,
				fullText: texts.join(" ").toLowerCase(),
				imageAlts: imageAlts,
				socialIcons: socialIcons,
				hasEmailForm: hasEmailForm,
				hasSubscribeButton: hasSubscribeButton,
				hasPricingIndicator: hasPricingIndicator,
				hasMonetizationIndicator: hasMonetizationIndicator,
				hasSensitiveContentGate: hasSensitiveContentGate,
				creatorPatterns: creatorTextPatterns.filter((pattern) =>
					texts.some((text) => text.toLowerCase().includes(pattern)),
				),
			};
		});

		// Look for creator keywords in text
		const keywordMatches = CREATOR_KEYWORDS.filter((keyword) =>
			pageContent.fullText.includes(keyword.toLowerCase()),
		);

		if (keywordMatches.length > 0) {
			console.log(
				`[LINK_ANALYSIS] 🔍 Found ${keywordMatches.length} keyword matches: ${keywordMatches.slice(0, 5).join(", ")}`,
			);
		}

		// Check for Linktree's "Sensitive Content" gate (ULTIMATE signal)
		if (pageContent.hasSensitiveContentGate) {
			result.isCreator = true;
			result.confidence = 100;
			result.reason = "sensitive_content_gate";
			result.indicators.push(
				"CONTENT GATE - Linktree premium content warning",
			);
			console.log(
				`[LINK_ANALYSIS] 🔒 Found Linktree Sensitive Content gate - DEFINITIVE creator signal`,
			);
			return result;
		}

		// ULTIMATE SIGNALS: Definitive creator indicators = instant 100% confidence
		const definitiveSignals = [
			{
				text: "exclusive content",
				label: "EXCLUSIVE CONTENT",
				reason: "exclusive_content",
			},
			{ text: "patreon", label: "PATREON", reason: "patreon" },
			{ text: "creator link", label: "PATREON", reason: "patreon" },
			{ text: "ko-fi", label: "KO-FI", reason: "ko-fi" },
			{
				text: "premium content",
				label: "PREMIUM CONTENT",
				reason: "premium_content",
			},
			{ text: "nsfw", label: "NSFW", reason: "nsfw" },
			{ text: "exclusive", label: "exclusive", reason: "age_restricted" },
			{ text: "18 +", label: "exclusive", reason: "age_restricted" },
			{ text: "+18", label: "exclusive", reason: "age_restricted" },
			{ text: "fanvue", label: "FANVUE", reason: "fanvue" },
			{
				text: "custom content",
				label: "CUSTOM CONTENT",
				reason: "custom_content",
			},
			{ text: "loyalfans", label: "LOYALFANS", reason: "loyalfans" },
			{ text: "loyal fans", label: "LOYALFANS", reason: "loyalfans" },
			{ text: "manyvids", label: "MANYVIDS", reason: "manyvids" },
			{ text: "my vip page", label: "VIP PAGE", reason: "vip_page" },
			{ text: "vip page", label: "VIP PAGE", reason: "vip_page" },
			{ text: "my vip", label: "VIP PAGE", reason: "vip_page" },
		];

		for (const signal of definitiveSignals) {
			if (
				pageContent.fullText.includes(signal.text) ||
				keywordMatches.includes(signal.text) ||
				pageContent.creatorPatterns.includes(signal.text)
			) {
				result.isCreator = true;
				result.confidence = 100;
				result.reason = signal.reason;
				result.indicators.push(`${signal.label} - definitive creator signal`);
				console.log(
					`[LINK_ANALYSIS] 🎯 Found definitive signal: ${signal.label}`,
				);
				console.log(`[LINK_ANALYSIS] Page text contains: "${signal.text}"`);
				return result;
			}
		}

		// Look for social media platform indicators in image alts and icons
		const platformIndicators = [
			"patreon",
			"fanvue",
			"loyal fans",
			"manyvids",
			"justforfans",
			"patreon",
			"subscribestar",
		];

		const platformMatches = platformIndicators.filter(
			(platform) =>
				pageContent.imageAlts.some((alt) => alt.includes(platform)) ||
				pageContent.socialIcons.some((icon) =>
					icon.toLowerCase().includes(platform),
				),
		);

		if (platformMatches.length > 0) {
			console.log(
				`[LINK_ANALYSIS] 🔗 Found platform icons/links: ${platformMatches.join(", ")}`,
			);
		}

		// Check for ADULT/CREATOR-SPECIFIC indicators (not just generic "subscribe" or "fan")
		// Generic content creators (fitness, gaming, etc.) also use these platforms
		const hasDefinitiveCreatorIndicators =
			pageContent.hasMonetizationIndicator ||
			pageContent.creatorPatterns.some((pattern) =>
				[
					"exclusive content",
					"premium content",
					"patreon",
					"creator link",
					"ko-fi",
					"fanvue",
					"loyalfans",
					"manyvids",
					"custom content",
					"nsfw",
					"exclusive",
					"+18",
					"private account",
					"chat with me",
				].includes(pattern),
			) ||
			platformMatches.length > 0; // Platform icons are still strong signals

		// Generic indicators that ANY creator might have (fitness, gaming, etc.)
		const hasGenericCreatorIndicators =
			pageContent.hasEmailForm ||
			pageContent.hasSubscribeButton ||
			pageContent.hasPricingIndicator;

		// Log what indicators were found
		const foundIndicators = [];
		if (pageContent.hasEmailForm) foundIndicators.push("email form");
		if (pageContent.hasSubscribeButton)
			foundIndicators.push("subscribe button");
		if (pageContent.hasPricingIndicator) foundIndicators.push("pricing");
		if (pageContent.hasMonetizationIndicator)
			foundIndicators.push("premium content");
		if (pageContent.creatorPatterns.length > 0)
			foundIndicators.push(
				`patterns: ${pageContent.creatorPatterns.join(", ")}`,
			);

		if (foundIndicators.length > 0) {
			console.log(
				`[LINK_ANALYSIS] 💰 Creator indicators: ${foundIndicators.join(", ")}`,
			);
		}

		// ONLY mark as creator if we have DEFINITIVE signals
		// (Not just generic "subscribe" buttons that any content creator has)
		if (hasDefinitiveCreatorIndicators) {
			result.isCreator = true;

			// Higher confidence for platform icons (most reliable)
			if (platformMatches.length > 0) {
				result.confidence = 90;
				result.reason = "platform_icons";
				result.indicators.push(
					`Found platform icons: ${platformMatches.join(", ")}`,
				);
			} else if (pageContent.hasMonetizationIndicator) {
				result.confidence = 85;
				result.reason = "adult_content_indicator";
				result.indicators.push("Has premium content indicator");
			} else if (pageContent.creatorPatterns.length > 0) {
				result.confidence = 80;
				result.reason = "creator_patterns";
				result.indicators.push(
					`Creator-specific text: ${pageContent.creatorPatterns.slice(0, 3).join(", ")}`,
				);
			}

			// Add additional indicators
			if (pageContent.creatorPatterns.length > 0) {
				result.indicators.push(
					`Patterns found: ${pageContent.creatorPatterns.join(", ")}`,
				);
			}

			return result;
		}

		// If we ONLY have generic indicators (subscribe button, email form, pricing)
		// WITHOUT any adult/creator-specific signals, still give moderate confidence
		// Pricing on aggregator platforms is a strong signal for monetized content
		if (hasGenericCreatorIndicators && isAggregator) {
			// Pricing is a stronger signal than just email/subscribe
			if (pageContent.hasPricingIndicator) {
				result.confidence = Math.max(result.confidence, 60); // Pricing = moderate confidence
				result.reason = "aggregator_with_pricing";
				result.indicators.push(
					"Aggregator link with pricing/monetization (likely creator)",
				);
				console.log(
					`[LINK_ANALYSIS] 💰 Aggregator with pricing detected - moderate confidence`,
				);
			} else {
				result.confidence = Math.max(result.confidence, 30); // Email/subscribe only = low confidence
				result.reason = "generic_aggregator_link";
				result.indicators.push(
					"Has aggregator link with generic subscription features (no premium content signals)",
				);
				console.log(
					`[LINK_ANALYSIS] ⚠️  Generic aggregator detected (fitness coach, artist, etc.) - keeping low confidence`,
				);
			}
			return result;
		}

		// If still unsure but it's an aggregator, use low confidence
		// (Many non-creators use aggregator platforms just to organize links)
		if (isAggregator) {
			result.isCreator = true;
			result.confidence = 35;
			result.reason = "aggregator_platform";
			result.indicators.push(
				"Uses creator aggregator (no strong content indicators found)",
			);
			return result;
		}

		// If still unsure, indicate potential creator but low confidence
		result.confidence = 20;
		result.reason = "external_link_found";
		result.indicators.push("Has external link (potential creator)");
	} catch (error) {
		result.indicators.push(`Failed to analyze link: ${error}`);
	}

	return result;
}

/**
 * Threshold for skipping vision analysis when text-based analysis is confident enough.
 * Uses the same threshold as creator confirmation - if we're confident enough to
 * confirm a creator, we're confident enough to skip expensive vision API calls.
 */
export const VISION_SKIP_THRESHOLD = CONFIDENCE_THRESHOLD;

/**
 * Determine if vision analysis should be used based on current confidence and signals.
 */
export function shouldUseVisionAnalysis(
	currentConfidence: number,
	hasExternalLinks: boolean,
	hasHighlights: boolean,
): boolean {
	// Skip vision if text-based analysis already has high confidence
	if (currentConfidence >= VISION_SKIP_THRESHOLD) {
		console.log(
			`[VISION] Skipping - text confidence ${currentConfidence}% >= ${VISION_SKIP_THRESHOLD}% threshold`,
		);
		return false;
	}

	// Only use vision if we have some signals that might indicate creator activity
	const shouldUse = hasExternalLinks || hasHighlights;
	if (!shouldUse) {
		console.log(
			`[VISION] Skipping - no external links or highlights to analyze`,
		);
	}
	return shouldUse;
}
