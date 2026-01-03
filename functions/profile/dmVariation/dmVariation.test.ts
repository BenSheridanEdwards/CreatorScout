import { describe, expect, test } from "@jest/globals";
import {
	generateDM,
	generateDMBatch,
	generateFullPitchDM,
	generateMediumDM,
	generateShortDM,
	getDMStats,
} from "./dmVariation.ts";

describe("DM Variation System", () => {
	describe("generateShortDM", () => {
		test("generates a valid short DM", () => {
			const dm = generateShortDM();
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
			expect(dm.length).toBeGreaterThan(10);
			expect(dm.length).toBeLessThan(300);
		});

		test("generates unique DMs", () => {
			const dms = new Set<string>();
			for (let i = 0; i < 20; i++) {
				dms.add(generateShortDM());
			}
			// Should have at least 15 unique messages out of 20
			expect(dms.size).toBeGreaterThanOrEqual(15);
		});
	});

	describe("generateMediumDM", () => {
		test("generates a valid medium DM", () => {
			const dm = generateMediumDM();
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
			expect(dm.length).toBeGreaterThan(20);
			expect(dm.length).toBeLessThan(400);
		});

		test("generates unique DMs", () => {
			const dms = new Set<string>();
			for (let i = 0; i < 20; i++) {
				dms.add(generateMediumDM());
			}
			// Should have at least 15 unique messages out of 20
			expect(dms.size).toBeGreaterThanOrEqual(15);
		});
	});

	describe("generateFullPitchDM", () => {
		test("generates a valid full pitch DM", () => {
			const dm = generateFullPitchDM();
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
			expect(dm.length).toBeGreaterThan(30);
			expect(dm.length).toBeLessThan(500);
		});

		test("generates unique DMs", () => {
			const dms = new Set<string>();
			for (let i = 0; i < 20; i++) {
				dms.add(generateFullPitchDM());
			}
			// Should have at least 15 unique messages out of 20
			expect(dms.size).toBeGreaterThanOrEqual(15);
		});
	});

	describe("generateDM", () => {
		test("generates cold DM by default", () => {
			const dm = generateDM();
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
		});

		test("generates warm DM when specified", () => {
			const dm = generateDM("warm");
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
		});

		test("generates pitch DM when specified", () => {
			const dm = generateDM("pitch");
			expect(dm).toBeTruthy();
			expect(typeof dm).toBe("string");
		});
	});

	describe("generateDMBatch", () => {
		test("generates requested number of DMs", () => {
			const batch = generateDMBatch(10);
			expect(batch).toHaveLength(10);
		});

		test("generates unique DMs in batch", () => {
			const batch = generateDMBatch(20);
			const uniqueDMs = new Set(batch);
			// All should be unique
			expect(uniqueDMs.size).toBe(20);
		});

		test("works with different strategies", () => {
			const coldBatch = generateDMBatch(5, "cold");
			const warmBatch = generateDMBatch(5, "warm");
			const pitchBatch = generateDMBatch(5, "pitch");

			expect(coldBatch).toHaveLength(5);
			expect(warmBatch).toHaveLength(5);
			expect(pitchBatch).toHaveLength(5);
		});
	});

	describe("getDMStats", () => {
		test("returns valid stats", () => {
			const stats = getDMStats();

			expect(stats.totalLines).toBeGreaterThan(150);
			expect(stats.openingLines).toBeGreaterThan(0);
			expect(stats.compliments).toBeGreaterThan(0);
			expect(stats.curiosityHooks).toBeGreaterThan(0);
			expect(stats.businessHints).toBeGreaterThan(0);
			expect(stats.softPitches).toBeGreaterThan(0);
			expect(stats.closers).toBeGreaterThan(0);
			expect(stats.emojis).toBeGreaterThan(0);
			expect(stats.wordVariations).toBeGreaterThan(0);
			expect(stats.possibleCombinations).toBeTruthy();
		});
	});

	describe("Message Quality", () => {
		test("messages start with capital letter", () => {
			const dm = generateShortDM();
			expect(dm[0]).toBe(dm[0].toUpperCase());
		});

		test("messages contain proper punctuation", () => {
			const dm = generateShortDM();
			// Should contain at least one punctuation mark
			expect(/[.!?]/.test(dm)).toBe(true);
		});

		test("messages are reasonable length for Instagram DM", () => {
			// Test 50 messages to ensure consistent length
			for (let i = 0; i < 50; i++) {
				const dm = generateDM();
				// Instagram DM limit is ~1000 chars, we keep it much shorter
				expect(dm.length).toBeLessThan(500);
				expect(dm.length).toBeGreaterThan(10);
			}
		});
	});
});


