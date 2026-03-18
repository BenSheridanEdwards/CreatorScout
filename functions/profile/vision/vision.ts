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

// Lazy-load the OpenAI client to avoid errors when OPENROUTER_API_KEY is not set
// (e.g., in test environments that don't need vision functionality)
let _client: OpenAI | null = null;

function getClient(): OpenAI {
	if (!_client) {
		_client = new OpenAI({
			baseURL: "https://openrouter.ai/api/v1",
			apiKey: OPENROUTER_API_KEY,
		});
	}
	return _client;
}

/**
 * Check if an error is a rate limit error (429)
 */
function isRateLimitError(error: unknown): boolean {
	return (
		error instanceof Error && "status" in error && (error as any).status === 429
	);
}

const LINKTREE_PROMPT = `You are analyzing a screenshot of a link page (linktree, beacons, hoo.be, allmylinks, etc.) for an Instagram user.

Your task: Determine if this person is an influencer with monetization links (Patreon, Ko-fi, linktree, etc.) - someone who earns from their audience.

**CRITICAL - READ FIRST**:
People with only shopping links or brand deals are still influencers. Look for: Patreon, Ko-fi, "Buy me a coffee", subscription links, tip jars, or link-in-bio with monetization.

**INSTANT DISQUALIFIERS (isCreator = FALSE, confidence = 0)**:
- No external links at all
- Only personal website with no monetization
- Only music/podcast with no support links

**DEFINITIVE INFLUENCER SIGNALS (isCreator = TRUE)**:
- Direct links to: Patreon, Ko-fi, Buy Me a Coffee, Stan Store, Fanhouse
- "Subscribe", "Support me", "Tip jar", "Exclusive content" with link
- Linktree/Beacons with multiple monetization buttons
- "Link in bio" with subscription or payment platform

**DECISION LOGIC**:
1. If page has Patreon, Ko-fi, or similar monetization links → isCreator = TRUE
2. If page has "Subscribe" or "Support" with payment link → isCreator = TRUE
3. If page has ONLY shopping + social media links → isCreator = FALSE
4. If unsure and no monetization visible → isCreator = FALSE

Return EXACTLY this JSON:
{
  "isCreator": true or false,
  "confidence": 0-100,
  "platform_links": ["patreon.com/xxx", "ko-fi.com/xxx"] or [],
  "indicators": ["what you observed"] or [],
  "reason": "brief explanation (max 15 words)"
}`;

const PROFILE_PROMPT = `You are analyzing a screenshot of an Instagram profile page. This includes the bio, story highlights, and profile header.

Determine if this person is an influencer with monetization (Patreon, Ko-fi, link-in-bio, etc.).

STRONG INDICATORS (high confidence if present):
- Story highlight titles like: "My 🔗", "Links", "Menu", "Rates", "Custom", "DM"
- Bio text directing to highlights: "Check my highlight 🔗", "See highlights for links"
- Bio keywords: "Patreon", "Ko-fi", "Exclusive Content", "Premium", "VIP", "Link in bio"
- Username contains: "creator", "artist", "content"
- High follower count relative to following count

MODERATE INDICATORS (consider with other factors):
- Highlight titles with link emoji (🔗)
- Bio mentions: "DM for", "Custom", "Rates", "Menu", "Available", "Booking"
- Multiple story highlights suggesting multiple platforms
- Category label: "Blogger", "Creator", "Artist"

Return EXACTLY this JSON:
{
  "isCreator": true or false,
  "confidence": 0-100,
  "platform_links": [] or ["patreon.com/xxx"] if visible,
  "indicators": ["Link in bio", "Bio directs to highlights", "High follower ratio", ...] or [],
  "reason": "brief explanation (max 15 words)"
}`;

export interface VisionAnalysisResult {
	isCreator: boolean;
	confidence: number;
	platform_links: string[];
	indicators: string[];
	reason: string;
}

