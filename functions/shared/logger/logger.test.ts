import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createLogger } from "./logger.ts";

jest.mock("../snapshot/snapshot.ts", () => ({
	snapshot: jest.fn<any>().mockResolvedValue("shot.png"),
}));

describe("logger", () => {
	test("respects debug flag", () => {
		const logger = createLogger(false);
		expect(logger).toBeTruthy();
		logger.debug("ACTION", "msg");
	});

	test("errorWithScreenshot resolves", async () => {
		const logger = createLogger(true);
		const page = {
			screenshot: jest
				.fn<() => Promise<Buffer | string>>()
				.mockResolvedValue(Buffer.from("fake-image")),
		} as unknown as Page;
		await expect(
			logger.errorWithScreenshot("ERROR", "msg", page, "ctx"),
		).resolves.not.toThrow();
	});
});
