/**
 * getBioFromPage Function Tests
 *
 * The getBioFromPage() function extracts bio text from an Instagram profile:
 *
 * Algorithm:
 * 1. Try multiple CSS selectors in priority order (most specific first)
 * 2. For each match, validate it looks like bio content (not UI elements)
 * 3. Attempt to expand bio from parent element for complete text
 * 4. Fall back to header element parsing if selectors fail
 * 5. Capture failure screenshot in local/debug mode
 *
 * Returns: Bio text string or null if not found
 */

import * as fs from "node:fs";
import { jest } from "@jest/globals";
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

	// ═══════════════════════════════════════════════════════════════════════════
	// Happy Path: Bio Found via Selectors
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Bio extraction via CSS selectors", () => {
		test("returns bio text from first matching selector", async () => {
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

		test("skips UI element text and continues to next selector", async () => {
			const uiEl = {
				evaluate: jest.fn<() => Promise<string>>().mockResolvedValue("Follow"),
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

		test("filters out stats text (posts, followers, following)", async () => {
			const statsEl = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue("100 posts 500 followers"),
			};
			const bioEl = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue("Actual bio content here"),
			};
			let call = 0;
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<ElementHandle<Element> | null>>()
					.mockImplementation(async () => {
						call += 1;
						if (call === 1) return statsEl as unknown as ElementHandle<Element>;
						if (call === 2) return bioEl as unknown as ElementHandle<Element>;
						return null;
					}),
			}) as jest.Mocked<Page>;

			const result = await getBioFromPage(page as Page);

			expect(result).toBe("Actual bio content here");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Fallback: Header Element Parsing
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Fallback to header element parsing", () => {
		test("extracts bio from header text when selectors fail", async () => {
			const headerText = [
				"@handle",
				"http://example.com",
				"This is a long descriptive bio line without links",
			].join("\n");

			const headerEl = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue(headerText),
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

		test("returns trimmed header text when no distinct bio line found", async () => {
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
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Failure Cases
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Failure handling", () => {
		test("returns null when no selectors or header match", async () => {
			const page = createPageMock({
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null),
			}) as jest.Mocked<Page>;

			const result = await getBioFromPage(page as Page);

			expect(result).toBeNull();
		});

		test("takes debug screenshot even in CI environment when extraction fails", async () => {
			const page = createPageMock({
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null),
			}) as jest.Mocked<Page>;

			await getBioFromPage(page as Page);

			// Screenshots are taken for debugging even in CI
			if (page.screenshot) {
				expect(
					page.screenshot as jest.MockedFunction<Page["screenshot"]>,
				).toHaveBeenCalled();
			}
		});

		test("captures debug screenshot in local mode when extraction fails", async () => {
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

			await getBioFromPage(page as Page);

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

		test("returns null when selector query throws", async () => {
			const page = createPageMock({
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockRejectedValue(new Error("Timeout")),
			}) as jest.Mocked<Page>;

			const result = await getBioFromPage(page as Page);

			expect(result).toBeNull();
		});

		test("returns null when element evaluation throws", async () => {
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
});
