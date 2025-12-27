import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// Mock config to enable DEBUG_SCREENSHOTS for tests
jest.unstable_mockModule("../config/config.ts", () => ({
	LOCAL_BROWSER: false,
	DEBUG_SCREENSHOTS: true,
}));

const mockMkdir = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock("node:fs/promises", () => ({
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
}));

// Mock runs module
jest.unstable_mockModule("../runs/runs.ts", () => ({
	getCurrentRunId: jest.fn<() => string | null>().mockReturnValue(null),
	addScreenshotToRun: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const { snapshot } = await import("./snapshot.ts");

const page = {
	screenshot: jest
		.fn<() => Promise<Buffer>>()
		.mockResolvedValue(Buffer.from("fakepngbinary", "utf8")),
	isClosed: jest.fn<() => boolean>().mockReturnValue(false),
	waitForFunction: jest
		.fn<() => Promise<unknown>>()
		.mockResolvedValue(undefined),
	evaluate: jest
		.fn<() => Promise<boolean>>()
		.mockResolvedValue(false),
} as unknown as Page;

describe("snapshot", () => {
	test("saves screenshot and returns path", async () => {
		const path = await snapshot(page, "label");
		expect(typeof path).toBe("string");
		expect(path).toContain("label");
	});
});
