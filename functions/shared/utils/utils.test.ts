import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

const mkdirSync = jest.fn();
jest.unstable_mockModule("node:fs", () => ({ mkdirSync }));

const screenshot = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const page = { screenshot } as unknown as Page;

const { saveProof } = await import("./utils.ts");

describe("utils", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("saveProof creates screenshots dir and captures with full page", async () => {
		const path = await saveProof("user123", page);

		expect(mkdirSync).toHaveBeenCalledWith("screenshots", { recursive: true });
		expect(screenshot).toHaveBeenCalledWith(
			expect.objectContaining({
				path: expect.stringContaining("DM_user123_"),
				fullPage: true,
			}),
		);
		expect(path).toContain("screenshots/DM_user123_");
	});
});
