/**
 * Unit tests for dmInput.ts
 * Uses real implementations - only mocks sleep to avoid delays
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock sleep to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

// Mock humanClickByText to avoid complex humanClick chain that causes memory issues
const humanClickByTextMock = jest
	.fn<(page: Page, texts: string[]) => Promise<boolean>>()
	.mockResolvedValue(false);

// Mock popup handler to avoid complex interactions
const handleInstagramPopupsMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

jest.unstable_mockModule(
	"../../navigation/humanInteraction/humanInteraction.ts",
	() => ({
		humanClickByText: humanClickByTextMock,
	}),
);

jest.unstable_mockModule("./popupHandler.ts", () => ({
	handleInstagramPopups: handleInstagramPopupsMock,
}));

// Import after mocks are set up
const { findMessageInput, typeMessage } = await import("./dmInput.ts");

describe("dmInput", () => {
	describe("findMessageInput", () => {
		test("finds message input with first selector", async () => {
			const clickable = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			};
			const page = createPageMock({
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockResolvedValue(clickable),
				$: jest
					.fn<() => Promise<typeof clickable>>()
					.mockResolvedValue(clickable),
			});

			const result = await findMessageInput(page as unknown as Page);

			expect(result).toBe(
				'div[role="textbox"][data-lexical-editor="true"][aria-label="Message"]',
			);
		});

		test("tries multiple selectors until one works", async () => {
			const clickable = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			};
			const page = createPageMock({
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockResolvedValue(null)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(clickable),
				$: jest
					.fn<() => Promise<typeof clickable | null>>()
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(clickable),
			});

			const result = await findMessageInput(page as unknown as Page);

			expect(result).toBe('div[role="textbox"][aria-label="Message"]');
		});

		test("returns null when no input found", async () => {
			const page = createPageMock({
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockResolvedValue(null),
				$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			});

			const result = await findMessageInput(page as unknown as Page);

			expect(result).toBeNull();
		});
	});

	describe("typeMessage", () => {
		test("types message successfully", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true) as unknown as Page["evaluate"],
				keyboard: {
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const result = await typeMessage(
				page as unknown as Page,
				'div[role="textbox"]',
				"testuser",
			);

			expect(result).toBe(true);
			expect(page.keyboard.down).toHaveBeenCalledWith("Control");
			expect(page.keyboard.press).toHaveBeenCalledWith("a");
		});

		test("returns false when text not present after typing", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(false) as unknown as Page["evaluate"],
				keyboard: {
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const result = await typeMessage(
				page as unknown as Page,
				'div[role="textbox"]',
				"testuser",
			);

			expect(result).toBe(false);
		});

		test("handles errors gracefully", async () => {
			const page = createPageMock({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true) as unknown as Page["evaluate"],
				keyboard: {
					down: jest
						.fn<() => Promise<void>>()
						.mockRejectedValue(new Error("Test error")),
					press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const result = await typeMessage(
				page as unknown as Page,
				'div[role="textbox"]',
				"testuser",
			);

			expect(result).toBe(false);
		});
	});
});
