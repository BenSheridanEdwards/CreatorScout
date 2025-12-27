import { jest } from "@jest/globals";

const createMockPrisma = () => ({
	profileSession: {
		create: jest.fn().mockResolvedValue({ sessionId: "s1" }),
		updateMany: jest.fn().mockResolvedValue({ count: 1 }),
		count: jest.fn().mockResolvedValue(0),
		findMany: jest.fn().mockResolvedValue([{ durationMinutes: 10 }]),
	},
});

jest.unstable_mockModule("../shared/database/database.ts", () => ({
	getPrismaClient: () => createMockPrisma(),
}));

jest.unstable_mockModule("../shared/logger/logger.ts", () => ({
	createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule("../shared/config/config.ts", () => ({
	SESSION_DURATION_MIN: 15,
	SESSION_DURATION_MAX: 20,
	SESSIONS_PER_DAY: 3,
	SESSION_STAGGER_MINUTES: 5,
	TOTAL_SESSION_TIME_PER_DAY: 45,
	DEBUG_SCREENSHOTS: false,
}));

const { SessionScheduler, getSessionWindow } = await import("./scheduler.ts");

describe("scheduler", () => {
	it("staggerProfiles returns increasing start times", () => {
		const s = new SessionScheduler();
		const start = new Date("2025-01-01T09:00:00Z");
		const map = s.staggerProfiles(["a", "b", "c"], start, 5);
		expect(map.get("a")!.getTime()).toBe(start.getTime());
		expect(map.get("b")!.getTime()).toBe(start.getTime() + 5 * 60 * 1000);
	});

	it("scheduleSession creates a session record", async () => {
		const s = new SessionScheduler();
		const id = await s.scheduleSession("p1", 15);
		expect(id).toBe("s1");
	});

	it("getSessionWindow returns correct ranges", () => {
		expect(getSessionWindow("morning")).toEqual({ start: 9, end: 10 });
	});
});


