import { jest } from "@jest/globals";
import { delay, getDelay, getTimeout } from "./humanize.ts";

// Mock sleep to avoid actual delays in tests
jest.mock("../sleep/sleep.ts", () => ({
	sleep: jest.fn(() => Promise.resolve()),
}));

describe("humanize", () => {
	describe("getDelay", () => {
		test("returns scaled delay tuple", () => {
			const [min, max] = getDelay("after_navigate");
			expect(min).toBeGreaterThanOrEqual(0);
			expect(max).toBeGreaterThanOrEqual(min);
		});

		test("applies minimum floor", () => {
			const [min] = getDelay("after_navigate");
			expect(min).toBeGreaterThanOrEqual(0.05);
		});

		test("returns default for unknown delay", () => {
			const [min, max] = getDelay("unknown_delay");
			expect(min).toBeGreaterThanOrEqual(0.05);
			expect(max).toBeGreaterThanOrEqual(min);
		});
	});

	describe("getTimeout", () => {
		test("returns scaled timeout", () => {
			const timeout = getTimeout("element_default");
			expect(timeout).toBeGreaterThan(0);
			expect(typeof timeout).toBe("number");
		});

		test("returns default for unknown timeout", () => {
			const timeout = getTimeout("unknown_timeout");
			expect(timeout).toBeGreaterThan(0);
		});
	});

	describe("delay", () => {
		test("returns without error", async () => {
			// Just verify the function completes without error
			// Actual sleep is mocked to resolve immediately
			await expect(delay("after_navigate")).resolves.not.toThrow();
		});
	});
});
