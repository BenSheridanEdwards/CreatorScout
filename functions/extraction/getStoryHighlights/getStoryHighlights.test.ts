import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { getStoryHighlights } from "./getStoryHighlights.ts";

describe("getStoryHighlights", () => {
	test("returns empty array when selector fails", async () => {
		const page = {
			waitForSelector: jest
				.fn<any>()
				.mockRejectedValue(new Error("no highlights")),
			$$: jest.fn<any>().mockResolvedValue([]),
		} as unknown as Page;
		const highlights = await getStoryHighlights(page);
		expect(highlights).toEqual([]);
	});
});
