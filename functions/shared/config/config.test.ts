import { jest } from "@jest/globals";

// Prevent tests from being affected by real .env values loaded via dotenv.
// We want to control process.env directly in each test case.
jest.unstable_mockModule("dotenv", () => ({
	default: {
		config: jest.fn(),
	},
}));

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
	jest.resetModules();
	process.env = { ...originalEnv };
});

afterEach(() => {
	process.env = originalEnv;
});

describe("Configuration", () => {
	describe("DELAY_SCALE", () => {
		test("returns 0.2 when FAST_MODE is true", async () => {
			// Ensure we ignore any real DELAY_SCALE from the environment so the
			// default logic (based on FAST_MODE) is exercised consistently.
			delete process.env.DELAY_SCALE;
			process.env.FAST_MODE = "true";
			const { DELAY_SCALE } = await import("./config.ts");
			expect(DELAY_SCALE).toBe(0.2);
		});

		test("returns 1.0 by default", async () => {
			delete process.env.DELAY_SCALE;
			delete process.env.FAST_MODE;
			const { DELAY_SCALE } = await import("./config.ts");
			expect(DELAY_SCALE).toBe(1.0);
		});

		test("returns custom DELAY_SCALE value", async () => {
			process.env.DELAY_SCALE = "1.5";
			const { DELAY_SCALE } = await import("./config.ts");
			expect(DELAY_SCALE).toBe(1.5);
		});
	});

	describe("DELAY_SCALES", () => {
		test("returns correct scale multipliers", async () => {
			const { DELAY_SCALES } = await import("./config.ts");
			expect(DELAY_SCALES.navigation).toBe(1.0);
			expect(DELAY_SCALES.input).toBe(1.0);
			expect(DELAY_SCALES.action).toBe(1.0);
		});

		test("respects custom scale environment variables", async () => {
			process.env.DELAY_SCALE_NAV = "1.5";
			process.env.DELAY_SCALE_INPUT = "0.8";
			const { DELAY_SCALES } = await import("./config.ts");
			expect(DELAY_SCALES.navigation).toBe(1.5);
			expect(DELAY_SCALES.input).toBe(0.8);
		});
	});

	describe("DELAYS", () => {
		test("provides optimized delay ranges", async () => {
			const { DELAYS } = await import("./config.ts");

			// Navigation should be faster than before
			expect(DELAYS.after_navigate).toEqual([1.5, 3.5]);
			expect(DELAYS.after_click).toEqual([0.2, 0.8]);

			// Instagram-specific actions should be appropriate
			expect(DELAYS.after_dm_send).toEqual([1.5, 3.5]);
			expect(DELAYS.after_follow).toEqual([0.8, 1.8]);
		});

		test("includes all required delay categories", async () => {
			const { DELAYS } = await import("./config.ts");
			const requiredKeys = [
				"after_navigate",
				"after_click",
				"after_dm_send",
				"after_follow",
				"between_profiles",
				"queue_empty",
			];

			requiredKeys.forEach((key) => {
				expect(DELAYS).toHaveProperty(key);
				expect(Array.isArray(DELAYS[key])).toBe(true);
				expect(DELAYS[key]).toHaveLength(2);
			});
		});
	});

	describe("TIMEOUT_SCALE", () => {
		test("returns 1.0 by default", async () => {
			const { TIMEOUT_SCALE } = await import("./config.ts");
			expect(TIMEOUT_SCALE).toBe(1.0);
		});

		test("returns custom TIMEOUT_SCALE value", async () => {
			process.env.TIMEOUT_SCALE = "0.8";
			const { TIMEOUT_SCALE } = await import("./config.ts");
			expect(TIMEOUT_SCALE).toBe(0.8);
		});
	});

	describe("TIMEOUTS", () => {
		test("provides optimized timeout values", async () => {
			const { TIMEOUTS } = await import("./config.ts");

			// Should be faster than conservative defaults
			expect(TIMEOUTS.page_load).toBe(25000); // Faster than 30s
			expect(TIMEOUTS.element_default).toBe(8000); // Faster than 10s
			expect(TIMEOUTS.login).toBe(12000); // Faster than 15s
		});

		test("includes all required timeout categories", async () => {
			const { TIMEOUTS } = await import("./config.ts");
			const requiredKeys = [
				"page_load",
				"navigation",
				"element_default",
				"element_modal",
				"login",
				"dm_send",
				"follow",
			];

			requiredKeys.forEach((key) => {
				expect(TIMEOUTS).toHaveProperty(key);
				expect(typeof TIMEOUTS[key]).toBe("number");
				expect(TIMEOUTS[key]).toBeGreaterThan(0);
			});
		});
	});

	describe("delay and timeout structure validation", () => {
		test("DELAYS contains all expected keys with valid ranges", async () => {
			const { DELAYS } = await import("./config.ts");

			const requiredDelayKeys = [
				"after_navigate",
				"after_click",
				"after_dm_send",
				"after_follow",
				"between_profiles",
				"queue_empty",
			];

			requiredDelayKeys.forEach((key) => {
				expect(DELAYS).toHaveProperty(key);
				expect(Array.isArray(DELAYS[key])).toBe(true);
				expect(DELAYS[key][0]).toBeLessThanOrEqual(DELAYS[key][1]);
			});
		});

		test("TIMEOUTS contains all expected keys with reasonable values", async () => {
			const { TIMEOUTS } = await import("./config.ts");

			const requiredTimeoutKeys = [
				"page_load",
				"navigation",
				"element_default",
				"element_modal",
				"login",
				"dm_send",
				"follow",
			];

			requiredTimeoutKeys.forEach((key) => {
				expect(TIMEOUTS).toHaveProperty(key);
				expect(typeof TIMEOUTS[key]).toBe("number");
				expect(TIMEOUTS[key]).toBeGreaterThan(1000); // At least 1 second
			});
		});

		test("optimized values are faster than conservative defaults", async () => {
			const { DELAYS, TIMEOUTS } = await import("./config.ts");

			// Delays should be faster than typical conservative values
			expect(DELAYS.after_navigate[1]).toBeLessThan(4.5); // Faster than 4.5s
			expect(DELAYS.after_click[1]).toBeLessThan(1.5); // Much faster clicks

			// Timeouts should be reasonable for modern web
			expect(TIMEOUTS.page_load).toBeLessThan(30000); // Faster than 30s
			expect(TIMEOUTS.element_default).toBeLessThan(10000); // Faster than 10s
		});
	});
});
