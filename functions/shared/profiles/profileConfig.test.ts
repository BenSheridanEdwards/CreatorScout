import {
	calculateProfileAge,
	createProfileConfig,
	getRemainingActions,
	hasReachedLimit,
} from "./profileConfig.ts";

describe("profileConfig", () => {
	it("calculates profile age in days", () => {
		const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
		expect(calculateProfileAge(createdAt)).toBeGreaterThanOrEqual(2);
	});

	it("creates profile config with defaults and custom limits", () => {
		const p = createProfileConfig("id", "user", "pass", "main", "token", {
			dmsPerDay: 99,
		});
		expect(p.limits.dmsPerDay).toBe(99);
		expect(p.counters.dmsToday).toBe(0);
	});

	it("detects reached limits and remaining actions", () => {
		const p = createProfileConfig("id", "user", "pass", "main", "token", {
			followsPerDay: 2,
			dmsPerDay: 1,
			discoveriesPerDay: 3,
		});
		p.counters.followsToday = 2;
		expect(hasReachedLimit(p, "follow")).toBe(true);
		expect(getRemainingActions(p, "follow")).toBe(0);
	});
});




