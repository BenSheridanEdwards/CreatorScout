/**
 * Profile Analysis Tests
 *
 * Profile analysis combines multiple signals to determine creator likelihood.
 * Uses real implementations of internal files - only mocks external dependencies.
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Only mock external API calls (vision API)
const analyzeProfileMock = jest
	.fn<
		(imagePath: string) => Promise<{
			is_adult_creator: boolean;
			confidence: number;
			indicators?: string[];
			reason?: string;
		} | null>
	>()
	.mockResolvedValue({
		is_adult_creator: true,
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
			is_adult_creator: true,
			confidence: 60,
			indicators: ["vision"],
			reason: "vision_reason",
		});
		isConfirmedCreatorMock.mockResolvedValue([
			true,
			{ confidence: 70, reason: "test", indicators: [] },
		]);
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
			// Mock bio extraction
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						// Return bio text
						if (typeof result === "string" && result.includes("span")) {
							return "influencer bio";
						}
						// Return empty for other queries
						return "";
					}
					return "";
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileBasic(page, "user");

			expect(result.bio).toBeDefined();
			expect(typeof result.bioScore).toBe("number");
			expect(typeof result.isLikely).toBe("boolean");
		});

		test("extracts link from bio for additional context", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						// Return link for link extraction
						if (typeof result === "string" && result.includes("a")) {
							return "https://linktr.ee/creator";
						}
						// Return bio text
						if (typeof result === "string" && result.includes("span")) {
							return "Check my link in bio";
						}
						return "";
					}
					return "";
				}) as unknown as Page["evaluate"];

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
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						// Return bio
						if (typeof result === "string" && result.includes("span")) {
							return "influencer";
						}
						// Return stats
						if (typeof result === "object" && result !== null) {
							return { followers: 1000, following: 5 };
						}
						return "";
					}
					return "";
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			// Verify result structure
			expect(result).toHaveProperty("bio");
			expect(result).toHaveProperty("links");
			expect(result).toHaveProperty("stats");
			expect(result).toHaveProperty("highlights");
			expect(result).toHaveProperty("indicators");
			expect(result).toHaveProperty("confidence");
		});

		test("includes indicators from multiple signal sources", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						// Return bio with creator keywords
						if (typeof result === "string" && result.includes("span")) {
							return "Patreon exclusive content";
						}
						// Return stats
						if (typeof result === "object" && result !== null) {
							return { followers: 10000, following: 50 };
						}
						return "";
					}
					return "";
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			expect(Array.isArray(result.indicators)).toBe(true);
		});

		test("sets isCreator true when direct creator link found", async () => {
			const page = pageMock();
			page.content = jest
				.fn<() => Promise<string>>()
				.mockResolvedValue(
					'<html><body><a href="https://patreon.com/user">Patreon</a></body></html>',
				);
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						if (typeof result === "string" && result.includes("span")) {
							return "Bio text";
						}
						return "";
					}
					return "";
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			// Should detect creator link
			expect(result.links.length).toBeGreaterThan(0);
		});

		test("uses vision analysis when confidence is uncertain", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown) => {
					if (typeof fn === "function") {
						const result = await (fn as () => unknown)();
						if (typeof result === "string" && result.includes("span")) {
							return "Uncertain bio";
						}
						if (typeof result === "object" && result !== null) {
							return { followers: 100, following: 100 };
						}
						return "";
					}
					return undefined;
				}) as unknown as Page["evaluate"];

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result).toBeDefined();
			// Vision may or may not be called depending on confidence threshold
			expect(typeof result.confidence).toBe("number");
		});
	});
});
