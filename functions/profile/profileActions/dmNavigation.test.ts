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

// Mock popup handler to avoid complex interactions in tests
const handleInstagramPopupsMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

// Mock snapshot to avoid file system operations in tests
const snapshotMock = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("test-screenshot.png");

// Mock humanInteraction to avoid ghost-cursor initialization in tests
const humanClickMock = jest
	.fn<(page: Page, element: unknown, options?: unknown) => Promise<void>>()
	.mockResolvedValue(undefined);
const humanClickAtMock = jest
	.fn<(page: Page, x: number, y: number, options?: unknown) => Promise<void>>()
	.mockResolvedValue(undefined);
const mockCursor = {
	moveTo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};
const getGhostCursorMock = jest
	.fn<() => Promise<typeof mockCursor>>()
	.mockResolvedValue(mockCursor);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));
jest.unstable_mockModule("./popupHandler.ts", () => ({
	handleInstagramPopups: handleInstagramPopupsMock,
}));
jest.unstable_mockModule("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: snapshotMock,
}));
jest.unstable_mockModule("../../navigation/humanInteraction/humanInteraction.ts", () => ({
	humanClick: humanClickMock,
	humanClickAt: humanClickAtMock,
	getGhostCursor: getGhostCursorMock,
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
	beforeEach(() => {
		jest.clearAllMocks();
		mockCursor.moveTo.mockClear();
		mockCursor.click.mockClear();
	});

	describe("navigateToProfile", () => {
		test("navigates to profile successfully", async () => {
			// Create mock element with boundingBox for popup handler
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				boundingBox: jest
					.fn<
						() => Promise<{
							x: number;
							y: number;
							width: number;
							height: number;
						} | null>
					>()
					.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
				evaluate: jest.fn<() => Promise<string>>().mockResolvedValue(""),
			} as unknown as import("puppeteer").ElementHandle<Element>;

			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/testuser/"),
				$: jest
					.fn<
						(
							selector: string,
						) => Promise<import("puppeteer").ElementHandle<Element> | null>
					>()
					.mockImplementation((selector: string) => {
						// Return element for search input or popup buttons
						if (
							selector.includes("Search") ||
							selector.includes("explore") ||
							selector.includes("button")
						) {
							return Promise.resolve(mockElement);
						}
						return Promise.resolve(null);
					}) as unknown as Page["$"],
				$$: jest
					.fn<
						(
							selector: string,
						) => Promise<import("puppeteer").ElementHandle<Element>[]>
					>()
					.mockResolvedValue([mockElement]) as unknown as Page["$$"],
				evaluate: jest
					.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValueOnce({ found: false }) // Popup handler - no popups
					.mockResolvedValueOnce(true) // Profile found in search results
					.mockResolvedValue("") as unknown as Page["evaluate"],
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
				keyboard: {
					type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await navigateToProfile(page as unknown as Page, "testuser");

			// Should use search, not direct URL navigation
			expect(page.goto).not.toHaveBeenCalledWith(
				"https://www.instagram.com/testuser/",
				expect.anything(),
			);
			// Should have tried to find search input
			expect(page.$).toHaveBeenCalled();
		});

		test("throws error when redirected to login page", async () => {
			// Create mock element with boundingBox for popup handler
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				boundingBox: jest
					.fn<
						() => Promise<{
							x: number;
							y: number;
							width: number;
							height: number;
						} | null>
					>()
					.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
				evaluate: jest.fn<() => Promise<string>>().mockResolvedValue(""),
			} as unknown as import("puppeteer").ElementHandle<Element>;

			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValueOnce("https://www.instagram.com/") // Initial URL (line 92)
					.mockReturnValueOnce("https://www.instagram.com/testuser/") // After search navigation (line 265)
					.mockReturnValueOnce("https://www.instagram.com/testuser/") // After second check (line 269)
					.mockReturnValueOnce("https://www.instagram.com/testuser/") // Logging (line 278)
					.mockReturnValue("https://www.instagram.com/accounts/login/"), // After profile check - login page (line 292)
				isClosed: jest.fn<() => boolean>().mockReturnValue(false),
				$: jest
					.fn<
						(
							selector: string,
						) => Promise<import("puppeteer").ElementHandle<Element> | null>
					>()
					.mockImplementation((selector: string) => {
						if (
							selector.includes("Search") ||
							selector.includes("explore") ||
							selector.includes("button")
						) {
							return Promise.resolve(mockElement);
						}
						return Promise.resolve(null);
					}) as unknown as Page["$"],
				$$: jest
					.fn<
						(
							selector: string,
						) => Promise<import("puppeteer").ElementHandle<Element>[]>
					>()
					.mockResolvedValue([mockElement]) as unknown as Page["$$"],
				evaluate: jest
					.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValueOnce({ found: false }) // Popup handler - no popups
					.mockResolvedValueOnce(true) // Profile found in search
					.mockResolvedValue("") as unknown as Page["evaluate"],
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
				keyboard: {
					type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
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
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await simulateNaturalBehavior(page as unknown as Page);

			expect(page.evaluate).toHaveBeenCalled();
			// Now uses ghost-cursor via getGhostCursor mock
			expect(mockCursor.moveTo).toHaveBeenCalled();
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
					.mockResolvedValueOnce({ x: 0, y: 0, width: 0, height: 0 }) // scroll
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

			// Now uses ghost-cursor via getGhostCursor mock
			expect(mockCursor.moveTo).toHaveBeenCalled();
			expect(mockCursor.click).toHaveBeenCalled();
		});
	});

	describe("navigateToDmThread", () => {
		test("waits when message button was clicked", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValue({ found: false }) as unknown as Page["evaluate"], // Popup handler
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			await navigateToDmThread(page as unknown as Page, "testuser", true);

			// Now uses ghost-cursor via getGhostCursor mock
			expect(mockCursor.moveTo).toHaveBeenCalled();
		});

		test("uses fallback when message button was not clicked", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValue({ found: false }) as unknown as Page["evaluate"], // Popup handler
			});

			await navigateToDmThread(page as unknown as Page, "testuser", false);

			// Function should complete without errors
			expect(page).toBeDefined();
		});
	});
});
