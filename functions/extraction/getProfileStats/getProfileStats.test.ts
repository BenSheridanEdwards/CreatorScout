import { jest } from "@jest/globals";
import { createPageMock } from "../../__test__/testUtils.ts";
import { getProfileStats } from "./getProfileStats.ts";

describe("getProfileStats", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("when profile stats are found", () => {
		test("extracts all stats successfully", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: 1200, // Already parsed
					following: 345,
					posts: 67,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBe(1200);
			expect(stats.following).toBe(345);
			expect(stats.posts).toBe(67);
			expect(stats.ratio).toBeCloseTo(3.48, 2); // 1200/345
		});

		test("handles different number formats", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: 1234,
					following: 5600,
					posts: 789,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBe(1234);
			expect(stats.following).toBe(5600);
			expect(stats.posts).toBe(789);
		});

		test("calculates ratio correctly", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: 1000,
					following: 100,
					posts: 50,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.ratio).toBe(10); // 1000/100
		});
	});

	describe("when stats are missing or malformed", () => {
		test("returns nulls when selectors fail", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<any>()
					.mockRejectedValue(new Error("Selector failed")),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBeNull();
			expect(stats.following).toBeNull();
			expect(stats.posts).toBeNull();
			expect(stats.ratio).toBeNull();
		});

		test("handles null values in response", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: null,
					following: null,
					posts: null,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBeNull();
			expect(stats.following).toBeNull();
			expect(stats.posts).toBeNull();
			expect(stats.ratio).toBeNull();
		});

		test("handles null values", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: null,
					following: null,
					posts: null,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBeNull();
			expect(stats.following).toBeNull();
			expect(stats.posts).toBeNull();
			expect(stats.ratio).toBeNull();
		});
	});

	describe("edge cases", () => {
		test("handles zero following count", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: 100,
					following: 0,
					posts: 10,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBe(100);
			expect(stats.following).toBe(0);
			expect(stats.posts).toBe(10);
			expect(stats.ratio).toBeNull(); // Division by zero
		});

		test("handles very large numbers", async () => {
			const page = createPageMock({
				evaluate: jest.fn<any>().mockResolvedValue({
					followers: 1500000,
					following: 10000,
					posts: 500000,
				}),
			});

			const stats = await getProfileStats(page);
			expect(stats.followers).toBe(1500000);
			expect(stats.following).toBe(10000);
			expect(stats.posts).toBe(500000);
		});
	});
});
