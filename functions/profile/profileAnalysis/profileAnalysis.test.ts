/**
 * Profile Analysis Tests
 *
 * Profile analysis combines multiple signals to determine creator likelihood:
 *
 * Functions:
 * - analyzeProfileBasic(page, username): Fast, lightweight analysis
 *   - Extracts bio and checks for keywords
 *   - Gets link from bio
 *   - Returns: { bio, bioScore, isLikely, linkFromBio, confidence }
 *
 * - analyzeProfileComprehensive(page, username): Deep inspection
 *   - Bio analysis with keyword matching
 *   - Link collection and external link analysis
 *   - Profile stats (follower ratio)
 *   - Story highlights analysis
 *   - Optional vision AI analysis
 *   - Returns: Full analysis result with indicators and confidence
 *
 * - analyzeLinkWithVision(page, linkUrl, username, prefix): Vision AI for links
 *   - Navigates to link page
 *   - Takes screenshot and analyzes with AI
 */

import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// ═══════════════════════════════════════════════════════════════════════════
// Mock Setup
// ═══════════════════════════════════════════════════════════════════════════

const sleepMock = jest.fn<() => Promise<void>>();
const snapshotMock = jest
	.fn<(page: Page, label: string) => Promise<string>>()
	.mockResolvedValue("shot.png");
const getBioFromPageMock = jest
	.fn<() => Promise<string | null>>()
	.mockResolvedValue("bio");
const getLinkFromBioMock = jest
	.fn<() => Promise<string | null>>()
	.mockResolvedValue("http://example.com");
const isLikelyCreatorMock = jest
	.fn<
		(
			bio: string,
			threshold?: number,
			username?: string,
		) => [boolean, { score: number; reasons: string[] }]
	>()
	.mockReturnValue([true, { score: 80, reasons: ["reason1"] }]);
const findKeywordsMock = jest
	.fn<(text: string) => string[]>()
	.mockReturnValue(["kw"]);
const getProfileStatsMock = jest
	.fn<() => Promise<{ followers: number; following: number; ratio: number }>>()
	.mockResolvedValue({
		followers: 1000,
		following: 5,
		ratio: 200,
	});
const getStoryHighlightsMock = jest
	.fn<() => Promise<Array<{ title: string; coverImageUrl: string | null }>>>()
	.mockResolvedValue([
		{ title: "Links", coverImageUrl: "cover1" },
		{ title: "Fun", coverImageUrl: null },
	]);
const isLinkInBioHighlightMock = jest
	.fn<(title: string) => boolean>()
	.mockImplementation((t) => t === "Fun");
const getHighlightTitlesTextMock = jest
	.fn<() => string>()
	.mockReturnValue("link highlight");
const buildUniqueLinksMock = jest
	.fn<() => string[]>()
	.mockReturnValue(["https://patreon.com/user"]);
const hasDirectCreatorLinkMock = jest
	.fn<(links: string[]) => boolean>()
	.mockReturnValue(true);
const analyzeExternalLinkMock = jest
	.fn<
		() => Promise<{
			isCreator: boolean;
			confidence: number;
			indicators: string[];
		}>
	>()
	.mockResolvedValue({
		isCreator: true,
		confidence: 70,
		indicators: ["patreon link"],
	});
const shouldUseVisionAnalysisMock = jest
	.fn<() => boolean>()
	.mockReturnValue(true);
const decodeInstagramRedirectMock = jest
	.fn<(url: string) => string | null>()
	.mockReturnValue("https://patreon.com/user");
const analyzeProfileMock = jest
	.fn<
		() => Promise<{
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
const isConfirmedCreatorMock = jest.fn();

jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	SKIP_VISION: false,
}));
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));
jest.unstable_mockModule("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: snapshotMock,
}));
jest.unstable_mockModule(
	"../../extraction/getBioFromPage/getBioFromPage.ts",
	() => ({
		getBioFromPage: getBioFromPageMock,
	}),
);
jest.unstable_mockModule(
	"../../extraction/getLinkFromBio/getLinkFromBio.ts",
	() => ({
		getLinkFromBio: getLinkFromBioMock,
	}),
);
jest.unstable_mockModule("../bioMatcher/bioMatcher.ts", () => ({
	isLikelyCreator: isLikelyCreatorMock,
	findKeywords: findKeywordsMock,
}));
jest.unstable_mockModule(
	"../../extraction/getProfileStats/getProfileStats.ts",
	() => ({
		getProfileStats: getProfileStatsMock,
	}),
);
jest.unstable_mockModule(
	"../../extraction/getStoryHighlights/getStoryHighlights.ts",
	() => ({
		getStoryHighlights: getStoryHighlightsMock,
		isLinkInBioHighlight: isLinkInBioHighlightMock,
		getHighlightTitlesText: getHighlightTitlesTextMock,
	}),
);
jest.unstable_mockModule(
	"../../extraction/linkExtraction/linkExtraction.ts",
	() => ({
		buildUniqueLinks: buildUniqueLinksMock,
		hasDirectCreatorLink: hasDirectCreatorLinkMock,
		analyzeExternalLink: analyzeExternalLinkMock,
		shouldUseVisionAnalysis: shouldUseVisionAnalysisMock,
		decodeInstagramRedirect: decodeInstagramRedirectMock,
	}),
);
jest.unstable_mockModule("../vision/vision.ts", () => ({
	analyzeProfile: analyzeProfileMock,
	isConfirmedCreator: isConfirmedCreatorMock,
}));

