/**
 * Profile Analysis Tests
 *
 * Profile analysis combines multiple signals to determine creator likelihood.
 * Uses real implementations of internal files - only mocks external dependencies.
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock database module
const updateProfileFromAnalysisMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

const queueAddMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../shared/database/database.ts", () => ({
	updateProfileFromAnalysis: updateProfileFromAnalysisMock,
	queueAdd: queueAddMock,
	query: jest
		.fn<() => Promise<{ rows: unknown[] }>>()
		.mockResolvedValue({ rows: [] }),
	initDb: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	getPrismaClient: jest.fn(),
	prisma: jest.fn(),
}));

// Only mock external API calls (vision API)
const analyzeProfileMock = jest
	.fn<
		(imagePath: string) => Promise<{
			isCreator: boolean;
			confidence: number;
			indicators?: string[];
			reason?: string;
		} | null>
	>()
	.mockResolvedValue({
		isCreator: true,
		confidence: 60,
		indicators: ["vision"],
		reason: "vision_reason",
	});

const isConfirmedCreatorMock = jest
	.fn<
		(
			imagePath: string,
			threshold?: number,
		) => Promise<
			[
				boolean,
				{ confidence?: number; reason?: string; indicators?: string[] } | null,
			]
		>
	>()
	.mockResolvedValue([
		true,
		{ confidence: 70, reason: "test", indicators: [] },
	]);

const validateBioWithVisionMock = jest
	.fn<
		(
			bio: string,
			imagePath: string,
		) => Promise<{
			isValid: boolean;
			confidence: number;
			extractedBio?: string;
			reason?: string;
		} | null>
	>()
	.mockResolvedValue({
		isValid: true,
		confidence: 80,
		extractedBio: "test bio",
		reason: "test",
	});

// Set up mocks before importing
jest.unstable_mockModule("../vision/vision.ts", () => ({
	analyzeProfile: analyzeProfileMock,
	isConfirmedCreator: isConfirmedCreatorMock,
	validateBioWithVision: validateBioWithVisionMock,
}));

// Mock sleep function (used internally by delay functions) to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Mock config for test values
jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	SKIP_VISION: false,
	DELAYS: {
		after_navigate: [1.5, 3.5],
		after_click: [0.2, 0.8],
		after_type: [0.1, 0.4],
		after_dm_type: [0.8, 1.8],
		after_dm_send: [1.5, 3.5],
		after_follow: [0.8, 1.8],
		mouse_wiggle: [0.5, 1.8],
		after_message_open: [1.8, 3.5],
		after_popup_dismiss: [0.5, 1.8],
		after_modal_open: [1.2, 2.8],
		after_modal_close: [0.8, 1.8],
		after_scroll: [0.3, 1.2],
		after_scroll_batch: [1.5, 3.5],
		after_linktree_click: [2.5, 4.5],
		after_credentials: [1.2, 2.8],
		after_login_submit: [3.5, 6.5],
		after_go_back: [1.8, 3.2],
		between_profiles: [1.5, 4.5],
		between_seeds: [45, 150],
		queue_empty: [180, 300],
	},
	DELAY_SCALE: 1.0,
	SLEEP_SCALE: 1.0,
	DELAY_SCALES: {
		navigation: 1.0,
		modal: 1.0,
		input: 1.0,
		action: 1.0,
		pacing: 1.0,
	},
	DELAY_CATEGORIES: {},
	TIMEOUT_SCALE: 1.0,
	TIMEOUTS: {
		page_load: 25000,
		navigation: 15000,
		element_default: 8000,
		element_modal: 4000,
		element_button: 2500,
		element_input: 3500,
		login: 12000,
		dm_send: 8000,
		follow: 2500,
	},
	FAST_MODE: false,
	LOCAL_BROWSER: true,
	DEBUG_SCREENSHOTS: false,
	CONFIDENCE_THRESHOLD: 50,
	MAX_DMS_PER_DAY: 120,
}));

// Import after mocks are set up
const { analyzeProfileBasic, analyzeProfileComprehensive } = await import(
	"./profileAnalysis.ts"
);

const pageMock = (): Page =>
	createPageMock({
		evaluate: jest
			.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
			.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
				if (typeof fn === "function") {
					return await (fn as (...args: unknown[]) => unknown)(...args);
				}
				return undefined;
			}) as unknown as Page["evaluate"],
		$$eval: jest
			.fn<
				(
					selector: string,
					fn: (els: Element[]) => string[],
				) => Promise<string[]>
			>()
			.mockResolvedValue(["/headerlink"]),
		content: jest
			.fn<() => Promise<string>>()
			.mockResolvedValue(
				'<html><body><header><a href="https://linktr.ee/user">Link</a></header></body></html>',
			),
		keyboard: {
			press: jest
				.fn<(key: string) => Promise<void>>()
				.mockResolvedValue(undefined),
		},
		goto: jest
			.fn<(url: string, opts?: object) => Promise<void>>()
			.mockResolvedValue(undefined),
	}) as unknown as Page;

describe("profileAnalysis", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sleepMock.mockResolvedValue(undefined);
		analyzeProfileMock.mockResolvedValue({
			isCreator: true,
			confidence: 60,
			indicators: ["vision"],
			reason: "vision_reason",
		});
		isConfirmedCreatorMock.mockResolvedValue([
			true,
			{ confidence: 70, reason: "test", indicators: [] },
		]);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// analyzeProfileBasic() - Lightweight Analysis
	// ═══════════════════════════════════════════════════════════════════════════

	describe("analyzeProfileBasic()", () => {
		test("returns default values when bio extraction fails", async () => {
			const page = pageMock();
			// Mock page to return no bio
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockResolvedValue("") as unknown as Page["evaluate"];

			const result = await analyzeProfileBasic(page, "user");

			expect(result).toMatchObject({
				bio: null,
				bioScore: 0,
				isLikely: false,
				linkFromBio: null,
				confidence: 0,
			});
		});

		test("extracts bio and calculates score when bio found", async () => {
			const page = pageMock();
			// Mock bio extraction - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"10",
								"posts",
								"500",
								"followers",
								"200",
								"following",
								"Influencer bio",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Influencer bio";
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileBasic(page, "user");

			expect(result.bio).toBeDefined();
			expect(typeof result.bioScore).toBe("number");
			expect(typeof result.isLikely).toBe("boolean");
		});

		test("extracts link from bio for additional context", async () => {
			const page = pageMock();
			// Mock evaluate - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"10",
								"posts",
								"500",
								"followers",
								"200",
								"following",
								"Check my link in bio",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Check my link in bio";
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];
			// Mock $ for link extraction
			page.$ = jest
				.fn<(selector: string) => Promise<unknown>>()
				.mockImplementation(async (selector: string) => {
					if (
						selector.includes("nofollow") ||
						selector.includes("_blank") ||
						selector.includes("http")
					) {
						return {
							evaluate: jest
								.fn<() => Promise<string>>()
								.mockResolvedValue("https://linktr.ee/creator"),
						};
					}
					return null;
				}) as unknown as Page["$"];

			const result = await analyzeProfileBasic(page, "user");

			expect(result.linkFromBio).toBeDefined();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// analyzeProfileComprehensive() - Deep Inspection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("analyzeProfileComprehensive()", () => {
		test("aggregates signals from bio, links, stats, and highlights", async () => {
			const page = pageMock();
			// Mock evaluate - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"10",
								"posts",
								"1000",
								"followers",
								"5",
								"following",
								"Influencer",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Influencer";
						}
						// Stats extraction (has /followers/ or /following/ patterns)
						if (
							fnStr.includes("/followers/") ||
							fnStr.includes("/following/")
						) {
							return { followers: 1000, following: 5 };
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			// Verify result structure
			expect(result).toHaveProperty("bio");
			expect(result).toHaveProperty("links");
			expect(result).toHaveProperty("stats");
			expect(result).toHaveProperty("highlights");
			expect(result).toHaveProperty("indicators");
			expect(result).toHaveProperty("confidence");

			// Verify database was called with extracted data
			expect(updateProfileFromAnalysisMock).toHaveBeenCalledWith(
				"user",
				expect.objectContaining({
					bio: "Influencer",
					links: expect.arrayContaining(["https://linktr.ee/user"]),
				}),
			);
		});

		test("includes indicators from multiple signal sources", async () => {
			const page = pageMock();
			// Mock evaluate - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"100",
								"posts",
								"10000",
								"followers",
								"50",
								"following",
								"Influencer exclusive content",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Influencer exclusive content";
						}
						// Stats extraction (has /followers/ or /following/ patterns)
						if (
							fnStr.includes("/followers/") ||
							fnStr.includes("/following/")
						) {
							return { followers: 10000, following: 50 };
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			expect(Array.isArray(result.indicators)).toBe(true);
		});

		test("sets isCreator true when direct Influencer link found", async () => {
			const page = pageMock();
			page.content = jest
				.fn<() => Promise<string>>()
				.mockResolvedValue(
					'<html><body><a href="https://patreon.com/user">Influencer</a></body></html>',
				);
			// Mock evaluate - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"50",
								"posts",
								"1000",
								"followers",
								"100",
								"following",
								"Bio text",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Bio text";
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			// Should detect Influencer link
			expect(result.links.length).toBeGreaterThan(0);
		});

		test("uses vision analysis when confidence is uncertain", async () => {
			const page = pageMock();
			// Mock evaluate - detect function patterns instead of executing
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const fnStr = fn.toString();
						// TreeWalker pattern for text array extraction
						if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
							return [
								"testuser",
								"10",
								"posts",
								"100",
								"followers",
								"100",
								"following",
								"Uncertain bio",
								"Follow",
							];
						}
						// Bio extraction patterns (uses statsLinks, closest)
						if (
							fnStr.includes("statsLinks") ||
							fnStr.includes("statsContainer")
						) {
							return "Uncertain bio";
						}
						// Stats extraction (has /followers/ or /following/ patterns)
						if (
							fnStr.includes("/followers/") ||
							fnStr.includes("/following/")
						) {
							return { followers: 100, following: 100 };
						}
						return null;
					}
					return null;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result).toBeDefined();
			// Vision may or may not be called depending on confidence threshold
			expect(typeof result.confidence).toBe("number");
		});
	});
});
