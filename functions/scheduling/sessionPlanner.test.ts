/**
 * Unit tests for sessionPlanner.ts
 * Tests fuzzy session planning logic
 */
import { jest } from "@jest/globals";

// Mock logger
jest.unstable_mockModule("../shared/logger/logger.ts", () => ({
	createLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

// Import after mocking
const {
	planDailySessions,
	recalculateSessions,
	getDailyVariance,
	getSessionTime,
	logSessionPlan,
} = await import("./sessionPlanner.ts");

describe("sessionPlanner", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("getDailyVariance", () => {
		it("should return variance within expected ranges", () => {
			const variance = getDailyVariance();

			expect(variance.energyLevel).toBeGreaterThanOrEqual(0.7);
			expect(variance.energyLevel).toBeLessThanOrEqual(1.3);
			expect(variance.hitRate).toBeGreaterThanOrEqual(0.12);
			expect(variance.hitRate).toBeLessThanOrEqual(0.18);
			expect(typeof variance.hasInterruption).toBe("boolean");
		});

		it("should have higher minimum energy on weekends", () => {
			// Mock Date to return a Saturday (day 6)
			const originalGetDay = Date.prototype.getDay;
			jest.spyOn(Date.prototype, "getDay").mockReturnValue(6);

			const variance = getDailyVariance();

			// Weekend energy: 1.0-1.3 (higher minimum than weekday 0.7-1.1)
			expect(variance.energyLevel).toBeGreaterThanOrEqual(1.0);
			expect(variance.energyLevel).toBeLessThanOrEqual(1.3);
		});

		it("should vary on weekdays", () => {
			// Mock Date to return a Monday (day 1)
			jest.spyOn(Date.prototype, "getDay").mockReturnValue(1);

			const variance = getDailyVariance();

			// Weekday energy: 0.7-1.1 (lower and more variable)
			expect(variance.energyLevel).toBeGreaterThanOrEqual(0.7);
			expect(variance.energyLevel).toBeLessThanOrEqual(1.1);
		});
	});

	describe("planDailySessions", () => {
		it("should create 3 session plans", () => {
			const plans = planDailySessions(50, 0);

			expect(plans).toHaveLength(3);
			expect(plans[0].sessionNumber).toBe(1);
			expect(plans[0].type).toBe("morning");
			expect(plans[1].sessionNumber).toBe(2);
			expect(plans[1].type).toBe("afternoon");
			expect(plans[2].sessionNumber).toBe(3);
			expect(plans[2].type).toBe("evening");
		});

		it("should distribute DMs to match daily goal", () => {
			const dailyGoal = 50;
			const plans = planDailySessions(dailyGoal, 0);

			const totalTarget = plans.reduce((sum, p) => sum + p.targetDMs, 0);

			expect(totalTarget).toBe(dailyGoal);
		});

		it("should have variable weights (not all equal)", () => {
			const plans = planDailySessions(50, 0);

			// Weights should sum to ~1.0
			const totalWeight = plans.reduce((sum, p) => sum + p.weight, 0);
			expect(totalWeight).toBeCloseTo(1.0, 2);

			// Weights should not all be exactly equal (1/3)
			const weights = plans.map((p) => p.weight);
			const allEqual = weights.every((w) => Math.abs(w - 1 / 3) < 0.01);
			expect(allEqual).toBe(false);
		});

		it("should have acceptable ranges around targets", () => {
			const plans = planDailySessions(50, 0);

			plans.forEach((plan) => {
				expect(plan.minAcceptable).toBeLessThanOrEqual(plan.targetDMs);
				expect(plan.maxAcceptable).toBeGreaterThanOrEqual(plan.targetDMs);
				expect(plan.estimatedDuration).toBeGreaterThan(0);
				expect(plan.weight).toBeGreaterThan(0);
				expect(plan.weight).toBeLessThanOrEqual(1);
			});
		});

		it("should account for DMs already sent", () => {
			const plans = planDailySessions(50, 20);

			const totalTarget = plans.reduce((sum, p) => sum + p.targetDMs, 0);

			// Should only plan for remaining 30 DMs
			expect(totalTarget).toBe(30);
		});

		it("should handle edge case of 0 DMs remaining", () => {
			const plans = planDailySessions(50, 50);

			const totalTarget = plans.reduce((sum, p) => sum + p.targetDMs, 0);

			expect(totalTarget).toBe(0);
		});

		it("should create different plans on multiple calls (variance)", () => {
			const plans1 = planDailySessions(50, 0);
			const plans2 = planDailySessions(50, 0);

			// Plans should be different due to randomization
			const targets1 = plans1.map((p) => p.targetDMs);
			const targets2 = plans2.map((p) => p.targetDMs);

			// At least one target should be different
			const allSame = targets1.every((t, i) => t === targets2[i]);
			expect(allSame).toBe(false);
		});
	});

	describe("recalculateSessions", () => {
		it("should return all 3 sessions if none completed", () => {
			const plans = recalculateSessions(50, 0, 0);

			expect(plans).toHaveLength(3);
			expect(plans[0].type).toBe("morning");
			expect(plans[1].type).toBe("afternoon");
			expect(plans[2].type).toBe("evening");
		});

		it("should return 2 sessions if morning completed", () => {
			const plans = recalculateSessions(50, 10, 1);

			expect(plans).toHaveLength(2);
			expect(plans[0].type).toBe("afternoon");
			expect(plans[1].type).toBe("evening");

			// Should redistribute remaining 40 DMs
			const totalTarget = plans.reduce((sum, p) => sum + p.targetDMs, 0);
			expect(totalTarget).toBe(40);
		});

		it("should return 1 session if afternoon also completed", () => {
			const plans = recalculateSessions(50, 35, 2);

			expect(plans).toHaveLength(1);
			expect(plans[0].type).toBe("evening");
			expect(plans[0].targetDMs).toBe(15); // Remaining
		});

		it("should return empty array if all sessions done", () => {
			const plans = recalculateSessions(50, 50, 3);

			expect(plans).toHaveLength(0);
		});

		it("should handle over-achievement (more DMs than goal)", () => {
			const plans = recalculateSessions(50, 55, 2);

			// No more DMs needed
			expect(plans).toHaveLength(1);
			expect(plans[0].targetDMs).toBeLessThanOrEqual(0);
		});
	});

	describe("getSessionTime", () => {
		it("should return valid time string for morning", () => {
			const time = getSessionTime("morning");

			// Should be HH:MM format
			expect(time).toMatch(/^\d{2}:\d{2}$/);

			// Should be morning time (7-9 AM)
			const hour = Number.parseInt(time.split(":")[0]);
			expect(hour).toBeGreaterThanOrEqual(7);
			expect(hour).toBeLessThanOrEqual(9);
		});

		it("should return valid time string for afternoon", () => {
			const time = getSessionTime("afternoon");

			expect(time).toMatch(/^\d{2}:\d{2}$/);

			// Should be afternoon time (2-4 PM)
			const hour = Number.parseInt(time.split(":")[0]);
			expect(hour).toBeGreaterThanOrEqual(14);
			expect(hour).toBeLessThanOrEqual(16);
		});

		it("should return valid time string for evening", () => {
			const time = getSessionTime("evening");

			expect(time).toMatch(/^\d{2}:\d{2}$/);

			// Should be evening time (7-9 PM)
			const hour = Number.parseInt(time.split(":")[0]);
			expect(hour).toBeGreaterThanOrEqual(19);
			expect(hour).toBeLessThanOrEqual(21);
		});

		it("should return varied times on multiple calls", () => {
			const times = new Set();
			for (let i = 0; i < 20; i++) {
				times.add(getSessionTime("morning"));
			}

			// Should have multiple different times (randomized)
			expect(times.size).toBeGreaterThan(1);
		});
	});

	describe("logSessionPlan", () => {
		it("should not throw when logging a plan", () => {
			const plan = {
				sessionNumber: 1,
				type: "morning" as const,
				targetDMs: 10,
				minAcceptable: 7,
				maxAcceptable: 14,
				estimatedDuration: 20,
				weight: 0.2,
			};

			expect(() => logSessionPlan(plan)).not.toThrow();
		});
	});
});
