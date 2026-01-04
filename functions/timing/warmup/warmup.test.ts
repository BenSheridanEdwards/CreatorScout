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
	microDelay: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	shortDelay: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	mediumDelay: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	humanScroll: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const { warmUpProfile } = await import("./warmup.ts");

describe("warmup", () => {
	it("runs without throwing and returns stats", async () => {
		const page = {
			url: jest.fn<() => string>(() => "https://www.instagram.com/"),
			goto: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			$$: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
			$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			evaluate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			keyboard: {
				press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			},
			goBack: jest.fn<() => Promise<null>>().mockResolvedValue(null),
		} as unknown as Page;

		const stats = await warmUpProfile(page, 0.01);
		expect(stats).toHaveProperty("scrolls");
		expect(stats).toHaveProperty("durationSeconds");
	});
});
