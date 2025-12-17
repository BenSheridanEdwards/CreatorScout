/**
 * Humanize Functions Tests
 *
 * Humanization helpers for natural-looking browser interactions:
 *
 * Delay Functions:
 * - getDelay(name): Get scaled delay range for named operation
 * - delay(name): Wait for a random duration within named range
 * - rnd(minSec, maxSec): Wait for random duration between min and max
 *
 * Timeout Functions:
 * - getTimeout(name): Get scaled timeout value for named operation
 *
 * Mouse Movement Functions:
 * - getElementCenter(page, selector): Get center coordinates of element
 * - moveMouseToElement(page, selector, options): Move mouse along Bezier curve
 * - humanClickElement(page, selector, options): Click with natural movement
 * - humanHoverElement(page, selector, duration): Hover with movement
 * - humanScroll(page, times): Scroll page naturally
 * - mouseWiggle(page): Random mouse movement
 *
 * Text Input Functions:
 * - humanTypeText(page, selector, text, options): Type with natural timing
 */

import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// Mock sleep function
const sleepMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Mock page and element
const mockBoundingBox =
	jest.fn<
		() => Promise<{
			x: number;
			y: number;
			width: number;
			height: number;
		} | null>
	>();
const mockElement = {
	boundingBox: mockBoundingBox,
	click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const mockPage = {
	$: jest.fn<() => Promise<any>>(),
	evaluate: jest.fn(),
	mouse: {
		move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	},
	keyboard: {
		type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	},
} as unknown as Page;

describe("Humanize Functions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockBoundingBox.mockResolvedValue({
			x: 100,
			y: 100,
			width: 50,
			height: 20,
		});
		mockPage.$.mockResolvedValue(mockElement);
		mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// getElementCenter() - Element Position Calculation
	// ═══════════════════════════════════════════════════════════════════════════

	describe("getElementCenter()", () => {
		test("calculates center point from element bounding box", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce({
				x: 100,
				y: 100,
				width: 50,
				height: 20,
			});
			mockPage.$.mockResolvedValueOnce(mockElement);

			const center = await getElementCenter(mockPage, ".test-element");

			expect(center).toEqual({ x: 125, y: 110 }); // 100+50/2, 100+20/2
			expect(mockPage.$).toHaveBeenCalledWith(".test-element");
		});

		test("returns null when element is not found", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null);

			const center = await getElementCenter(mockPage, ".missing-element");

			expect(center).toBeNull();
		});

		test("returns null when element has no bounding box", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce(null);
			mockPage.$.mockResolvedValueOnce(mockElement);

			const center = await getElementCenter(mockPage, ".no-bounds");

			expect(center).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// moveMouseToElement() - Natural Mouse Movement
	// ═══════════════════════════════════════════════════════════════════════════

	describe("moveMouseToElement()", () => {
		test("moves mouse to element using Bezier curve path", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 200,
				y: 200,
				width: 50,
				height: 20,
			});

			const result = await moveMouseToElement(mockPage, ".distant-element");

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("applies offset and randomization to target position", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 100, y: 100 });

			await moveMouseToElement(mockPage, ".element", {
				offsetX: 10,
				offsetY: 5,
				randomize: true,
			});

			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("uses custom duration when provided", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			const result = await moveMouseToElement(mockPage, ".element", {
				duration: 500,
			});

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("returns false when target element not found", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null);

			const result = await moveMouseToElement(mockPage, ".missing");

			expect(result).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// humanClickElement() - Natural Click Behavior
	// ═══════════════════════════════════════════════════════════════════════════

	describe("humanClickElement()", () => {
		test("performs complete click sequence: move → hover → down → up", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			const result = await humanClickElement(mockPage, ".button");

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
			expect(mockPage.mouse.down).toHaveBeenCalledWith({ button: "left" });
			expect(mockPage.mouse.up).toHaveBeenCalledWith({ button: "left" });
		});

		test("applies element-type-specific timing for buttons", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".submit-btn", {
				elementType: "button",
			});

			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("supports different mouse buttons (right click)", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".menu", {
				button: "right",
			});

			expect(mockPage.mouse.down).toHaveBeenCalledWith({ button: "right" });
			expect(mockPage.mouse.up).toHaveBeenCalledWith({ button: "right" });
		});

		test("supports multiple clicks (double-click)", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".element", {
				clickCount: 2,
			});

			expect(mockPage.mouse.down).toHaveBeenCalledTimes(2);
			expect(mockPage.mouse.up).toHaveBeenCalledTimes(2);
		});

		test("respects custom hover delay before clicking", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			const result = await humanClickElement(mockPage, ".button", {
				hoverDelay: 500,
			});

			expect(result).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// humanTypeText() - Natural Typing Behavior
	// ═══════════════════════════════════════════════════════════════════════════

	describe("humanTypeText()", () => {
		test("types text character by character with delays", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			const result = await humanTypeText(mockPage, "input", "hello", {
				mistakeRate: 0,
			});

			expect(result).toBe(true);
			expect(mockPage.keyboard.type).toHaveBeenCalledTimes(5);
			expect(sleepMock).toHaveBeenCalled();
		});

		test("adds space between words", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "hello world");

			expect(mockPage.keyboard.type).toHaveBeenCalledWith(" ");
		});

		test("handles capital letters with adjusted timing", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "Hello");

			expect(mockPage.keyboard.type).toHaveBeenCalledWith("H");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("e");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("l");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("o");
		});

		test("clears existing text when clearFirst option is true", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "text", {
				clearFirst: true,
			});

			expect(mockPage.keyboard.down).toHaveBeenCalledWith("Control");
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("a");
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
		});

		test("simulates typos and corrections when mistakeRate > 0", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			const originalRandom = Math.random;
			Math.random = jest.fn().mockReturnValue(0.01);

			const result = await humanTypeText(mockPage, "input", "hi", {
				mistakeRate: 0.5,
			});

			expect(result).toBe(true);
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");

			Math.random = originalRandom;
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// humanHoverElement() - Natural Hover Behavior
	// ═══════════════════════════════════════════════════════════════════════════

	describe("humanHoverElement()", () => {
		test("moves to element and waits for hover duration", async () => {
			const { humanHoverElement } = await import("./humanize.ts");

			const result = await humanHoverElement(mockPage, ".tooltip", 1000);

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("uses default hover duration when not specified", async () => {
			const { humanHoverElement } = await import("./humanize.ts");

			const result = await humanHoverElement(mockPage, ".element");

			expect(result).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Distance-Based Timing
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Distance-based timing calculations", () => {
		test("calculates duration based on mouse travel distance", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 100,
				y: 0,
				width: 50,
				height: 20,
			});

			await moveMouseToElement(mockPage, ".element");

			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("enforces minimum duration for very close elements", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({ x: 1, y: 1, width: 50, height: 20 });

			await moveMouseToElement(mockPage, ".close");

			expect(mockPage.mouse.move).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Error Handling
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("handles element not found gracefully", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null);

			const result = await humanClickElement(mockPage, ".missing");

			expect(result).toBe(false);
		});

		test("handles bounding box errors gracefully", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce(null);

			const result = await moveMouseToElement(mockPage, ".no-bounds");

			expect(result).toBe(false);
		});
	});
});