export async function analyzeLinktree(
	imagePath: string,
): Promise<VisionAnalysisResult | null> {
	let imageBuffer: Buffer;
	let base64: string;

	try {
		imageBuffer = readFileSync(imagePath);
		base64 = imageBuffer.toString("base64");
	} catch (error) {
		// File doesn't exist or can't be read
		if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
			console.error(`  Vision analysis failed: ${error}`);
		}
		return null;
	}

	try {
		const response = await getClient().chat.completions.create({
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
				const response = await getClient().chat.completions.create({
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

	// Check platform links first - most reliable signal
	const indicators = data.indicators || [];
	const reason = data.reason || "";
	const allText = [...indicators, reason].join(" ").toLowerCase();
	const platformLinks = data.platform_links || [];

	// If vision found actual monetization platform links, trust it
	const hasMonetizationLink = platformLinks.some((link) =>
		/patreon|ko-fi|buymeacoffee|linktr\.ee|beacons\.ai|stan\.store|fanhouse/i.test(link),
	);

	if (hasMonetizationLink) {
		data.isCreator = true;
		data.confidence = 100;
		return [true, data];
	}

	// DISQUALIFIERS: Regular influencer signals = NOT influencer
	const disqualifiers = [
		"amazon storefront",
		"amazon store",
		"depop shop",
		"depop",
		"poshmark",
		"etsy shop",
		"pinterest",
		"tiktok",
		"youtube",
		"spotify",
		"brand code",
		"discount code",
		"shop edikted",
		"use code",
		"shopping links only",
		"social media only",
		"regular influencer",
		"fashion influencer",
		"not an influencer",
	];

	for (const disqualifier of disqualifiers) {
		if (allText.includes(disqualifier)) {
			data.isCreator = false;
			data.confidence = 0;
			return [false, data];
		}
	}

	// DEFINITIVE SIGNALS: Monetization platform names
	const definitiveSignals = [
		{ text: "patreon", label: "PATREON" },
		{ text: "ko-fi", label: "KO-FI" },
		{ text: "buy me a coffee", label: "BUY ME A COFFEE" },
		{ text: "link in bio", label: "LINK IN BIO" },
		{ text: "linktree", label: "LINKTREE" },
		{ text: "exclusive content", label: "EXCLUSIVE CONTENT" },
		{ text: "premium content", label: "PREMIUM CONTENT" },
		{ text: "subscribe", label: "SUBSCRIBE" },
		{ text: "support me", label: "SUPPORT" },
	];

	for (const signal of definitiveSignals) {
		if (allText.includes(signal.text)) {
			data.isCreator = true;
			data.confidence = 100;
			if (!indicators.some((i) => i.toLowerCase().includes(signal.text))) {
				indicators.push(`${signal.label} - definitive creator signal`);
				data.indicators = indicators;
			}
			return [true, data];
		}
	}

	// Trust the vision model's decision if it meets threshold
	// No more heuristic overrides - they cause false positives
	const isConfirmed = data.isCreator && data.confidence >= threshold;

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
		const response = await getClient().chat.completions.create({
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
				const response = await getClient().chat.completions.create({
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
					console.error(
						`  Fallback bio validation vision failed: ${fallbackError}`,
					);
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
	try {
		const imageBuffer = readFileSync(imagePath);
		const base64 = imageBuffer.toString("base64");
		const response = await getClient().chat.completions.create({
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
		// If file read failed or other non-API error, return null early
		if (!(error instanceof Error) || !error.message) {
			return null;
		}

		// If rate limited, try fallback model
		if (isRateLimitError(error)) {
			if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
				console.log(
					`[VISION] Free tier rate limited, falling back to paid model: ${VISION_MODEL_FALLBACK}`,
				);
			}

			try {
				const imageBuffer = readFileSync(imagePath);
				const base64 = imageBuffer.toString("base64");

				const response = await getClient().chat.completions.create({
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
