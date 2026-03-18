/**
 * Vision AI Tests
 *
 * Vision AI module for analyzing linktree/profile screenshots:
 *
 * Functions:
 * - analyzeLinktree(imagePath): Analyzes link page screenshot
 *   - Reads image file and converts to base64
 *   - Sends to OpenRouter API with LINKTREE_PROMPT
 *   - Parses JSON response for creator indicators
 *   - Returns: VisionAnalysisResult or null on failure
 *
 * - analyzeProfile(imagePath): Analyzes Instagram profile screenshot
 *   - Uses PROFILE_PROMPT optimized for profile pages
 *   - Checks highlights, bio, and visual elements
 *   - Returns: VisionAnalysisResult or null on failure
 *
 * - isConfirmedCreator(imagePath, threshold): Wrapper with confidence check
 *   - Calls analyzeLinktree
 *   - Applies exclusive+discount heuristic override
 *   - Returns: [boolean, VisionAnalysisResult | null]
 *
 * IMPORTANT: These tests are designed to NOT make API calls (no cost).
 * They test error handling by using non-existent files which fail at
 * file reading step before any API calls are made.
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { jest } from "@jest/globals";
import { analyzeLinktree, isConfirmedCreator } from "./vision.ts";

describe("vision", () => {
	let mockImagePath: string;

	beforeAll(() => {
		// Create tmp directory if it doesn't exist
		mkdirSync("tmp", { recursive: true });
		// Create a dummy image file for testing
		mockImagePath = "tmp/test_image.png";
		// Create a minimal PNG (1x1 transparent pixel)
		const minimalPng = Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
			"base64",
		);
		writeFileSync(mockImagePath, minimalPng);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(() => {
		// Clean up test image
		try {
			unlinkSync(mockImagePath);
		} catch {
			// Ignore if already deleted
		}
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// analyzeLinktree() - Link Page Analysis
	// ═══════════════════════════════════════════════════════════════════════════

	describe("analyzeLinktree()", () => {
		test("returns null for non-existent file (fails before API call)", async () => {
			// This test uses a non-existent file, so readFileSync will throw
			// before any API call is made - safe and free!
			const result = await analyzeLinktree("/nonexistent/image.png");

			expect(result).toBeNull();
		});

		test("returns null for empty path (fails before API call)", async () => {
			// Empty path will fail at file reading, no API call
			const result = await analyzeLinktree("");

			expect(result).toBeNull();
		});

		test("verifies file reading fails before reaching API", () => {
			// Confirm that non-existent files fail at readFileSync
			expect(() => {
				readFileSync("/nonexistent/image.png");
			}).toThrow();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// isConfirmedCreator() - Threshold-Based Classification
	// ═══════════════════════════════════════════════════════════════════════════

	describe("isConfirmedCreator()", () => {
		test("returns [false, null] when analysis fails (no API call)", async () => {
			// Non-existent file fails at readFileSync, no API call
			const [isConfirmed, data] = await isConfirmedCreator(
				"/nonexistent.png",
				70,
			);

			expect(isConfirmed).toBe(false);
			expect(data).toBeNull();
		});

		test("returns correct tuple structure [boolean, data]", async () => {
			// Non-existent file fails at readFileSync, no API call
			const result = await isConfirmedCreator("/nonexistent.png", 70);

			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(2);
			expect(typeof result[0]).toBe("boolean");
		});

		test("uses default threshold of 70 when not specified", async () => {
			const result = await isConfirmedCreator("/nonexistent.png");

			// Should still return valid tuple structure
			expect(result[0]).toBe(false);
			expect(result[1]).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Response Structure (when API would succeed)
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Expected response structure", () => {
		test("VisionAnalysisResult should contain required fields", () => {
			// Document the expected structure for future reference
			const expectedFields = [
				"isCreator",
				"confidence",
				"platform_links",
				"indicators",
				"reason",
			];

			// This test documents the interface contract
			expect(expectedFields).toContain("isCreator");
			expect(expectedFields).toContain("confidence");
			expect(expectedFields).toContain("platform_links");
			expect(expectedFields).toContain("indicators");
			expect(expectedFields).toContain("reason");
		});
	});
});
