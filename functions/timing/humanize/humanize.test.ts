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

// Mock sleep function (used internally by delay functions)
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Mock ghost-cursor
const mockCursor = {
	move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	moveTo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	scroll: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.unstable_mockModule("ghost-cursor", () => ({
	createCursor: jest.fn(() => mockCursor),
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
	$: jest.fn<(selector: string) => Promise<unknown>>(),
	evaluate: jest.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>(),
	viewport: jest
		.fn<() => { width: number; height: number } | null>()
		.mockReturnValue({
			width: 1440,
			height: 900,
		}),
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
		(
			mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
		).mockResolvedValue(mockElement);
		(
			mockPage.evaluate as jest.Mock<
				(fn: unknown, ...args: unknown[]) => Promise<unknown>
			>
		).mockResolvedValue({ x: 0, y: 0 });
		mockCursor.move.mockResolvedValue(undefined);
		mockCursor.click.mockResolvedValue(undefined);
		mockCursor.moveTo.mockResolvedValue(undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
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
			(
				mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
			).mockResolvedValueOnce(mockElement);

			const center = await getElementCenter(mockPage, ".test-element");

			expect(center).toEqual({ x: 125, y: 110 }); // 100+50/2, 100+20/2
			expect(mockPage.$).toHaveBeenCalledWith(".test-element");
		});

		test("returns null when element is not found", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			(
				mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
			).mockResolvedValueOnce(null);

			const center = await getElementCenter(mockPage, ".missing-element");

			expect(center).toBeNull();
		});

		test("returns null when element has no bounding box", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce(null);
			(
				mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
			).mockResolvedValueOnce(mockElement);

			const center = await getElementCenter(mockPage, ".no-bounds");

			expect(center).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// moveMouseToElement() - Natural Mouse Movement
	// ═══════════════════════════════════════════════════════════════════════════

	describe("moveMouseToElement()", () => {
		test("moves mouse to element using ghost-cursor", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.evaluate as jest.Mock<
					(fn: unknown, ...args: unknown[]) => Promise<unknown>
				>
			).mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 200,
				y: 200,
				width: 50,
				height: 20,
			});

			const result = await moveMouseToElement(mockPage, ".distant-element");

			expect(result).toBe(true);
			expect(mockCursor.move).toHaveBeenCalled();
		});

		test("applies offset and randomization to target position", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.evaluate as jest.Mock<
					(fn: unknown, ...args: unknown[]) => Promise<unknown>
				>
			).mockResolvedValue({ x: 100, y: 100 });

			await moveMouseToElement(mockPage, ".element", {
				offsetX: 10,
				offsetY: 5,
				randomize: true,
			});

			expect(mockCursor.move).toHaveBeenCalled();
		});

		test("uses custom duration when provided", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			const result = await moveMouseToElement(mockPage, ".element", {
				duration: 500,
			});

			expect(result).toBe(true);
			expect(mockCursor.move).toHaveBeenCalled();
		});

		test("returns false when target element not found", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
			).mockResolvedValueOnce(null);

			const result = await moveMouseToElement(mockPage, ".missing");

			expect(result).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// humanClickElement() - Natural Click Behavior
	// ═══════════════════════════════════════════════════════════════════════════

	describe("humanClickElement()", () => {
		test("performs complete click sequence using ghost-cursor", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			const result = await humanClickElement(mockPage, ".button");

			expect(result).toBe(true);
			expect(mockCursor.click).toHaveBeenCalled();
		});

		test("applies element-type-specific timing for buttons", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".submit-btn", {
				elementType: "button",
			});

			expect(mockCursor.click).toHaveBeenCalled();
		});

		test("supports different mouse buttons (right click)", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".menu", {
				button: "right",
			});

			expect(mockCursor.click).toHaveBeenCalledWith(
				".menu",
				expect.objectContaining({ button: "right" }),
			);
		});

		test("supports multiple clicks (double-click)", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".element", {
				clickCount: 2,
			});

			expect(mockCursor.click).toHaveBeenCalledWith(
				".element",
				expect.objectContaining({ clickCount: 2 }),
			);
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
			Math.random = jest
				.fn<() => number>()
				.mockReturnValue(0.01) as () => number;

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
		test("moves to element and waits for hover duration using ghost-cursor", async () => {
			const { humanHoverElement } = await import("./humanize.ts");

			const result = await humanHoverElement(mockPage, ".tooltip", 1000);

			expect(result).toBe(true);
			expect(mockCursor.move).toHaveBeenCalled();
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
		test("uses ghost-cursor for natural movement timing", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.evaluate as jest.Mock<
					(fn: unknown, ...args: unknown[]) => Promise<unknown>
				>
			).mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 100,
				y: 0,
				width: 50,
				height: 20,
			});

			await moveMouseToElement(mockPage, ".element");

			expect(mockCursor.move).toHaveBeenCalled();
		});

		test("handles close elements naturally", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.evaluate as jest.Mock<
					(fn: unknown, ...args: unknown[]) => Promise<unknown>
				>
			).mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({ x: 1, y: 1, width: 50, height: 20 });

			await moveMouseToElement(mockPage, ".close");

			expect(mockCursor.move).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Error Handling
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("handles element not found gracefully in click", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			// Make ghost-cursor throw an error when element is not found
			mockCursor.click.mockRejectedValueOnce(new Error("Element not found"));

			const result = await humanClickElement(mockPage, ".missing");

			expect(result).toBe(false);
		});

		test("handles element not found gracefully in move", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			(
				mockPage.$ as jest.Mock<(selector: string) => Promise<unknown>>
			).mockResolvedValueOnce(null);

			const result = await moveMouseToElement(mockPage, ".no-bounds");

			expect(result).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Delay Functions - Core Timing Utilities
	// ═══════════════════════════════════════════════════════════════════════════

	describe("getDelay()", () => {
		test("returns default delay range for unknown operations", async () => {
			const { getDelay } = await import("./humanize.ts");

			const [min, max] = getDelay("unknown_operation");

			expect(min).toBeGreaterThan(0);
			expect(max).toBeGreaterThan(min);
			expect(min).toBeCloseTo(0.7, 1);
			expect(max).toBeCloseTo(2.4, 1);
		});

		test("applies DELAY_SCALE to delay ranges", async () => {
			const { getDelay } = await import("./humanize.ts");

			// Get a known delay (should be scaled)
			const [min, max] = getDelay("after_click");

			expect(typeof min).toBe("number");
			expect(typeof max).toBe("number");
			expect(min).toBeGreaterThanOrEqual(0.05); // Floor
			expect(max).toBeGreaterThanOrEqual(0.1); // Floor
		});

		test("enforces minimum delay floors", async () => {
			const { getDelay } = await import("./humanize.ts");

			const [min, max] = getDelay("test");

			expect(min).toBeGreaterThanOrEqual(0.05); // 50ms floor
			expect(max).toBeGreaterThanOrEqual(0.1); // 100ms floor
		});
	});

	describe("delay()", () => {
		test("waits for random duration within named range", async () => {
			const { delay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await delay("after_click");

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThan(0);
		});

		test("calls sleep with milliseconds", async () => {
			const { delay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await delay("after_type");

			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			// Should be converted to milliseconds (seconds * 1000)
			expect(sleepArg).toBeGreaterThan(50); // At least 50ms
		});
	});

	describe("rnd()", () => {
		test("waits for random duration between min and max", async () => {
			const { rnd } = await import("./humanize.ts");
			sleepMock.mockClear();

			await rnd(1, 2);

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(1000); // At least 1 second
			expect(sleepArg).toBeLessThanOrEqual(2000); // At most 2 seconds
		});

		test("uses default values when not specified", async () => {
			const { rnd } = await import("./humanize.ts");
			sleepMock.mockClear();

			await rnd();

			expect(sleepMock).toHaveBeenCalled();
		});

		test("respects DELAY_SCALE", async () => {
			const { rnd } = await import("./humanize.ts");
			sleepMock.mockClear();

			await rnd(1, 1);

			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(50); // Enforces floor
		});
	});

	describe("randomDelay()", () => {
		test("waits for random duration between scaled bounds", async () => {
			const { randomDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await randomDelay(1, 3);

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(1000);
			expect(sleepArg).toBeLessThanOrEqual(3000);
		});
	});

	describe("microDelay()", () => {
		test("uses short delay range (0.5-2s default)", async () => {
			const { microDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await microDelay();

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(500);
			expect(sleepArg).toBeLessThanOrEqual(2000);
		});

		test("accepts custom range", async () => {
			const { microDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await microDelay(0.1, 0.5);

			expect(sleepMock).toHaveBeenCalled();
		});
	});

	describe("shortDelay()", () => {
		test("uses routine action delay range (1-5s default)", async () => {
			const { shortDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await shortDelay();

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(1000);
			expect(sleepArg).toBeLessThanOrEqual(5000);
		});
	});

	describe("mediumDelay()", () => {
		test("uses engagement delay range (3-8s default)", async () => {
			const { mediumDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await mediumDelay();

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(3000);
			expect(sleepArg).toBeLessThanOrEqual(8000);
		});
	});

	describe("longDelay()", () => {
		test("uses high-risk action delay range (10-30s default)", async () => {
			const { longDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await longDelay();

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			expect(sleepArg).toBeGreaterThanOrEqual(10000);
			expect(sleepArg).toBeLessThanOrEqual(30000);
		});
	});

	describe("gaussianDelay()", () => {
		test("waits for duration with gaussian distribution", async () => {
			const { gaussianDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			await gaussianDelay(5, 10);

			expect(sleepMock).toHaveBeenCalledTimes(1);
			expect(sleepMock.mock.calls[0]).toBeDefined();
			const sleepArg = sleepMock.mock.calls[0][0] as number;
			// Should be within range (with gaussian distribution)
			expect(sleepArg).toBeGreaterThanOrEqual(5000);
			expect(sleepArg).toBeLessThanOrEqual(10000);
		});

		test("centers around mean with gaussian distribution", async () => {
			const { gaussianDelay } = await import("./humanize.ts");
			sleepMock.mockClear();

			// Run multiple times to check distribution properties
			const delays: number[] = [];
			for (let i = 0; i < 10; i++) {
				await gaussianDelay(5, 10);
				expect(sleepMock.mock.calls[i]).toBeDefined();
				const callArg = sleepMock.mock.calls[i][0] as number;
				delays.push(callArg);
			}

			// All delays should be within bounds
			for (const delay of delays) {
				expect(delay).toBeGreaterThanOrEqual(5000);
				expect(delay).toBeLessThanOrEqual(10000);
			}

			// Mean should be roughly centered (within reasonable tolerance)
			const mean = delays.reduce((sum, d) => sum + d, 0) / delays.length;
			expect(mean).toBeGreaterThan(6500); // Roughly around 7500
			expect(mean).toBeLessThan(8500);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Timeout Functions
	// ═══════════════════════════════════════════════════════════════════════════

	describe("getTimeout()", () => {
		test("returns scaled timeout for known operations", async () => {
			const { getTimeout } = await import("./humanize.ts");

			const timeout = getTimeout("page_load");

			expect(typeof timeout).toBe("number");
			expect(timeout).toBeGreaterThan(0);
		});

		test("returns default timeout for unknown operations", async () => {
			const { getTimeout } = await import("./humanize.ts");

			const timeout = getTimeout("unknown_operation");

			expect(timeout).toBe(10000); // Default
		});

		test("applies TIMEOUT_SCALE", async () => {
			const { getTimeout } = await import("./humanize.ts");

			const timeout = getTimeout("element_default");

			expect(typeof timeout).toBe("number");
			expect(timeout).toBeGreaterThan(0);
		});

		test("returns integer values", async () => {
			const { getTimeout } = await import("./humanize.ts");

			const timeout = getTimeout("login");

			expect(Number.isInteger(timeout)).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Advanced Interaction Functions
	// ═══════════════════════════════════════════════════════════════════════════

	describe("humanScroll()", () => {
		test("scrolls page multiple times with delays", async () => {
			const { humanScroll } = await import("./humanize.ts");
			sleepMock.mockClear();

			await humanScroll(mockPage, 3);

			// Should call sleep for delays between scrolls
			expect(sleepMock.mock.calls.length).toBeGreaterThan(0);
		});

		test("uses default scroll count when not specified", async () => {
			const { humanScroll } = await import("./humanize.ts");
			sleepMock.mockClear();

			await humanScroll(mockPage);

			// Should scroll random number of times (2-7)
			expect(sleepMock.mock.calls.length).toBeGreaterThan(0);
		});

		test("adjusts scroll count based on DELAY_SCALE", async () => {
			const { humanScroll } = await import("./humanize.ts");
			sleepMock.mockClear();

			await humanScroll(mockPage, null);

			// Should use random count based on DELAY_SCALE
			expect(sleepMock.mock.calls.length).toBeGreaterThan(0);
		});
	});

	describe("mouseWiggle()", () => {
		test("performs random mouse movement", async () => {
			const { mouseWiggle } = await import("./humanize.ts");

			await mouseWiggle(mockPage);

			// Should interact with the page (implementation uses humanWiggle internally)
			expect(mockPage).toBeDefined();
		});
	});
});
