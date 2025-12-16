import { jest } from "@jest/globals";
import * as fs from "node:fs";
import type { ElementHandle, Page } from "puppeteer";
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";
import { getBioFromPage } from "./getBioFromPage.ts";

const originalEnv = { ...process.env };

describe("getBioFromPage", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv, CI: "true" };
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	test("returns long bio from first matching selector", async () => {
		const bioElement = {
			evaluate: jest
				.fn<() => Promise<string>>()
				.mockResolvedValue("This is my bio text"),
		};
		const page = createPageMock({
			$: jest
				.fn<(selector: string) => Promise<ElementHandle<Element> | null>>()
				.mockResolvedValue(bioElement as unknown as ElementHandle<Element>),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBe("This is my bio text");
		expect(page.$).toHaveBeenCalled();
	});

	test("skips non-bio content and uses a later selector", async () => {
		const uiEl = {
			evaluate: jest.fn<() => Promise<string>>().mockResolvedValue("Follow"), // UI element text
		};
		const bioEl = {
			evaluate: jest
				.fn<() => Promise<string>>()
				.mockResolvedValue("This is a sufficiently long bio for testing."),
		};
		let call = 0;
		const page = createPageMock({
			$: jest
				.fn<(selector: string) => Promise<ElementHandle<Element> | null>>()
				.mockImplementation(async () => {
					call += 1;
					if (call === 1) return uiEl as unknown as ElementHandle<Element>;
					if (call === 2) return bioEl as unknown as ElementHandle<Element>;
					return null;
				}),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBe("This is a sufficiently long bio for testing.");
		expect(uiEl.evaluate).toHaveBeenCalled();
		expect(bioEl.evaluate).toHaveBeenCalled();
	});

	test("falls back to header and picks longest non-link line", async () => {
		const headerText = [
			"@handle",
			"http://example.com",
			"This is a long descriptive bio line without links",
		].join("\n");

		const headerEl = {
			evaluate: jest.fn<() => Promise<string>>().mockResolvedValue(headerText),
		};

		const page = createPageMock({
			$: jest
				.fn<(selector: string) => Promise<ElementHandle<Element> | null>>()
				.mockImplementation(async (sel: string) => {
					if (sel === "header")
						return headerEl as unknown as ElementHandle<Element>;
					return null;
				}),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBe("This long descriptive bio line without links");
	});

	test("falls back to header and returns trimmed text when no long line", async () => {
		const headerEl = {
			evaluate: jest
				.fn<() => Promise<string>>()
				.mockResolvedValue("short bio line"),
		};

		const page = createPageMock({
			$: jest
				.fn<(selector: string) => Promise<ElementHandle<Element> | null>>()
				.mockImplementation(async (sel: string) => {
					if (sel === "header")
						return headerEl as unknown as ElementHandle<Element>;
					return null;
				}),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBe("short bio line");
	});

	test("returns null when nothing is found (no selectors, no header) without snapshot in CI", async () => {
		const page = createPageMock({
			$: jest
				.fn<() => Promise<ElementHandle<Element> | null>>()
				.mockResolvedValue(null),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBeNull();
		if (page.screenshot) {
			expect(
				page.screenshot as jest.MockedFunction<Page["screenshot"]>,
			).not.toHaveBeenCalled();
		}
	});

	test("captures snapshot in local mode when nothing is found", async () => {
		process.env.HEADLESS = "false";
		delete process.env.CI;

		const screenshotMock = jest
			.fn<(options?: object) => Promise<void>>()
			.mockResolvedValue(undefined);
		const page = createPageMock({
			$: jest
				.fn<() => Promise<ElementHandle<Element> | null>>()
				.mockResolvedValue(null),
			screenshot: screenshotMock,
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBeNull();
		expect(screenshotMock).toHaveBeenCalled();
		const callArg = (screenshotMock.mock.calls[0]?.[0] || {}) as {
			path?: string;
		};
		if (callArg.path) {
			expect(callArg.path).toContain("bio_extraction_failed");
			if (fs.existsSync(callArg.path)) {
				fs.rmSync(callArg.path, { force: true });
			}
		}
	});

	test("returns null when selector rejects", async () => {
		const page = createPageMock({
			$: jest
				.fn<() => Promise<ElementHandle<Element> | null>>()
				.mockRejectedValue(new Error("Timeout")),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBeNull();
	});

	test("returns null when element evaluation rejects", async () => {
		const bioElement = {
			evaluate: jest
				.fn<() => Promise<string>>()
				.mockRejectedValue(new Error("Evaluation failed")),
		};
		const page = createPageWithElementMock({
			$: jest
				.fn<() => Promise<ElementHandle<Element> | null>>()
				.mockResolvedValue(bioElement as unknown as ElementHandle<Element>),
		}) as jest.Mocked<Page>;

		const result = await getBioFromPage(page as Page);

		expect(result).toBeNull();
	});
});
