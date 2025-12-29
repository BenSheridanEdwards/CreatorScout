import {
	calculateRampUpLimits,
	getBurnerLimits,
	getDefaultLimits,
} from "./actionLimits.ts";

describe("actionLimits", () => {
	it("returns main defaults", () => {
		const limits = getDefaultLimits("main", 0);
		expect(limits.dmsPerDay).toBeGreaterThan(0);
	});

	it("applies new burner multiplier for first 7 days", () => {
		const limits = getBurnerLimits(3);
		expect(limits.dmsPerDay).toBeLessThan(50);
	});

	it("ramps up DMs for aged burners", () => {
		const limits7 = getBurnerLimits(7);
		const limits16 = getBurnerLimits(16);
		expect(limits16.dmsPerDay).toBeGreaterThanOrEqual(limits7.dmsPerDay);
	});

	it("calculateRampUpLimits increases every 3 days after new-burner period", () => {
		const base = 30;
		expect(calculateRampUpLimits(7, base)).toBeGreaterThanOrEqual(base);
		expect(calculateRampUpLimits(10, base)).toBeGreaterThanOrEqual(base);
	});
});



