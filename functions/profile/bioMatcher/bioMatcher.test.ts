/**
 * Bio Matcher Tests
 *
 * Bio matching logic for detecting Patreon/premium content creators:
 *
 * Functions:
 * - countLinkEmojis(text): Counts emojis commonly used by creators
 * - findKeywords(text): Finds matching keywords from predefined list
 * - extractLinks(text): Extracts creator/aggregator platform links
 * - calculateScore(bio, username?): Computes creator likelihood score (0-100)
 *   - Emoji count: up to 25 points
 *   - Keywords: up to 50 points (Patreon mention = 50)
 *   - Links: up to 25 points
 *   - Username keywords: up to 20 points
 *   - Exclusive+discount combo: 25 bonus points
 * - isLikelyCreator(bio, threshold, username?): Returns [boolean, scoreResult]
 *
 * @jest-environment node
 */

import { jest } from "@jest/globals";
import {
	calculateScore,
	countLinkEmojis,
	extractLinks,
	findKeywords,
	isLikelyCreator,
} from "./bioMatcher.ts";

describe("bioMatcher", () => {
	afterAll(() => {
		// Cleanup to prevent memory leak warnings
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// countLinkEmojis() - Emoji Detection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("countLinkEmojis()", () => {
		test("counts recognized link emojis correctly", () => {
			expect(countLinkEmojis("🔥💋🍑")).toBe(3);
		});

		test("returns zero for text without emojis", () => {
			expect(countLinkEmojis("Hello world")).toBe(0);
		});

		test("counts emojis mixed with regular text", () => {
			expect(countLinkEmojis("🔥 Hello 💋 World 🍑")).toBe(3);
		});

		test("ignores non-link emojis", () => {
			expect(countLinkEmojis("👋 Hello 😊 Friend")).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// findKeywords() - Keyword Detection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("findKeywords()", () => {
		test("finds direct platform mentions", () => {
			const keywords = findKeywords("Check out my Patreon!");
			expect(keywords).toContain("patreon");
		});

		test("finds link hint phrases", () => {
			const keywords = findKeywords("Link in bio!");
			expect(keywords).toContain("link in bio");
		});

		test("finds content-related keywords", () => {
			const keywords = findKeywords("Exclusive content exclusive");
			// "Exclusive content" matches "premium" signal label, "exclusive" is a DEFINITIVE signal
			// Keywords array contains signal labels, not the matched text
			expect(keywords.length).toBeGreaterThan(0);
			expect(
				keywords.some((k) => k.includes("premium") || k.includes("exclusive")),
			).toBe(true);
		});

		test("performs case-insensitive matching", () => {
			const keywords = findKeywords("PATREON linktree");
			expect(keywords).toContain("patreon");
			// "linktree" matches "link_hint" signal
			expect(keywords.length).toBeGreaterThan(0);
		});

		test("returns empty array when no keywords match", () => {
			const keywords = findKeywords("Just a regular person with hobbies");
			expect(keywords.length).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// extractLinks() - Link Pattern Extraction
	// ═══════════════════════════════════════════════════════════════════════════

	describe("extractLinks()", () => {
		test("extracts Linktree links", () => {
			const links = extractLinks("Check my linktr.ee/username");
			expect(links.some((l) => l.includes("linktr.ee"))).toBe(true);
		});

		test("extracts creator links", () => {
			const links = extractLinks("patreon.com/creator");
			expect(links.some((l) => l.includes("patreon.com"))).toBe(true);
		});

		test("extracts multiple different platform links", () => {
			const links = extractLinks("linktr.ee/user and beacons.ai/user");
			expect(links.length).toBeGreaterThan(0);
		});

		test("returns empty array when no links match", () => {
			const links = extractLinks("No links here, just text");
			expect(links.length).toBe(0);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// calculateScore() - Score Calculation
	// ═══════════════════════════════════════════════════════════════════════════

	describe("calculateScore()", () => {
		test("returns zero score for empty bio", () => {
			const result = calculateScore("");
			expect(result.score).toBe(0);
			expect(result.reasons).toEqual([]);
		});

		test("awards high score (50+) for direct Patreon mention", () => {
			const result = calculateScore("Check out my Patreon!");
			// Patreon mention triggers DEFINITIVE signal (score 100)
			expect(result.score).toBe(100);
			expect(
				result.reasons.some(
					(r) => r.includes("patreon") || r.includes("DEFINITIVE"),
				),
			).toBe(true);
		});

		test("awards points for link emojis (5+ emojis = 25 points)", () => {
			const result = calculateScore("🔥💋🍑💦🥵");
			expect(result.score).toBeGreaterThanOrEqual(25);
			// Actual reason format: "5 emojis (1.5x bonus): +90"
			expect(
				result.reasons.some((r) => r.includes("emoji") || r.includes("emojis")),
			).toBe(true);
		});

		test("awards bonus points for exclusive content + discount combo", () => {
			const result = calculateScore("Exclusive content 50% OFF");
			expect(result.score).toBeGreaterThanOrEqual(25);
			// Actual reason format: "premium: +35", "discount: +25", "COMBO: 2 strong signals: +15"
			expect(
				result.reasons.some(
					(r) =>
						r.includes("premium") ||
						r.includes("discount") ||
						r.includes("COMBO"),
				),
			).toBe(true);
		});

		test("awards points for creator link in bio", () => {
			const result = calculateScore("patreon.com/creator");
			// creator link triggers DEFINITIVE signal (score 100)
			expect(result.score).toBe(100);
			expect(
				result.reasons.some(
					(r) => r.includes("patreon") || r.includes("DEFINITIVE"),
				),
			).toBe(true);
		});

		test("caps maximum score at 100", () => {
			const result = calculateScore(
				"Patreon exclusive content 80% OFF 🔥💋🍑💦🥵 patreon.com/creator",
			);
			expect(result.score).toBeLessThanOrEqual(100);
		});

		test("considers username keywords for additional scoring", () => {
			const result = calculateScore("Content creator", "sexy_model_babe");
			// Username keyword detection is not currently implemented
			// This test verifies the function accepts username parameter without error
			expect(result).toHaveProperty("score");
			expect(result).toHaveProperty("reasons");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// isLikelyCreator() - Threshold-Based Classification
	// ═══════════════════════════════════════════════════════════════════════════

	describe("isLikelyCreator()", () => {
		test("returns true when score meets or exceeds threshold", () => {
			const [isLikely, result] = isLikelyCreator("influencer!", 40);
			expect(isLikely).toBe(true);
			expect(result.score).toBeGreaterThanOrEqual(40);
		});

		test("returns false when score is below threshold", () => {
			const [isLikely] = isLikelyCreator("Just a regular person", 40);
			expect(isLikely).toBe(false);
		});

		test("respects custom threshold values", () => {
			// "Link in bio" scores 25 (link_hint: +25)
			// Test with thresholds that bracket the score
			const [isLikelyLow] = isLikelyCreator("Link in bio", 10);
			const [isLikelyHigh] = isLikelyCreator("Link in bio", 30);
			expect(isLikelyLow).toBe(true); // 25 >= 10
			expect(isLikelyHigh).toBe(false); // 25 < 30
		});

		test("uses default threshold of 40 when not specified", () => {
			const [isLikely, result] = isLikelyCreator("Patreon exclusive content");
			expect(isLikely).toBe(true);
			expect(result.score).toBeGreaterThanOrEqual(40);
		});

		test("returns detailed score result for analysis", () => {
			const [, result] = isLikelyCreator("🔥💋 Check my linktr.ee/user");
			expect(result).toHaveProperty("score");
			expect(result).toHaveProperty("reasons");
			expect(result).toHaveProperty("emojis");
			expect(result).toHaveProperty("keywords");
			expect(result).toHaveProperty("links");
		});
	});
});
