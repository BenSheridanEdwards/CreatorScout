import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { snapshot } from "./snapshot.ts";

jest.mock("node:fs/promises", () => ({
	mkdir: jest.fn<() => Promise<void>>(),
	writeFile: jest.fn<() => Promise<void>>(),
}));

const page = {
	screenshot: jest
		.fn<() => Promise<Buffer>>()
		.mockResolvedValue(Buffer.from("fakepngbinary", "utf8")),
	isClosed: jest.fn<() => boolean>().mockReturnValue(false),
	waitForFunction: jest
		.fn<() => Promise<unknown>>()
		.mockResolvedValue(undefined),
} as unknown as Page;

describe("snapshot", () => {
	test("saves screenshot and returns path", async () => {
		const path = await snapshot(page, "label");
		expect(typeof path).toBe("string");
		expect(path).toContain("label");
	});
});
