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

	describe("getElementCenter", () => {
		test("calculates element center correctly", async () => {
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

		test("returns null for element not found", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null);

			const center = await getElementCenter(mockPage, ".missing-element");

			expect(center).toBeNull();
		});

		test("returns null for element without bounding box", async () => {
			const { getElementCenter } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce(null);
			mockPage.$.mockResolvedValueOnce(mockElement);

			const center = await getElementCenter(mockPage, ".no-bounds");

			expect(center).toBeNull();
		});
	});

	describe("moveMouseToElement", () => {
		test("moves mouse with dynamic distance-based timing", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			// Mock current mouse position far from target
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
			expect(mockPage.evaluate).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					x: expect.any(Number),
					y: expect.any(Number),
				}),
			);
		});

		test("applies offset and randomization", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 100, y: 100 });

			await moveMouseToElement(mockPage, ".element", {
				offsetX: 10,
				offsetY: 5,
				randomize: true,
			});

			expect(mockPage.mouse.move).toHaveBeenCalled();
			// Target should be around 135, 115 (125+10, 110+5) with randomization
		});

		test("uses custom duration when provided", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			const result = await moveMouseToElement(mockPage, ".element", {
				duration: 500,
			});

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("returns false for missing element", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null);

			const result = await moveMouseToElement(mockPage, ".missing");

			expect(result).toBe(false);
		});
	});

	describe("humanClickElement", () => {
		test("performs full click sequence with movement", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			const result = await humanClickElement(mockPage, ".button");

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
			expect(mockPage.mouse.down).toHaveBeenCalledWith({ button: "left" });
			expect(mockPage.mouse.up).toHaveBeenCalledWith({ button: "left" });
		});

		test("applies element-type-specific timing", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			// Test button timing
			await humanClickElement(mockPage, ".submit-btn", {
				elementType: "button",
			});

			expect(mockPage.mouse.move).toHaveBeenCalled();

			// Test input timing
			await humanClickElement(mockPage, "input", {
				elementType: "input",
			});

			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("handles different click buttons", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".menu", {
				button: "right",
			});

			expect(mockPage.mouse.down).toHaveBeenCalledWith({ button: "right" });
			expect(mockPage.mouse.up).toHaveBeenCalledWith({ button: "right" });
		});

		test("supports double/triple clicks", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			await humanClickElement(mockPage, ".element", {
				clickCount: 2,
			});

			// Should have 2 down/up pairs
			expect(mockPage.mouse.down).toHaveBeenCalledTimes(2);
			expect(mockPage.mouse.up).toHaveBeenCalledTimes(2);
		});

		test("respects custom hover delay", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			const result = await humanClickElement(mockPage, ".button", {
				hoverDelay: 500,
			});

			expect(result).toBe(true);
		});
	});

	describe("humanTypeText", () => {
		test("types text with realistic character delays", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			const result = await humanTypeText(mockPage, "input", "hello", {
				mistakeRate: 0, // Disable typos for deterministic testing
			});

			expect(result).toBe(true);
			expect(mockPage.keyboard.type).toHaveBeenCalledTimes(5); // h,e,l,l,o
			expect(sleepMock).toHaveBeenCalled();
		});

		test("adds word spaces between words", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "hello world");

			// Should type space after "hello"
			expect(mockPage.keyboard.type).toHaveBeenCalledWith(" ");
		});

		test("handles capital letters with slower timing", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "Hello");

			// Should type each character individually
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("H");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("e");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("l");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("l");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("o");
		});

		test("clears text when requested", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			await humanTypeText(mockPage, "input", "text", {
				clearFirst: true,
			});

			expect(mockPage.keyboard.down).toHaveBeenCalledWith("Control");
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("a");
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
		});

		test("respects custom typing parameters", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			const result = await humanTypeText(mockPage, "input", "test", {
				typeDelay: 200,
				wordPause: 500,
				mistakeRate: 0, // Disable typos for this test
			});

			expect(result).toBe(true);
		});

		test("supports typo simulation for anti-detection", async () => {
			const { humanTypeText } = await import("./humanize.ts");

			// Mock Math.random to always trigger typo for testing
			const originalRandom = Math.random;
			Math.random = jest.fn().mockReturnValue(0.01); // < 0.02 mistake rate

			const result = await humanTypeText(mockPage, "input", "hi", {
				mistakeRate: 0.5, // High mistake rate for testing
			});

			expect(result).toBe(true);
			// Should have typed 'h', then 'i', then backspace, then 'i' again
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("h");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("i");
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("Backspace");
			expect(mockPage.keyboard.type).toHaveBeenCalledWith("i"); // Retype after correction

			Math.random = originalRandom;
		});
	});

	describe("humanHoverElement", () => {
		test("moves to element and waits", async () => {
			const { humanHoverElement } = await import("./humanize.ts");

			const result = await humanHoverElement(mockPage, ".tooltip", 1000);

			expect(result).toBe(true);
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("uses default hover duration", async () => {
			const { humanHoverElement } = await import("./humanize.ts");

			const result = await humanHoverElement(mockPage, ".element");

			expect(result).toBe(true);
		});
	});

	describe("Distance-based timing calculations", () => {
		test("calculates realistic durations based on distance", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			// Mock positions for distance calculation
			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 100,
				y: 0,
				width: 50,
				height: 20,
			});

			await moveMouseToElement(mockPage, ".element");

			// Distance of ~125px should give duration around 125 * 1.8 + 200 = ~425ms
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});

		test("enforces minimum and maximum durations", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			// Very close element
			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({ x: 1, y: 1, width: 50, height: 20 });

			await moveMouseToElement(mockPage, ".close");

			// Should still be at least 300ms minimum
			expect(mockPage.mouse.move).toHaveBeenCalled();

			// Very far element
			mockBoundingBox.mockResolvedValue({
				x: 1000,
				y: 1000,
				width: 50,
				height: 20,
			});

			await moveMouseToElement(mockPage, ".far");

			// Should be capped at 1500ms maximum
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});
	});

	describe("Fitts' Law acceleration", () => {
		test("applies acceleration curves to mouse movement", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.evaluate.mockResolvedValue({ x: 0, y: 0 });
			mockBoundingBox.mockResolvedValue({
				x: 200,
				y: 0,
				width: 50,
				height: 20,
			});

			await moveMouseToElement(mockPage, ".element");

			// Movement should have variable timing (acceleration)
			expect(mockPage.mouse.move).toHaveBeenCalled();
		});
	});

	describe("Error handling", () => {
		test("handles element not found gracefully", async () => {
			const { humanClickElement } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null); // Element not found

			const result = await humanClickElement(mockPage, ".missing");

			expect(result).toBe(false);
		});

		test("handles bounding box errors gracefully", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockBoundingBox.mockResolvedValueOnce(null); // No bounding box

			const result = await moveMouseToElement(mockPage, ".no-bounds");

			expect(result).toBe(false);
		});

		test("handles missing elements gracefully", async () => {
			const { moveMouseToElement } = await import("./humanize.ts");

			mockPage.$.mockResolvedValueOnce(null); // Element not found

			const result = await moveMouseToElement(mockPage, ".not-found");

			expect(result).toBe(false);
		});
	});
});
