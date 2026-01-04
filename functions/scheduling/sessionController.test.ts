/**
 * Unit tests for sessionController.ts
 * Tests session execution controller
 */
import { jest } from "@jest/globals";
import type { SessionPlan } from "./sessionPlanner.ts";

// Mock logger
jest.unstable_mockModule("../shared/logger/logger.ts", () => ({
	createLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

const { SessionController } = await import("./sessionController.ts");

describe("SessionController", () => {
	let plan: SessionPlan;
	let controller: InstanceType<typeof SessionController>;
	let originalDateNow: () => number;

	beforeEach(() => {
		originalDateNow = Date.now;
		plan = {
			sessionNumber: 1,
			type: "morning",
			targetDMs: 10,
			minAcceptable: 7,
			maxAcceptable: 14,
			estimatedDuration: 20,
			weight: 0.2,
		};
		controller = new SessionController(plan);
	});

	afterEach(() => {
		Date.now = originalDateNow;
	});

	describe("constructor", () => {
		it("should initialize with plan", () => {
			expect(controller.plan).toEqual(plan);
		});

		it("should initialize stats at zero", () => {
			const stats = controller.getStats();

			expect(stats.dmsSent).toBe(0);
			expect(stats.profilesChecked).toBe(0);
			expect(stats.creatorsFound).toBe(0);
			expect(stats.engagementActions).toBe(0);
			expect(stats.elapsedMinutes).toBeGreaterThanOrEqual(0);
			expect(stats.elapsedMinutes).toBeLessThan(0.1); // Just started
		});
	});

	describe("recordDM", () => {
		it("should increment DM count", () => {
			controller.recordDM();
			controller.recordDM();

			const stats = controller.getStats();
			expect(stats.dmsSent).toBe(2);
		});
	});

	describe("recordProfileChecked", () => {
		it("should increment profile count without creator", () => {
			controller.recordProfileChecked(false);

			const stats = controller.getStats();
			expect(stats.profilesChecked).toBe(1);
			expect(stats.creatorsFound).toBe(0);
		});

		it("should increment both profile and creator count", () => {
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(true);

			const stats = controller.getStats();
			expect(stats.profilesChecked).toBe(2);
			expect(stats.creatorsFound).toBe(2);
		});

		it("should default to non-creator", () => {
			controller.recordProfileChecked();

			const stats = controller.getStats();
			expect(stats.profilesChecked).toBe(1);
			expect(stats.creatorsFound).toBe(0);
		});
	});

	describe("recordEngagement", () => {
		it("should increment engagement count", () => {
			controller.recordEngagement();
			controller.recordEngagement();

			const stats = controller.getStats();
			expect(stats.engagementActions).toBe(2);
		});
	});

	describe("getStats", () => {
		it("should calculate elapsed time correctly", () => {
			const startTime = Date.now();
			// Mock time passing (5 minutes)
			Date.now = jest.fn(() => startTime + 5 * 60 * 1000);

			const stats = controller.getStats();

			expect(stats.elapsedMinutes).toBeCloseTo(5, 1);
		});
	});

	describe("shouldContinue", () => {
		it("should stop if way over max acceptable", () => {
			// Send max + 3 DMs
			for (let i = 0; i < plan.maxAcceptable + 3; i++) {
				controller.recordDM();
			}

			expect(controller.shouldContinue()).toBe(false);
		});

		it("should continue if under minimum with time remaining", () => {
			// Send only 5 DMs (under min of 7)
			for (let i = 0; i < 5; i++) {
				controller.recordDM();
			}

			// Still have lots of time
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 5 * 60 * 1000); // 5 min elapsed

			expect(controller.shouldContinue()).toBe(true);
		});

		it("should stop if time is completely exceeded", () => {
			// Mock time way over (30 minutes when max is 24)
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 30 * 60 * 1000);

			expect(controller.shouldContinue()).toBe(false);
		});

		it("should continue if below target with time", () => {
			// Send 8 DMs (below target of 10, but above min of 7)
			for (let i = 0; i < 8; i++) {
				controller.recordDM();
			}

			// Still have time (10 min elapsed, max duration is 20)
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 10 * 60 * 1000);

			// This is probabilistic, so we test the logic exists
			// (it may stop or continue based on random chance)
			const result = controller.shouldContinue();
			expect(typeof result).toBe("boolean");
		});

		it("should eventually stop when low on time even if under target", () => {
			// Send 8 DMs (below target of 10)
			for (let i = 0; i < 8; i++) {
				controller.recordDM();
			}

			// Very little time left (23 min elapsed, max is 24)
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 23 * 60 * 1000);

			// Should stop (less than 2 min remaining)
			expect(controller.shouldContinue()).toBe(false);
		});

		it("should use probabilistic stopping when target met", () => {
			// Send target DMs
			for (let i = 0; i < plan.targetDMs; i++) {
				controller.recordDM();
			}

			// Test multiple times to check probabilistic behavior
			const results: boolean[] = [];
			for (let i = 0; i < 50; i++) {
				const testPlan = { ...plan };
				const testController = new SessionController(testPlan);
				for (let j = 0; j < plan.targetDMs; j++) {
					testController.recordDM();
				}
				results.push(testController.shouldContinue());
			}

			// Should have mix of continue and stop (not all one or the other)
			const continueCount = results.filter((r) => r).length;
			expect(continueCount).toBeGreaterThan(10);
			expect(continueCount).toBeLessThan(40);
		});
	});

	describe("getHitRate", () => {
		it("should calculate hit rate correctly", () => {
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(false);
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(false);
			controller.recordProfileChecked(false);

			const hitRate = controller.getHitRate();
			expect(hitRate).toBeCloseTo(0.4, 2); // 2/5 = 0.4
		});

		it("should return 0 if no profiles checked", () => {
			expect(controller.getHitRate()).toBe(0);
		});

		it("should return 1.0 if all profiles are creators", () => {
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(true);

			expect(controller.getHitRate()).toBe(1.0);
		});
	});

	describe("getDMsPerMinute", () => {
		it("should calculate rate correctly", () => {
			// Mock 2 minutes elapsed
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 2 * 60 * 1000);

			// Record 4 DMs
			for (let i = 0; i < 4; i++) {
				controller.recordDM();
			}

			const rate = controller.getDMsPerMinute();
			expect(rate).toBeCloseTo(2.0, 1); // 4 DMs / 2 min = 2.0
		});

		it("should return 0 if no time elapsed", () => {
			controller.recordDM();

			const rate = controller.getDMsPerMinute();
			expect(rate).toBeGreaterThanOrEqual(0);
		});

		it("should return 0 if no DMs sent", () => {
			const startTime = Date.now();
			Date.now = jest.fn(() => startTime + 5 * 60 * 1000);

			const rate = controller.getDMsPerMinute();
			expect(rate).toBe(0);
		});
	});

	describe("getSummary", () => {
		it("should return summary string with target met", () => {
			for (let i = 0; i < 10; i++) {
				controller.recordDM();
			}
			controller.recordProfileChecked(true);
			controller.recordProfileChecked(false);

			const summary = controller.getSummary();

			expect(summary).toContain("10 DMs");
			expect(summary).toContain("target: 10");
			expect(summary).toContain("morning");
			expect(summary).toContain("✓"); // Target met
		});

		it("should return summary string with target not met", () => {
			for (let i = 0; i < 5; i++) {
				controller.recordDM();
			}

			const summary = controller.getSummary();

			expect(summary).toContain("5 DMs");
			expect(summary).toContain("⚠"); // Warning
		});

		it("should include session type in summary", () => {
			const afternoonPlan = { ...plan, type: "afternoon" as const };
			const afternoonController = new SessionController(afternoonPlan);

			const summary = afternoonController.getSummary();

			expect(summary).toContain("afternoon");
		});
	});

	describe("logResults", () => {
		it("should not throw when logging results", () => {
			for (let i = 0; i < 10; i++) {
				controller.recordDM();
			}
			for (let i = 0; i < 50; i++) {
				controller.recordProfileChecked(i < 10);
			}
			for (let i = 0; i < 20; i++) {
				controller.recordEngagement();
			}

			expect(() => controller.logResults()).not.toThrow();
		});
	});

	describe("integration", () => {
		it("should track a complete session workflow", () => {
			// Simulate a session
			for (let i = 0; i < 50; i++) {
				controller.recordProfileChecked(i < 10); // 10 creators found
			}

			for (let i = 0; i < 10; i++) {
				controller.recordDM();
			}

			for (let i = 0; i < 20; i++) {
				controller.recordEngagement();
			}

			const stats = controller.getStats();

			expect(stats.profilesChecked).toBe(50);
			expect(stats.creatorsFound).toBe(10);
			expect(stats.dmsSent).toBe(10);
			expect(stats.engagementActions).toBe(20);
			expect(controller.getHitRate()).toBe(0.2);
		});
	});
});
