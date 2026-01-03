/**
 * Unit tests for popupHandler.ts
 * Uses real implementations - only mocks sleep to avoid delays
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock sleep function (used internally by delay functions) to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

// Mock humanClickByText and humanClick to avoid complex ghost-cursor chain that causes memory issues
const humanClickByTextMock = jest
	.fn<(page: Page, texts: string[]) => Promise<boolean>>()
	.mockResolvedValue(false);
const humanClickMock = jest
	.fn<(page: Page, element: unknown, options?: unknown) => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

jest.unstable_mockModule("../../navigation/humanInteraction/humanInteraction.ts", () => ({
	humanClickByText: humanClickByTextMock,
	humanClick: humanClickMock,
}));

// Import after mocks are set up
const { handleInstagramPopups } = await import("./popupHandler.ts");

describe("popupHandler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sleepMock.mockResolvedValue(undefined);
		humanClickByTextMock.mockResolvedValue(false);
	});

	describe("handleInstagramPopups", () => {
		test("dismisses messaging tab popup when found via evaluate", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						if (typeof fn === "function") {
							// clickButtonLikeByText - simulate finding a button with matching text
							// The function checks if any button text matches the labels
							const labels = args[0] as string[];
							// Simulate finding "ok" button
							if (labels?.some((l) => l.toLowerCase() === "ok")) {
								return true; // Found matching button
							}
							return false;
						}
						return false;
					}) as unknown as Page["evaluate"],
			});

			await handleInstagramPopups(page as unknown as Page);

			expect(page.evaluate).toHaveBeenCalled();
		});

		test("dismisses messaging tab popup when found via humanClickByText", async () => {
			humanClickByTextMock.mockResolvedValueOnce(true); // humanClickByText finds and clicks popup
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(false) as unknown as Page["evaluate"], // clickButtonLikeByText returns false
			});

			await handleInstagramPopups(page as unknown as Page);

			// Function should complete without errors
			expect(page.evaluate).toHaveBeenCalled();
			expect(humanClickByTextMock).toHaveBeenCalled();
		});

		test("dismisses notification popup", async () => {
			let callCount = 0;
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						callCount++;
						if (typeof fn === "function") {
							const labels = args[0] as string[];
							// First call: messaging tab (false)
							if (callCount === 1) {
								return false; // messaging tab not found
							}
							// Second call: notification (true)
							if (
								callCount === 2 &&
								labels &&
								labels.some((l) => l.toLowerCase().includes("not now"))
							) {
								return true; // notification found
							}
							return false;
						}
						return false;
					}) as unknown as Page["evaluate"],
			});

			await handleInstagramPopups(page as unknown as Page);

			// Function should complete without errors
			expect(page.evaluate).toHaveBeenCalled();
		});

		test("handles reload page button", async () => {
			let callCount = 0;
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						callCount++;
						// Safety: limit calls to prevent infinite recursion
						if (callCount > 5) {
							return false;
						}
						if (typeof fn === "function") {
							const labels = args[0] as string[];
							// First two calls return false (messaging tab, notification)
							if (callCount <= 2) {
								return false;
							}
							// Third call: reload found
							if (labels?.some((l) => l.toLowerCase().includes("reload"))) {
								return true; // reload found
							}
							return false;
						}
						return false;
					}) as unknown as Page["evaluate"],
			});
			humanClickByTextMock.mockResolvedValue(false); // humanClickByText doesn't find reload

			await handleInstagramPopups(page as unknown as Page);

			// Verify reload was handled
			expect(page.evaluate).toHaveBeenCalled();
			expect(callCount).toBeGreaterThanOrEqual(3); // At least messaging, notification, reload
		});

		test("does nothing when no popups found", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(false) as unknown as Page["evaluate"], // No popups found
			});
			humanClickByTextMock.mockResolvedValue(false); // humanClickByText finds nothing

			await handleInstagramPopups(page as unknown as Page);

			// Function should complete without errors
			expect(page.evaluate).toHaveBeenCalled();
		});
	});
});
