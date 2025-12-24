/**
 * Vision AI for analyzing linktree/link pages.
 */
import { readFileSync } from "node:fs";
import { OpenAI } from "openai";
import {
	CONFIDENCE_THRESHOLD,
	OPENROUTER_API_KEY,
	VISION_MODEL,
	VISION_MODEL_FALLBACK,
} from "../../shared/config/config.ts";

const client = new OpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: OPENROUTER_API_KEY,
});

/**
 * Check if an error is a rate limit error (429)
 */
function isRateLimitError(error: unknown): boolean {
	return (
		error instanceof Error &&
		("status" in error && (error as any).status === 429)
	);
}

const LINKTREE_PROMPT = `You are analyzing a screenshot of a link page (linktree, beacons, allmylinks, etc.) for an Instagram user.

Determine if this person is an Patreon/premium content creator.

STRONG INDICATORS (high confidence if present):
- Direct links to: Patreon, Ko-fi, FanVue, Fanfix, Fanhouse, LoyalFans, Pornhub, ManyVids
- Text like "Exclusive Content", "Premium Content", "VIP Access", "Private Content"
- Discount language: "% OFF", "Sale", "Limited offer", "Free trial"
- Subscription CTAs: "Subscribe", "Join me", "Unlock", "See more"
- Adult warnings: "exclusive", "NSFW", "Adults only", "Must be 18"

MODERATE INDICATORS (consider with other factors):
- Link/revealing imagery (bikini, lingerie, provocative poses)
- Emojis: 🔥💋🍑🍒💕✨ combined with subscription language
- Words: "Spicy", "Naughty", "Uncensored", "Unfiltered", "Content creator"
- High follower counts with link aggregator pages

IMPORTANT: "Exclusive Content" + discount (e.g., "80% OFF") + link imagery = VERY HIGH confidence even without explicit creator link.

Return EXACTLY this JSON:
{
  "is_adult_creator": true or false,
  "confidence": 0-100,
  "platform_links": ["patreon.com/xxx", "ko-fi.com/xxx"] or [],
  "indicators": ["Exclusive Content with discount", "link imagery", ...] or [],
  "reason": "brief explanation (max 15 words)"
}`;

const PROFILE_PROMPT = `You are analyzing a screenshot of an Instagram profile page. This includes the bio, story highlights, and profile header.

Determine if this person is an Patreon/premium content creator.

STRONG INDICATORS (high confidence if present):
- Story highlight titles like: "My 🔗", "Official Accounts", "Links", "Menu", "Rates", "Custom", "DM"
- Bio text directing to highlights: "Check my highlight 🔗", "See highlights for links"
- Link highlight cover images (lingerie, swimwear, revealing clothing, provocative poses)
- Bio keywords: "Patreon", "Ko-fi", "Exclusive Content", "Premium", "VIP", "Custom Content"
- Username contains: "mistress", "goddess", "princess", "model", "creator"
- High follower count relative to following count

MODERATE INDICATORS (consider with other factors):
- Link emojis in bio or highlights: 🔥💋🍑🍒💦😈👅🥵🖤
- Highlight titles with link emoji (🔗) combined with link imagery
- Bio mentions: "DM for", "Custom", "Rates", "Menu", "Available", "Booking"
- Multiple story highlights suggesting multiple platforms/accounts
- Category label: "Blogger", "Creator", "Model"

VISUAL ANALYSIS:
- Look at story highlight cover images for link content (lingerie, revealing clothing, provocative poses)
- Check if highlight titles match link cover images
- Look for text overlays on highlight covers (e.g., "what you need", "all you need")

IMPORTANT: A profile with "Check my highlight 🔗" + link highlight covers + high follower ratio = HIGH confidence even without explicit creator link in bio.

Return EXACTLY this JSON:
{
  "is_adult_creator": true or false,
  "confidence": 0-100,
  "platform_links": [] or ["patreon.com/xxx"] if visible,
  "indicators": ["Link highlight covers", "Bio directs to highlights", "High follower ratio", ...] or [],
  "reason": "brief explanation (max 15 words)"
}`;

export interface VisionAnalysisResult {
	is_adult_creator: boolean;
	confidence: number;
	platform_links: string[];
	indicators: string[];
	reason: string;
}

