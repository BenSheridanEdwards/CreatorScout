import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { saveProof } from "./utils.ts";

jest.mock("node:fs", () => ({ mkdirSync: jest.fn<any>() }));

const screenshot = jest.fn<any>().mockResolvedValue(undefined);
const page = { screenshot } as unknown as Page;

describe("utils", () => {
	test("saveProof returns path and calls screenshot", async () => {
		const path = await saveProof("user", page);
		expect(typeof path).toBe("string");
		expect(screenshot).toHaveBeenCalled();
	});
});
