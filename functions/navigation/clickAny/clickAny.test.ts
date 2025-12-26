/**
 * clickAny Function Tests
 *
 * The clickAny() function provides a robust way to click buttons by text content:
 *
 * Purpose:
 * - Click the first button matching any of the provided text labels
 * - Useful for handling cookie consent, popups, and dynamic UI elements
 * - Falls through multiple options until one succeeds
 *
 * Behavior:
 * 1. Iterates through provided text labels in order
 * 2. Searches for button elements containing each text
 * 3. Clicks the first match found and waits briefly
 * 4. Returns true if any click succeeded, false if none found
 */

import { jest } from "@jest/globals";
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";

const sleepMock = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const humanLikeClickHandleMock = jest.fn();
jest.unstable_mockModule("../humanClick/humanClick.ts", () => ({
	humanLikeClickHandle: humanLikeClickHandleMock,
}));

const { clickAny } = await import("./clickAny.ts");

describe("clickAny", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Core Functionality: Button Search
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Button search behavior", () => {
		test("searches for button using page.evaluate with text content", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: false }),
			});

			await clickAny(page, ["Accept"]);

			expect(page.evaluate).toHaveBeenCalled();
		});

		test("tries each text label in order until one is found", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValueOnce({ found: false }) // First fails
					.mockResolvedValueOnce({ found: false }) // Second fails
					.mockResolvedValueOnce({ found: true, tagName: "BUTTON", text: "Option3" }), // Third succeeds
			});

			const result = await clickAny(page, ["Option1", "Option2", "Option3"]);

			expect(result).toBe(true);
			expect(page.evaluate).toHaveBeenCalledTimes(3);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Success Case: Element Found and Clicked
	// ═══════════════════════════════════════════════════════════════════════════

	describe("When button element is found", () => {
		test("clicks the element and returns true", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: true, tagName: "BUTTON", text: "clickable" }),
			});

			const result = await clickAny(page, ["clickable"]);

			expect(result).toBe(true);
			expect(page.evaluate).toHaveBeenCalled();
		});

		test("clicks with a brief delay for natural timing", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: true, tagName: "BUTTON", text: "text" }),
			});

			await clickAny(page, ["text"]);

			expect(sleepMock).toHaveBeenCalledWith(500);
		});

		test("waits after clicking to allow UI to settle", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: true, tagName: "BUTTON", text: "Accept" }),
			});

			await clickAny(page, ["Accept"]);

			expect(sleepMock).toHaveBeenCalledWith(500);
		});

		test("stops searching after first successful click", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: true, tagName: "BUTTON", text: "First" }),
			});

			await clickAny(page, ["First", "Second", "Third"]);

			// Should only call once since first option succeeds
			expect(sleepMock).toHaveBeenCalledTimes(1);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Failure Case: No Elements Found
	// ═══════════════════════════════════════════════════════════════════════════

	describe("When no button elements are found", () => {
		test("returns false when single selector finds nothing", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: false }),
				$: jest.fn<() => Promise<null>>()
					.mockResolvedValue(null),
			});

			const result = await clickAny(page, ["nonexistent"]);

			expect(result).toBe(false);
			expect(page.evaluate).toHaveBeenCalled();
		});

		test("returns false after exhausting all provided text options", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: false }),
				$: jest.fn<() => Promise<null>>()
					.mockResolvedValue(null),
			});

			const result = await clickAny(page, ["Option1", "Option2", "Option3"]);

			expect(result).toBe(false);
			// Should try page.evaluate for each text
			expect(page.evaluate).toHaveBeenCalledTimes(3);
		});

		test("does not call sleep when no element is clicked", async () => {
			const page = createPageMock({
				evaluate: jest.fn<() => Promise<{ found: boolean }>>()
					.mockResolvedValue({ found: false }),
				$: jest.fn<() => Promise<null>>()
					.mockResolvedValue(null),
			});

			await clickAny(page, ["missing"]);

			expect(sleepMock).not.toHaveBeenCalled();
		});
	});
});
