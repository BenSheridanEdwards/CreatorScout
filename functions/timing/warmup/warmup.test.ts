import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

jest.unstable_mockModule("../../shared/logger/logger.ts", () => ({
	createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	WARMUP_DURATION_MINUTES: 1.5,
	DEBUG_SCREENSHOTS: false,
}));

jest.unstable_mockModule("../humanize/humanize.ts", () => ({
	microDelay: jest.fn().mockResolvedValue(undefined),
	shortDelay: jest.fn().mockResolvedValue(undefined),
	mediumDelay: jest.fn().mockResolvedValue(undefined),
	humanScroll: jest.fn().mockResolvedValue(undefined),
}));

const { warmUpProfile } = await import("./warmup.ts");

describe("warmup", () => {
	it("runs without throwing and returns stats", async () => {
		const page = {
			url: jest.fn(() => "https://www.instagram.com/"),
			goto: jest.fn().mockResolvedValue(null),
			$$: jest.fn().mockResolvedValue([]),
			$: jest.fn().mockResolvedValue(null),
			evaluate: jest.fn().mockResolvedValue(undefined),
			keyboard: { press: jest.fn().mockResolvedValue(undefined) },
			goBack: jest.fn().mockResolvedValue(null),
		} as unknown as Page;

		const stats = await warmUpProfile(page, 0.01);
		expect(stats).toHaveProperty("scrolls");
		expect(stats).toHaveProperty("durationSeconds");
	});
});
