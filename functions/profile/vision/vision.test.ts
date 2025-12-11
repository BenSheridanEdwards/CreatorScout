import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { analyzeLinktree, isConfirmedCreator } from "./vision.ts";

// IMPORTANT: These tests are designed to NOT make API calls and cost money.
// They test error handling by using non-existent files, which fail at the
// file reading step before any API calls are made.

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

	afterAll(() => {
		// Clean up test image
		try {
			unlinkSync(mockImagePath);
		} catch {
			// Ignore if already deleted
		}
	});

	describe("analyzeLinktree", () => {
		test("returns null for non-existent file (no API call made)", async () => {
			// This test uses a non-existent file, so readFileSync will throw
			// before any API call is made - safe and free!
			const result = await analyzeLinktree("/nonexistent/image.png");
			expect(result).toBeNull();
		});

		test("handles empty path gracefully (no API call made)", async () => {
			// Empty path will fail at file reading, no API call
			const result = await analyzeLinktree("");
			expect(result).toBeNull();
		});

		test("fails at file read step before API call", () => {
			// Verify that non-existent files fail at readFileSync, not API call
			expect(() => {
				readFileSync("/nonexistent/image.png");
			}).toThrow();
		});
	});

	describe("isConfirmedCreator", () => {
		test("returns false for null analysis (no API call made)", async () => {
			// Non-existent file fails at readFileSync, no API call
			const [isConfirmed, data] = await isConfirmedCreator(
				"/nonexistent.png",
				70,
			);
			expect(isConfirmed).toBe(false);
			expect(data).toBeNull();
		});

		test("returns correct tuple structure (no API call made)", async () => {
			// Non-existent file fails at readFileSync, no API call
			const result = await isConfirmedCreator("/nonexistent.png", 70);
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(2);
			expect(typeof result[0]).toBe("boolean");
		});
	});
});
