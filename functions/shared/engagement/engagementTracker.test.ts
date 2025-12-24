import { EngagementTracker } from "./engagementTracker.ts";

describe("engagementTracker", () => {
	it("tracks engagement and outbound counts", () => {
		const t = new EngagementTracker(3, 4);
		t.recordEngagement("scroll");
		t.recordEngagement("like");
		t.recordOutbound("follow");
		const stats = t.getStats();
		expect(stats.totalEngagement).toBe(2);
		expect(stats.totalOutbound).toBe(1);
	});

	it("requires engagement before outbound", () => {
		const t = new EngagementTracker(3, 4);
		expect(t.canPerformOutbound()).toBe(false);
		t.recordEngagement("scroll");
		t.recordEngagement("scroll");
		t.recordEngagement("scroll");
		expect(t.canPerformOutbound()).toBe(true);
	});
});
