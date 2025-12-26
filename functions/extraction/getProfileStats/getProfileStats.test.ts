/**
 * getProfileStats Function Tests
 *
 * The getProfileStats() function extracts follower/following/posts statistics:
 *
 * Algorithm:
 * 1. Use page.evaluate() to extract stats from DOM
 * 2. Try multiple extraction methods:
 *    - Method 1: Find links with /followers/ or /following/ hrefs
 *    - Method 2: Parse header text for patterns like "110K followers"
 * 3. Handle abbreviated counts (K, M, B suffixes)
 * 4. Calculate follower/following ratio if both counts available
 *
 * Returns: { followers, following, posts, ratio } with null for missing values
 */

import { jest } from "@jest/globals";
import { createPageMock } from "../../__test__/testUtils.ts";
import { getProfileStats } from "./getProfileStats.ts";

describe("getProfileStats", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Happy Path: Successful Stats Extraction
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Successful stats extraction", () => {
	test("returns parsed counts with calculated ratio", async () => {
		const evaluateMock = jest
			.fn<
				() => Promise<{
					followersText: string | null;
					followingText: string | null;
					postsText: string | null;
					hasZeroFollowing: boolean;
				}>
			>()
			.mockResolvedValue({
				followersText: "1200",
				followingText: "300",
				postsText: "42",
				hasZeroFollowing: false,
			});
		const page = createPageMock({ evaluate: evaluateMock });

		const stats = await getProfileStats(page);

		expect(evaluateMock).toHaveBeenCalledTimes(1);
		expect(stats).toEqual({
			followers: 1200,
			following: 300,
			posts: 42,
			ratio: 4, // 1200 / 300 = 4
		});
	});

	test("calculates correct ratio for high follower counts", async () => {
		const page = createPageMock({
			evaluate: jest
				.fn<
					() => Promise<{
						followersText: string | null;
						followingText: string | null;
						postsText: string | null;
						hasZeroFollowing: boolean;
					}>
				>()
				.mockResolvedValue({
					followersText: "100000",
					followingText: "500",
					postsText: "200",
					hasZeroFollowing: false,
				}),
		});

		const stats = await getProfileStats(page);

		expect(stats.ratio).toBe(200); // 100000 / 500 = 200
	});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Ratio Edge Cases
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Ratio calculation edge cases", () => {
	test("returns null ratio when following count is zero (avoid division by zero)", async () => {
		const page = createPageMock({
			evaluate: jest
				.fn<
					() => Promise<{
						followersText: string | null;
						followingText: string | null;
						postsText: string | null;
						hasZeroFollowing: boolean;
					}>
				>()
				.mockResolvedValue({
					followersText: "100",
					followingText: null,
					postsText: "10",
					hasZeroFollowing: true,
				}),
		});

		const stats = await getProfileStats(page);

		expect(stats).toEqual({
			followers: 100,
			following: 0,
			posts: 10,
			ratio: null,
		});
	});

	test("returns null ratio when followers count is null", async () => {
		const page = createPageMock({
			evaluate: jest
				.fn<
					() => Promise<{
						followersText: string | null;
						followingText: string | null;
						postsText: string | null;
						hasZeroFollowing: boolean;
					}>
				>()
				.mockResolvedValue({
					followersText: null,
					followingText: "500",
					postsText: "20",
					hasZeroFollowing: false,
				}),
		});

		const stats = await getProfileStats(page);

		expect(stats.ratio).toBeNull();
	});

	test("returns null ratio when following count is null", async () => {
		const page = createPageMock({
			evaluate: jest
				.fn<
					() => Promise<{
						followersText: string | null;
						followingText: string | null;
						postsText: string | null;
						hasZeroFollowing: boolean;
					}>
				>()
				.mockResolvedValue({
					followersText: "500",
					followingText: null,
					postsText: "20",
					hasZeroFollowing: false,
				}),
		});

			const stats = await getProfileStats(page);

			expect(stats).toEqual({
				followers: 500,
				following: null,
				posts: 20,
				ratio: null,
			});
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Error Handling
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("returns all null stats when evaluate throws error", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<() => Promise<never>>()
					.mockRejectedValue(new Error("Selector failed")),
			});

			const stats = await getProfileStats(page);

			expect(stats).toEqual({
				followers: null,
				following: null,
				posts: null,
				ratio: null,
			});
		});

		test("passes through null values from page evaluation", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<
						() => Promise<{
							followers: number | null;
							following: number | null;
							posts: number | null;
						}>
					>()
					.mockResolvedValue({
						followers: null,
						following: null,
						posts: null,
					}),
			});

			const stats = await getProfileStats(page);

			expect(stats).toEqual({
				followers: null,
				following: null,
				posts: null,
				ratio: null,
			});
		});
	});
});
