import type { Page } from "puppeteer";

const INSTAGRAM_HOST = "instagram.com";

const AGGREGATOR_REGEX =
	/linktr\.ee|link\.me|beacons\.ai|allmylinks|linkin\.bio|bio\.link|stan\.store|fanhouse/i;

const CREATOR_HOST_REGEX = /patreon\.com/i;

const CREATOR_PLATFORMS = [
	"patreon.com",
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
	} catch (error) {
		return url; // Return original URL if decoding fails
	}
}

/**
 * Analyze an external link by following it and checking the destination content.
 */
export async function analyzeExternalLink(
	page: Page,
	linkUrl: string,
	username: string,
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

	try {
		// Navigate to the external link
		await page.goto(linkUrl, { waitUntil: "networkidle2", timeout: 15000 });
		const finalUrl = page.url();

		// Check for direct creator platform redirects
		const isCreatorPlatform = CREATOR_PLATFORMS.some((platform) =>
			finalUrl.toLowerCase().includes(platform),
		);

		if (isCreatorPlatform) {
			result.isCreator = true;
			result.confidence = 95;
			result.reason = "direct_creator_platform";
			result.indicators.push(
				`Direct link to creator platform: ${new URL(finalUrl).hostname}`,
			);
			return result;
		}

		// Check if it's a known aggregator platform
		const isAggregator = AGGREGATOR_DOMAINS.some((domain) =>
			finalUrl.toLowerCase().includes(domain),
		);

		if (isAggregator) {
			result.isCreator = true;
			result.confidence = 60;
			result.reason = "aggregator_platform";
			result.indicators.push(
				`Uses creator aggregator: ${new URL(finalUrl).hostname}`,
			);
			// Don't return early - continue analyzing content for higher confidence
		}

		// Extract and analyze page content for keywords and creator indicators
		const pageContent = await page.evaluate(() => {
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

			// Look for creator-specific text patterns
			const creatorTextPatterns = [
				"exclusive content",
				"premium content",
				"vip",
				"subscribe",
				"fan",
				"supporter",
				"patron",
				"patreon",
				"premium content",
			];

			return {
				title: document.title,
				texts: texts,
				fullText: texts.join(" ").toLowerCase(),
				imageAlts: imageAlts,
				socialIcons: socialIcons,
				hasEmailForm: hasEmailForm,
				hasSubscribeButton: hasSubscribeButton,
				creatorPatterns: creatorTextPatterns.filter((pattern) =>
					texts.some((text) => text.toLowerCase().includes(pattern)),
				),
			};
		});

		// Look for creator keywords in text
		const keywordMatches = CREATOR_KEYWORDS.filter((keyword) =>
			pageContent.fullText.includes(keyword.toLowerCase()),
		);

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

		// Check for subscription/creator indicators
		const hasCreatorIndicators =
			pageContent.hasEmailForm ||
			pageContent.hasSubscribeButton ||
			pageContent.creatorPatterns.length > 0 ||
			platformMatches.length > 0;

		// Combine all creator detection methods
		const allMatches = [...keywordMatches, ...platformMatches];

		if (allMatches.length > 0 || hasCreatorIndicators) {
			result.isCreator = true;

			// Higher confidence for platform icons (most reliable)
			if (platformMatches.length > 0) {
				result.confidence = 90;
				result.reason = "platform_icons";
				result.indicators.push(
					`Found platform icons: ${platformMatches.join(", ")}`,
				);
			} else if (pageContent.hasEmailForm || pageContent.hasSubscribeButton) {
				result.confidence = 85;
				result.reason = "subscription_form";
				result.indicators.push("Has subscription/signup form");
			} else {
				result.confidence = 80;
				result.reason = "content_keywords";
				result.indicators.push(
					`Page contains creator keywords: ${allMatches.slice(0, 3).join(", ")}`,
				);
			}

			// Add additional indicators
			if (pageContent.creatorPatterns.length > 0) {
				result.indicators.push(
					`Creator text patterns: ${pageContent.creatorPatterns.join(", ")}`,
				);
			}

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
 * Determine if vision analysis should be used based on current confidence and signals.
 */
export async function shouldUseVisionAnalysis(
	currentConfidence: number,
	hasExternalLinks: boolean,
	hasHighlights: boolean,
): Promise<boolean> {
	// Only use vision analysis if confidence is below 70%
	// AND we have some signals that might indicate creator activity
	return currentConfidence < 70 && (hasExternalLinks || hasHighlights);
}
