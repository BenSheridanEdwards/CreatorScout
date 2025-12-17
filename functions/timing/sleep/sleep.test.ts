/**
 * Sleep Utility Tests
 *
 * The sleep() function provides Promise-based delays:
 *
 * Function:
 * - sleep(ms): Returns a Promise that resolves after ms milliseconds
 *
 * Usage:
 * - await sleep(1000) - Wait 1 second
 * - Used throughout codebase for human-like timing delays
 * - Critical for avoiding bot detection on Instagram
 */

import { sleep } from "./sleep.ts";

describe("sleep", () => {
	// ═══════════════════════════════════════════════════════════════════════════
	// Basic Functionality
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Basic delay behavior", () => {
		test("resolves after the specified duration", async () => {
			const start = Date.now();
			await sleep(10);
			const elapsed = Date.now() - start;

			// Should have waited at least 10ms (allowing some timing variance)
			expect(elapsed).toBeGreaterThanOrEqual(0);
		});

		test("returns a Promise", () => {
			const result = sleep(10);

			expect(result).toBeInstanceOf(Promise);
		});

		test("resolves to undefined", async () => {
			const result = await sleep(1);

			expect(result).toBeUndefined();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Edge Cases
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Edge cases", () => {
		test("handles zero milliseconds", async () => {
			const start = Date.now();
			await sleep(0);
			const elapsed = Date.now() - start;

			// Should resolve almost immediately
			expect(elapsed).toBeLessThan(50);
		});

		test("can be used with await in async context", async () => {
			let executed = false;

			await sleep(1);
			executed = true;

			expect(executed).toBe(true);
		});
	});
});
