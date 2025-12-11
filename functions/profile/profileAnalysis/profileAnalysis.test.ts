import { jest } from "@jest/globals";
import {
	analyzeProfileBasic,
	analyzeProfileComprehensive,
} from "./profileAnalysis.ts";

jest.mock("../../shared/config/config.ts", () => ({ SKIP_VISION: true }));
jest.mock("../../timing/sleep/sleep.ts", () => ({ sleep: jest.fn<any>() }));
jest.mock("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: jest.fn<any>().mockResolvedValue("shot.png"),
}));
jest.mock("../../extraction/getBioFromPage/getBioFromPage.ts", () => ({
	getBioFromPage: jest.fn<any>().mockResolvedValue("bio"),
}));
jest.mock("../../extraction/getLinkFromBio/getLinkFromBio.ts", () => ({
	getLinkFromBio: jest.fn<any>().mockResolvedValue("http://example.com"),
}));
jest.mock("../bioMatcher/bioMatcher.ts", () => ({
	isLikelyCreator: jest.fn<any>(() => [true, { score: 90, reasons: [] }]),
	findKeywords: jest.fn<any>(() => ["foo"]),
}));
jest.mock("../../extraction/getProfileStats/getProfileStats.ts", () => ({
	getProfileStats: jest.fn<any>().mockResolvedValue({
		followers: 1,
		following: 1,
		posts: 1,
		ratio: 1,
	}),
}));
jest.mock("../../extraction/getStoryHighlights/getStoryHighlights.ts", () => ({
	getStoryHighlights: jest.fn<any>().mockResolvedValue([]),
	isLinkInBioHighlight: jest.fn<any>(() => false),
	getHighlightTitlesText: jest.fn<any>(() => []),
}));
jest.mock("../../extraction/linkExtraction/linkExtraction.ts", () => ({
	buildUniqueLinks: jest.fn<any>(() => []),
	hasDirectCreatorLink: jest.fn<any>(() => false),
}));
jest.mock("../vision/vision.ts", () => ({
	analyzeProfile: jest.fn<any>().mockResolvedValue({
		isCreator: false,
		confidence: 0,
		indicators: [],
		reason: "none",
	}),
	isConfirmedCreator: jest.fn<any>(() => [false, { indicators: [] }]),
}));

const pageMock = () =>
	({
		evaluate: jest.fn<any>(),
		$$eval: jest.fn<any>().mockResolvedValue([]),
		content: jest.fn<any>().mockResolvedValue("<html></html>"),
		$(..._args: any[]) {
			return null;
		},
	}) as any;

describe("profileAnalysis", () => {
	test("analyzeProfileBasic resolves", async () => {
		const page = pageMock();
		const result = await analyzeProfileBasic(page, "user");
		expect(result).toBeTruthy();
	});

	test("analyzeProfileComprehensive resolves", async () => {
		const page = pageMock();
		const result = await analyzeProfileComprehensive(page, "user");
		expect(result).toBeTruthy();
	});
});
