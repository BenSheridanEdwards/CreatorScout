import { jest } from "@jest/globals";
import { createPageMock } from "../../__test__/testUtils.ts";
import { getProfileStats } from "./getProfileStats.ts";

describe("getProfileStats", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("happy path", () => {
		test("returns parsed counts and ratio when evaluate succeeds", async () => {
			const evaluateMock = jest
				.fn<
					() => Promise<{ followers: number; following: number; posts: number }>
				>()
				.mockResolvedValue({
					followers: 1200,
					following: 300,
					posts: 42,
				});
			const page = createPageMock({ evaluate: evaluateMock });

			const stats = await getProfileStats(page);

			expect(evaluateMock).toHaveBeenCalledTimes(1);
			expect(stats).toEqual({
				followers: 1200,
				following: 300,
				posts: 42,
				ratio: 4,
			});
		});

		test("leaves ratio null when following is zero", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<
						() => Promise<{
							followers: number;
							following: number;
							posts: number;
						}>
					>()
					.mockResolvedValue({
						followers: 100,
						following: 0,
						posts: 10,
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

		test("leaves ratio null when any count is null", async () => {
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
						followers: 500,
						following: null,
						posts: 20,
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

	describe("error and malformed responses", () => {
		test("returns null stats when evaluate throws", async () => {
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

		test("passes through nulls from evaluate", async () => {
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