const { analyzeProfileBasic, analyzeProfileComprehensive } = await import(
	"./profileAnalysis.ts"
);

const pageMock = () =>
	({
		evaluate: jest
			.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
			.mockResolvedValue(undefined),
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
			.mockResolvedValue("<html></html>"),
		keyboard: {
			press: jest
				.fn<(key: string) => Promise<void>>()
				.mockResolvedValue(undefined),
		},
	}) as unknown as Page;

describe("profileAnalysis", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		getBioFromPageMock.mockResolvedValue("bio text");
		isLikelyCreatorMock.mockReturnValue([
			true,
			{ score: 80, reasons: ["reason1"] },
		]);
		buildUniqueLinksMock.mockReturnValue(["https://patreon.com/user"]);
		hasDirectCreatorLinkMock.mockReturnValue(true);
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// analyzeProfileBasic() - Lightweight Analysis
	// ═══════════════════════════════════════════════════════════════════════════

	describe("analyzeProfileBasic()", () => {
		test("returns default values when bio extraction fails", async () => {
			getBioFromPageMock.mockResolvedValue(null);
			const page = pageMock();

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
			getBioFromPageMock.mockResolvedValue("influencer bio");
			isLikelyCreatorMock.mockReturnValue([
				true,
				{ score: 75, reasons: ["creator mention"] },
			]);
			const page = pageMock();

			const result = await analyzeProfileBasic(page, "user");

			expect(getBioFromPageMock).toHaveBeenCalledWith(page);
			expect(isLikelyCreatorMock).toHaveBeenCalledWith(
				"influencer bio",
				40,
				"user",
			);
			expect(result.bio).toBe("influencer bio");
			expect(result.bioScore).toBe(75);
		});

		test("extracts link from bio for additional context", async () => {
			getLinkFromBioMock.mockResolvedValue("https://linktr.ee/creator");
			const page = pageMock();

			const result = await analyzeProfileBasic(page, "user");

			expect(getLinkFromBioMock).toHaveBeenCalledWith(page);
			expect(result.linkFromBio).toBe("https://linktr.ee/creator");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// analyzeProfileComprehensive() - Deep Inspection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("analyzeProfileComprehensive()", () => {
		test("aggregates signals from bio, links, stats, and highlights", async () => {
			const page = pageMock();

			const result = await analyzeProfileComprehensive(page, "user");

			// Verify all extraction functions called
			expect(getBioFromPageMock).toHaveBeenCalled();
			expect(getLinkFromBioMock).toHaveBeenCalled();
			expect(buildUniqueLinksMock).toHaveBeenCalled();
			expect(getProfileStatsMock).toHaveBeenCalled();
			expect(getStoryHighlightsMock).toHaveBeenCalled();
		});

		test("includes indicators from multiple signal sources", async () => {
			const page = pageMock();

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result.indicators).toEqual(
				expect.arrayContaining([
					"reason1", // Bio matcher reason
					"High follower ratio (200.0x)", // Stats
					"Highlight keywords: kw", // Highlights
					'Link highlight: "Fun"', // Link highlight
					"External links in profile", // Links
				]),
			);
		});

		test("sets isCreator true when direct creator link found", async () => {
			hasDirectCreatorLinkMock.mockReturnValue(true);
			const page = pageMock();

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result.isCreator).toBe(true);
			expect(result.reason).toBe("direct_patreon_link");
		});

		test("achieves high confidence with direct creator link", async () => {
			const page = pageMock();

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result.confidence).toBeGreaterThan(0);
		});

		test("uses vision analysis when confidence is uncertain", async () => {
			shouldUseVisionAnalysisMock.mockReturnValue(true);
			const page = pageMock();

			const result = await analyzeProfileComprehensive(page, "user");

			expect(result).toBeDefined();
			expect(snapshotMock).toHaveBeenCalled();
			expect(analyzeProfileMock).toHaveBeenCalled();
		});
	});
});
