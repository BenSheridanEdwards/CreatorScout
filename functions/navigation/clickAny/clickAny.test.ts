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

const { clickAny } = await import("./clickAny.ts");

describe("clickAny", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Core Functionality: Button Search
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Button search behavior", () => {
		test("searches for button using XPath with text content", async () => {
			const page = createPageMock();

			await clickAny(page, ["Accept"]);

			expect(page.$).toHaveBeenCalledWith(
				'xpath//button[contains(normalize-space(), "Accept")]',
			);
		});

		test("tries each text label in order until one is found", async () => {
			const page = createPageMock({
				$: jest
					.fn<() => Promise<{ click: () => Promise<void> } | null>>()
					.mockResolvedValueOnce(null) // First selector fails
					.mockResolvedValueOnce(null) // Second selector fails
					.mockResolvedValue({
						click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					}), // Third succeeds
			});

			const result = await clickAny(page, ["Option1", "Option2", "Option3"]);

			expect(result).toBe(true);
			expect(page.$).toHaveBeenCalledTimes(3);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Success Case: Element Found and Clicked
	// ═══════════════════════════════════════════════════════════════════════════

	describe("When button element is found", () => {
		test("clicks the element and returns true", async () => {
			const page = createPageWithElementMock();

			const result = await clickAny(page, ["clickable"]);

			expect(result).toBe(true);
			expect(page.$).toHaveBeenCalledWith(
				'xpath//button[contains(normalize-space(), "clickable")]',
			);
		});

		test("clicks with a brief delay for natural timing", async () => {
			const clickMock = jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined);
			const page = createPageMock({
				$: jest
					.fn<() => Promise<{ click: () => Promise<void> } | null>>()
					.mockResolvedValue({ click: clickMock }),
			});

			await clickAny(page, ["text"]);

			expect(clickMock).toHaveBeenCalledWith({ delay: 10 });
		});

		test("waits after clicking to allow UI to settle", async () => {
			const page = createPageWithElementMock();

			await clickAny(page, ["Accept"]);

			expect(sleepMock).toHaveBeenCalledWith(200);
		});

		test("stops searching after first successful click", async () => {
			const clickMock = jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined);
			const page = createPageMock({
				$: jest
					.fn<() => Promise<{ click: () => Promise<void> } | null>>()
					.mockResolvedValue({ click: clickMock }),
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
			const page = createPageMock();

			const result = await clickAny(page, ["nonexistent"]);

			expect(result).toBe(false);
			expect(page.$).toHaveBeenCalledWith(
				'xpath//button[contains(normalize-space(), "nonexistent")]',
			);
		});

		test("returns false after exhausting all provided text options", async () => {
			const page = createPageMock();

			const result = await clickAny(page, [
				"Option1",
				"Option2",
				"Option3",
			]);

			expect(result).toBe(false);
			expect(page.$).toHaveBeenCalledTimes(3);
		});

		test("does not call sleep when no element is clicked", async () => {
			const page = createPageMock();

			await clickAny(page, ["missing"]);

			expect(sleepMock).not.toHaveBeenCalled();
		});
	});
});