export async function analyzeLinktree(
	imagePath: string,
): Promise<VisionAnalysisResult | null> {
	const imageBuffer = readFileSync(imagePath);
	const base64 = imageBuffer.toString("base64");

	// Try with primary model first
	try {
		const response = await client.chat.completions.create({
			model: VISION_MODEL,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: LINKTREE_PROMPT },
						{
							type: "image_url",
							image_url: { url: `data:image/png;base64,${base64}` },
						},
					],
				},
			],
			max_tokens: 400,
			temperature: 0.0,
		});

		let text = response.choices[0]?.message?.content || "";
		text = text
			.trim()
			.replace(/^```json/, "")
			.replace(/^```/, "")
			.replace(/```$/, "");

		return JSON.parse(text.trim()) as VisionAnalysisResult;
	} catch (error) {
		// If rate limited, try fallback model
		if (isRateLimitError(error)) {
			if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
				console.log(
					`[VISION] Free tier rate limited, falling back to paid model: ${VISION_MODEL_FALLBACK}`,
				);
			}

			try {
				const response = await client.chat.completions.create({
					model: VISION_MODEL_FALLBACK,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: LINKTREE_PROMPT },
								{
									type: "image_url",
									image_url: { url: `data:image/png;base64,${base64}` },
								},
							],
						},
					],
					max_tokens: 400,
					temperature: 0.0,
				});

				let text = response.choices[0]?.message?.content || "";
				text = text
					.trim()
					.replace(/^```json/, "")
					.replace(/^```/, "")
					.replace(/```$/, "");

				return JSON.parse(text.trim()) as VisionAnalysisResult;
			} catch (fallbackError) {
				if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
					console.error(`  Fallback vision analysis failed: ${fallbackError}`);
				}
				return null;
			}
		}

		// For other errors, log and return null
		if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
			console.error(`  Vision analysis failed: ${error}`);
		}
		return null;
	}
}

function _containsAny(text: string, patterns: string[]): boolean {
	const lt = text.toLowerCase();
	return patterns.some((p) => lt.includes(p.toLowerCase()));
}

function _hasExclusiveDiscountSignal(data: VisionAnalysisResult): boolean {
	const indicators = data.indicators || [];
	const reason = data.reason || "";
	const text = [...indicators, reason].join(" ").toLowerCase();

	const strong = _containsAny(text, [
		"exclusive content",
		"premium content",
		"vip access",
		"private content",
		"uncensored",
		"unfiltered",
		"nsfw",
		"exclusive",
	]);

	const discount = _containsAny(text, [
		"% off",
		"discount",
		"sale",
		"limited offer",
	]);

	return strong && discount;
}

export async function isConfirmedCreator(
	imagePath: string,
	threshold: number = CONFIDENCE_THRESHOLD,
): Promise<[boolean, VisionAnalysisResult | null]> {
	const data = await analyzeLinktree(imagePath);
	if (!data) {
		return [false, null];
	}

	// ULTIMATE SIGNALS: Definitive creator indicators = instant 100% confidence
	const indicators = data.indicators || [];
	const reason = data.reason || "";
	const allText = [...indicators, reason].join(" ").toLowerCase();
	
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
		{ text: "loyal fans", label: "LOYALFANS" },
		{ text: "manyvids", label: "MANYVIDS" },
	];

	for (const signal of definitiveSignals) {
		if (allText.includes(signal.text)) {
			data.is_adult_creator = true;
			data.confidence = 100;
			if (!indicators.some((i) => i.toLowerCase().includes(signal.text))) {
				indicators.push(`${signal.label} - definitive creator signal`);
				data.indicators = indicators;
			}
			return [true, data];
		}
	}

	let isConfirmed = data.is_adult_creator && data.confidence >= threshold;

	// Heuristic override: Exclusive content + discount language
	if (!isConfirmed && _hasExclusiveDiscountSignal(data)) {
		data.is_adult_creator = true;
		data.confidence = Math.max(data.confidence, threshold);
		if (
			!indicators.some((i) => i.toLowerCase().includes("exclusive+discount"))
		) {
			indicators.push("exclusive+discount offer");
			data.indicators = indicators;
		}
		isConfirmed = true;
	}

	return [isConfirmed, data];
}

const BIO_VALIDATION_PROMPT = `You are analyzing a screenshot of an Instagram profile page to verify if a bio is visible.

Look at the profile header/bio area (below the profile picture, above the story highlights).

Return EXACTLY this JSON:
{
  "bio_visible": true or false,
  "bio_text": "the exact bio text you see" or null if no bio,
  "reason": "brief explanation of what you see"
}

IMPORTANT:
- The bio is the descriptive text about the person, NOT their name or username
- Look for text like descriptions, emojis, links, or personal information
- If you see text like "DM me", "Link in bio", descriptions, or emojis in the bio area, bio_visible = true
- If the bio area is empty or only contains the username/name, bio_visible = false`;

