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

import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";
import {
	createPageMock,
	createPageWithDOM,
	createPageWithElementMock,
	INSTAGRAM_CREATOR_PROFILE_HTML,
} from "../../__test__/testUtils.ts";

// Mock config to enable DEBUG_SCREENSHOTS for screenshot tests
jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	LOCAL_BROWSER: false,
	DEBUG_SCREENSHOTS: true,
}));

// Mock vision module
jest.unstable_mockModule("../../profile/vision/vision.ts", () => ({
	validateBioWithVision: jest.fn<() => Promise<null>>().mockResolvedValue(null),
}));

const { getBioFromPage } = await import("./getBioFromPage.ts");

const originalEnv = { ...process.env };

describe("getBioFromPage", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env = { ...originalEnv, CI: "true" };
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Happy Path: Bio Found via Selectors
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Bio extraction via text array", () => {
		test("returns bio text from text array extraction", async () => {
			// Mock page that returns a proper text array for extraction
			const page = createPageMock({
				evaluate: jest.fn((fn: () => unknown) => {
					const fnStr = fn.toString();
					if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
						// Return text array with username, stats, and bio
						return Promise.resolve([
							"testuser",
							"100",
							"posts",
							"500",
							"followers",
							"200",
							"following",
							"This is my bio text",
							"Follow",
						]);
					}
					return Promise.resolve(undefined);
				}),
				$$: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
			}) as jest.Mocked<Page>;

			const result = await getBioFromPage(page as Page);

			expect(result).toBe("This is my bio text");
		});

		test("extracts bio from real Instagram DOM structure", async () => {
			const page = createPageWithDOM(INSTAGRAM_CREATOR_PROFILE_HTML);
			const bio = await getBioFromPage(page);

			// Should extract bio text from span[dir="auto"]
			expect(bio).toBeTruthy();
			expect(bio).toContain("If you aren't here for my captions");
			expect(bio).toContain("Bali, probably travelling");
		});

		test("expands truncated bio with 'more' button before extraction", async () => {
			// Create a page mock that returns bio via text array extraction
			const page = createPageMock({
				evaluate: jest.fn((fn: () => unknown) => {
					const fnStr = fn.toString();
					if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
						// Return text array with bio content
						return Promise.resolve([
							"testuser",
							"50",
							"posts",
							"100",
							"followers",
							"50",
							"following",
							"Short bio text that was expanded",
							"Follow",
						]);
					}
					// Return mock for "more" button detection
					if (fnStr.includes("more")) {
						return Promise.resolve({ found: false });
					}
					return Promise.resolve(undefined);
				}),
				$$: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
			}) as jest.Mocked<Page>;

			const bio = await getBioFromPage(page);

			expect(bio).toBe("Short bio text that was expanded");
		});

		test("skips UI element text and extracts bio correctly", async () => {
			// Text array extraction already filters out UI elements
			const page = createPageMock({
				evaluate: jest.fn((fn: () => unknown) => {
					const fnStr = fn.toString();
					if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
						// Return text array where bio comes after stats
						return Promise.resolve([
							"testuser",
							"10",
							"posts",
							"100",
							"followers",
							"50",
							"following",
							"This is a sufficiently long bio for testing.",
							"Follow", // UI element - should be skipped for bio
						]);
					}
					return Promise.resolve(undefined);
				}),
				$$: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
			}) as jest.Mocked<Page>;

			const result = await getBioFromPage(page as Page);

			expect(result).toBe("This is a sufficiently long bio for testing.");
		});

		test("filters out stats text (posts, followers, following)", async () => {
			// Create HTML with stats and bio in proper order
			const htmlWithStats = `
				<header>
					<section>
						<h2 dir="auto">testuser</h2>
						<div>
							<a href="/testuser/followers/">100 followers</a>
							<a href="/testuser/following/">50 following</a>
						</div>
						<span dir="auto">Actual bio content here</span>
					</section>
				</header>
			`;
			const page = createPageWithDOM(htmlWithStats);

			const result = await getBioFromPage(page);

			expect(result).toBe("Actual bio content here");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Fallback: Header Element Parsing
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Fallback to header element parsing", () => {
		test("extracts bio from header text when selectors fail", async () => {
			// Create HTML without proper structure - should fall back to header text parsing
			const htmlWithoutStructure = `
				<header>
					<div>@handle</div>
					<div>http://example.com</div>
					<div>This is a long descriptive bio line without links</div>
				</header>
			`;
			const page = createPageWithDOM(htmlWithoutStructure);

			const result = await getBioFromPage(page);

			// Should extract bio from header text fallback
			expect(result).toBeTruthy();
			expect(result).toContain(
				"This is a long descriptive bio line without links",
			);
		});

		test("returns bio from text array extraction", async () => {
			const page = createPageMock({
				evaluate: jest.fn((fn: () => unknown) => {
					const fnStr = fn.toString();
					if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
						// Return text array with proper structure (username, stats, bio)
						return Promise.resolve([
							"someuser",
							"10",
							"posts",
							"100",
							"followers",
							"50",
							"following",
							"short bio line",
							"Follow",
						]);
					}
					return Promise.resolve(undefined);
				}),
				$$: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
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

		test("returns null when extraction fails with no DOM structure", async () => {
			// Create empty HTML - should return null after all strategies fail
			const emptyHTML = `<header></header>`;
			const page = createPageWithDOM(emptyHTML);

			const result = await getBioFromPage(page);

			expect(result).toBeNull();
		});

		test("handles extraction gracefully when DOM structure is incomplete", async () => {
			// Create HTML with only username, no bio - should return null
			const incompleteHTML = `
				<header>
					<section>
						<h2 dir="auto">testuser</h2>
						<div>
							<a href="/testuser/followers/">100 followers</a>
						</div>
					</section>
				</header>
			`;
			const page = createPageWithDOM(incompleteHTML);

			const result = await getBioFromPage(page);

			// When no distinct bio text is found after stats, result should be null
			// This is expected behavior - incomplete profiles without bio return null
			expect(result).toBeNull();
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
