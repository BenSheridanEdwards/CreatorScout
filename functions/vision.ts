/**
 * Vision AI for analyzing linktree/link pages.
 */
import { readFileSync } from 'node:fs';
import { OpenAI } from 'openai';
import { OPENROUTER_API_KEY, VISION_MODEL } from './config.ts';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
});

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

export interface VisionAnalysisResult {
  is_adult_creator: boolean;
  confidence: number;
  platform_links: string[];
  indicators: string[];
  reason: string;
}

export async function analyzeLinktree(
  imagePath: string
): Promise<VisionAnalysisResult | null> {
  try {
    const imageBuffer = readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');

    const response = await client.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: LINKTREE_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.0,
    });

    let text = response.choices[0]?.message?.content || '';
    text = text
      .trim()
      .replace(/^```json/, '')
      .replace(/^```/, '')
      .replace(/```$/, '');

    return JSON.parse(text.trim()) as VisionAnalysisResult;
  } catch (e) {
    console.error(`  Vision analysis failed: ${e}`);
    return null;
  }
}

function _containsAny(text: string, patterns: string[]): boolean {
  const lt = text.toLowerCase();
  return patterns.some((p) => lt.includes(p.toLowerCase()));
}

function _hasExclusiveDiscountSignal(data: VisionAnalysisResult): boolean {
  const indicators = data.indicators || [];
  const reason = data.reason || '';
  const text = [...indicators, reason].join(' ').toLowerCase();

  const strong = _containsAny(text, [
    'exclusive content',
    'premium content',
    'vip access',
    'private content',
    'uncensored',
    'unfiltered',
    'nsfw',
    'exclusive',
  ]);

  const discount = _containsAny(text, [
    '% off',
    'discount',
    'sale',
    'limited offer',
  ]);

  return strong && discount;
}

export async function isConfirmedCreator(
  imagePath: string,
  threshold: number = 70
): Promise<[boolean, VisionAnalysisResult | null]> {
  const data = await analyzeLinktree(imagePath);
  if (!data) {
    return [false, null];
  }

  let isConfirmed = data.is_adult_creator && data.confidence >= threshold;

  // Heuristic override: Exclusive content + discount language
  if (!isConfirmed && _hasExclusiveDiscountSignal(data)) {
    data.is_adult_creator = true;
    data.confidence = Math.max(data.confidence, threshold);
    const indicators = data.indicators || [];
    if (
      !indicators.some((i) => i.toLowerCase().includes('exclusive+discount'))
    ) {
      indicators.push('exclusive+discount offer');
      data.indicators = indicators;
    }
    isConfirmed = true;
  }

  return [isConfirmed, data];
}