export interface BioValidationResult {
	bio_visible: boolean;
	bio_text: string | null;
	reason: string;
}

/**
 * Validate whether a bio is visible on a profile screenshot.
 * Used to verify bio extraction is working correctly.
 * Automatically falls back to paid model if free tier hits rate limits.
 */
export async function validateBioWithVision(
	imagePath: string,
): Promise<BioValidationResult | null> {
	const imageBuffer = readFileSync(imagePath);
	const base64 = imageBuffer.toString("base64");

	// Try with primary model first
	try {
		const response = await client.chat.completions.create({
			model: VISION_MODEL,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: BIO_VALIDATION_PROMPT },
						{
							type: "image_url",
							image_url: { url: `data:image/png;base64,${base64}` },
						},
					],
				},
			],
			max_tokens: 300,
			temperature: 0.0,
		});

		let text = response.choices[0]?.message?.content || "";
		text = text
			.trim()
			.replace(/^```json/, "")
			.replace(/^```/, "")
			.replace(/```$/, "");

		return JSON.parse(text.trim()) as BioValidationResult;
	} catch (error) {
		// If rate limited, try fallback model
		if (isRateLimitError(error)) {
			if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
				console.log(
					`[VISION] Free tier rate limited, falling back to paid model: ${VISION_MODEL_FALLBACK}`,
				);
			}

			try {
				const response = await client.chat.completions.create({
					model: VISION_MODEL_FALLBACK,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: BIO_VALIDATION_PROMPT },
								{
									type: "image_url",
									image_url: { url: `data:image/png;base64,${base64}` },
								},
							],
						},
					],
					max_tokens: 300,
					temperature: 0.0,
				});

				let text = response.choices[0]?.message?.content || "";
				text = text
					.trim()
					.replace(/^```json/, "")
					.replace(/^```/, "")
					.replace(/```$/, "");

				return JSON.parse(text.trim()) as BioValidationResult;
			} catch (fallbackError) {
				if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
					console.error(`  Fallback bio validation vision failed: ${fallbackError}`);
				}
				return null;
			}
		}

		// For other errors, log and return null
		if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
			console.error(`  Bio validation vision failed: ${error}`);
		}
		return null;
	}
}

/**
 * Analyze an Instagram profile screenshot (includes bio, highlights, header).
 * Uses PROFILE_PROMPT which is optimized for profile pages.
 * Automatically falls back to paid model if free tier hits rate limits.
 */
export async function analyzeProfile(
	imagePath: string,
): Promise<VisionAnalysisResult | null> {
	const imageBuffer = readFileSync(imagePath);
	const base64 = imageBuffer.toString("base64");

	// Try with primary model first
	try {
		const response = await client.chat.completions.create({
			model: VISION_MODEL,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: PROFILE_PROMPT },
						{
							type: "image_url",
							image_url: { url: `data:image/png;base64,${base64}` },
						},
					],
				},
			],
			max_tokens: 400,
			temperature: 0.0,
		});

		let text = response.choices[0]?.message?.content || "";
		text = text
			.trim()
			.replace(/^```json/, "")
			.replace(/^```/, "")
			.replace(/```$/, "");

		try {
			const parsed = JSON.parse(text) as VisionAnalysisResult;
			return parsed;
		} catch {
			// Only log errors when not in test environment to keep test output clean
			if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
				console.error("Failed to parse vision response:", text);
			}
			return null;
		}
	} catch (error) {
		// If rate limited, try fallback model
		if (isRateLimitError(error)) {
			if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
				console.log(
					`[VISION] Free tier rate limited, falling back to paid model: ${VISION_MODEL_FALLBACK}`,
				);
			}

			try {
				const response = await client.chat.completions.create({
					model: VISION_MODEL_FALLBACK,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: PROFILE_PROMPT },
								{
									type: "image_url",
									image_url: { url: `data:image/png;base64,${base64}` },
								},
							],
						},
					],
					max_tokens: 400,
					temperature: 0.0,
				});

				let text = response.choices[0]?.message?.content || "";
				text = text
					.trim()
					.replace(/^```json/, "")
					.replace(/^```/, "")
					.replace(/```$/, "");

				try {
					const parsed = JSON.parse(text) as VisionAnalysisResult;
					return parsed;
				} catch {
					if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
						console.error("Failed to parse fallback vision response:", text);
					}
					return null;
				}
			} catch (fallbackError) {
				if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
					console.error("Fallback vision analysis error:", fallbackError);
				}
				return null;
			}
		}

		// For other errors, log and return null
		if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
			console.error("Vision analysis error:", error);
		}
		return null;
	}
}
