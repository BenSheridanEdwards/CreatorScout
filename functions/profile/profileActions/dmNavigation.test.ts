/**
 * Unit tests for dmNavigation.ts
 * Uses real implementations - only mocks sleep to avoid delays
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock sleep to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Import after mocks are set up
const {
	navigateToProfile,
	simulateNaturalBehavior,
	findMessageButton,
	scrollToButtonIfNeeded,
	clickMessageButton,
	navigateToDmThread,
} = await import("./dmNavigation.ts");

describe("dmNavigation", () => {
	describe("navigateToProfile", () => {
		test("navigates to profile successfully", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/user/"),
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await navigateToProfile(page as unknown as Page, "testuser");

			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/testuser/",
				expect.objectContaining({
					waitUntil: "networkidle2",
					timeout: 15000,
				}),
			);
		});

		test("throws error when redirected to login page", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/accounts/login/"),
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await expect(
				navigateToProfile(page as unknown as Page, "testuser"),
			).rejects.toThrow("Not logged in - redirected to login page");
		});
	});

	describe("simulateNaturalBehavior", () => {
		test("scrolls and moves mouse naturally", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown) => Promise<void>>()
					.mockResolvedValue(undefined) as unknown as Page["evaluate"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await simulateNaturalBehavior(page as unknown as Page);

			expect(page.evaluate).toHaveBeenCalled();
			expect(page.mouse.move).toHaveBeenCalled();
		});
	});

	describe("findMessageButton", () => {
		test("finds message button when present", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<
						(fn: unknown) => Promise<{
							x: number;
							y: number;
							width: number;
							height: number;
							isVisible: boolean;
						} | null>
					>()
					.mockResolvedValue({
						x: 100,
						y: 200,
						width: 80,
						height: 30,
						isVisible: true,
					}) as unknown as Page["evaluate"],
			});

			const result = await findMessageButton(page as unknown as Page);

			expect(result).toEqual({
				x: 100,
				y: 200,
				width: 80,
				height: 30,
				isVisible: true,
			});
		});

		test("returns null when message button not found", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown) => Promise<null>>()
					.mockResolvedValue(null) as unknown as Page["evaluate"],
			});

			const result = await findMessageButton(page as unknown as Page);

			expect(result).toBeNull();
		});
	});

	describe("scrollToButtonIfNeeded", () => {
		test("does nothing when button is already visible", async () => {
			const buttonInfo = {
				x: 100,
				y: 200,
				width: 80,
				height: 30,
				isVisible: true,
			};
			const page = createPageMock({
				evaluate: jest.fn() as unknown as Page["evaluate"],
			});

			const result = await scrollToButtonIfNeeded(
				page as unknown as Page,
				buttonInfo,
			);

			expect(result).toEqual(buttonInfo);
		});

		test("scrolls when button is not visible", async () => {
			const buttonInfo = {
				x: 100,
				y: 2000,
				width: 80,
				height: 30,
				isVisible: false,
			};
			const page = createPageMock({
				evaluate: jest
					.fn<
						(
							fn: unknown,
							...args: unknown[]
						) => Promise<{
							x: number;
							y: number;
							width: number;
							height: number;
						}>
					>()
					.mockResolvedValueOnce(undefined) // scroll
					.mockResolvedValueOnce({
						x: 100,
						y: 200,
						width: 80,
						height: 30,
					}) as unknown as Page["evaluate"],
			});

			const result = await scrollToButtonIfNeeded(
				page as unknown as Page,
				buttonInfo,
			);

			expect(result).toEqual({
				x: 100,
				y: 200,
				width: 80,
				height: 30,
			});
		});
	});

	describe("clickMessageButton", () => {
		test("moves mouse in curved path and clicks button", async () => {
			const buttonInfo = {
				x: 100,
				y: 200,
				width: 80,
				height: 30,
				isVisible: true,
			};
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown) => Promise<{ x: number; y: number }>>()
					.mockResolvedValue({ x: 50, y: 50 }) as unknown as Page["evaluate"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await clickMessageButton(page as unknown as Page, buttonInfo);

			expect(page.mouse.move).toHaveBeenCalled();
			expect(page.mouse.down).toHaveBeenCalled();
			expect(page.mouse.up).toHaveBeenCalled();
		});
	});

	describe("navigateToDmThread", () => {
		test("waits when message button was clicked", async () => {
			const page = createPageMock({
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await navigateToDmThread(page as unknown as Page, "testuser", true);

			expect(page.mouse.move).toHaveBeenCalled();
		});

		test("uses fallback when message button was not clicked", async () => {
			const page = createPageMock();

			await navigateToDmThread(page as unknown as Page, "testuser", false);

			// Function should complete without errors
			expect(page).toBeDefined();
		});
	});
});
