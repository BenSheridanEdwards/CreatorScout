import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { snapshot } from "./snapshot.ts";

jest.mock("node:fs/promises", () => ({
	mkdir: jest.fn<any>(),
	writeFile: jest.fn<any>(),
}));

const page = {
	screenshot: jest.fn<any>().mockResolvedValue(undefined),
} as unknown as Page;

describe("snapshot", () => {
	test("saves screenshot and returns path", async () => {
		const path = await snapshot(page, "label");
		expect(typeof path).toBe("string");
		expect(path).toContain("label");
	});
});
