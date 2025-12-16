import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

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

	test("analyzeProfileBasic returns defaults when no bio", async () => {
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

	test("analyzeProfileComprehensive aggregates signals and direct link", async () => {
		const page = pageMock();

		const result = await analyzeProfileComprehensive(page, "user");

		expect(getBioFromPageMock).toHaveBeenCalled();
		expect(getLinkFromBioMock).toHaveBeenCalled();
		expect(buildUniqueLinksMock).toHaveBeenCalled();
		expect(result.indicators).toEqual(
			expect.arrayContaining([
				"reason1",
				"High follower ratio (200.0x)",
				"Highlight keywords: kw",
				'Link highlight: "Fun"',
				"External links in profile",
			]),
		);
		expect(result.isCreator).toBe(true);
		expect(result.reason).toBe("direct_patreon_link");
		expect(result.confidence).toBeGreaterThan(0);
		expect(snapshotMock).toHaveBeenCalled();
		expect(analyzeProfileMock).toHaveBeenCalled();
	});
});
