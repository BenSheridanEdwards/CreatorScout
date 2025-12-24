import { CostTracker } from "./costTracker.ts";

describe("costTracker", () => {
	it("computes monthly costs with a given plan selection", () => {
		const t = new CostTracker();
		t.recordApiCall("vision", 0);
		const costs = t.getMonthlyCosts({
			gologinPlan: "professional",
			vpsPlan: "recommended",
			proxyPlan: "starter",
		});
		expect(costs.total).toBeGreaterThan(0);
	});

	it("produces scaling projection recommendations", () => {
		const t = new CostTracker();
		const proj = t.getScalingProjection(50);
		expect(proj.breakdown.total).toBeGreaterThan(0);
		expect(Array.isArray(proj.recommendations)).toBe(true);
	});
});


