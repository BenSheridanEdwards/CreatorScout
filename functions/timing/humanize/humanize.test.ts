import { jest } from "@jest/globals";

const sleepFn = jest.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
jest.unstable_mockModule("../sleep/sleep.ts", () => ({
	sleep: sleepFn,
}));

const { delay, getDelay, getTimeout, humanScroll, mouseWiggle, rnd } =
	await import("./humanize.ts");

describe("humanize", () => {
	beforeEach(() => {
		sleepFn.mockClear();
	});

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
			await expect(delay("after_navigate")).resolves.not.toThrow();
		});
	});

	describe("rnd", () => {
		test("uses scaled bounds and calls sleep once", async () => {
			const originalRandom = Math.random;
			try {
				Math.random = () => 0; // determinism -> picks lower bound

				await rnd(1, 2);

				expect(sleepFn).toHaveBeenCalledTimes(1);
				const ms = sleepFn.mock.calls[0]?.[0] as number | undefined;
				expect(ms).toBeDefined();
				expect(ms as number).toBeGreaterThanOrEqual(1000); // lower bound (1s) scaled
			} finally {
				Math.random = originalRandom;
			}
		});
	});

	describe("humanScroll", () => {
		test("scrolls default times and calls delay between", async () => {
			const page = {
				evaluate: jest.fn<any>().mockResolvedValue(undefined),
			} as unknown as import("puppeteer").Page;
			const originalRandom = Math.random;
			try {
				Math.random = () => 0; // determinism: times = 3, scroll distance = min

				await humanScroll(page);

				expect(page.evaluate).toHaveBeenCalledTimes(3);
				expect(sleepFn).toHaveBeenCalled();
			} finally {
				Math.random = originalRandom;
			}
		});
	});

	describe("mouseWiggle", () => {
		test("moves mouse with step count", async () => {
			const page = {
				mouse: {
					move: jest.fn<any>().mockResolvedValue(undefined),
				},
			} as unknown as import("puppeteer").Page;
			const originalRandom = Math.random;
			try {
				Math.random = () => 0; // determinism -> min values and steps

				await mouseWiggle(page);

				expect(page.mouse.move).toHaveBeenCalledWith(
					expect.any(Number),
					expect.any(Number),
					expect.objectContaining({ steps: expect.any(Number) }),
				);
			} finally {
				Math.random = originalRandom;
			}
		});
	});
});
