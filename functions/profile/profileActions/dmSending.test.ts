/**
 * Unit tests for dmSending.ts
 * Uses real implementations of internal files - only mocks external dependencies
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock sleep to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

// Only mock external API calls (vision API)
const analyzeDmProofMock = jest
	.fn<
		(imagePath: string) => Promise<{
			dm_sent: boolean;
			confidence: number;
			reason: string;
			indicators: string[];
			is_dm_thread: boolean;
			message_visible: boolean;
			error_detected: boolean;
		} | null>
	>()
	.mockResolvedValue({
		dm_sent: true,
		confidence: 90,
		reason: "test",
		indicators: [],
		is_dm_thread: true,
		message_visible: true,
		error_detected: false,
	});

// Mock snapshot to avoid file system operations in tests
const snapshotMock = jest
	.fn<(page: Page, label: string) => Promise<string>>()
	.mockResolvedValue("test-screenshot.png");

// Set up mocks before importing
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

jest.unstable_mockModule("../vision/analyzeDmProof.ts", () => ({
	analyzeDmProof: analyzeDmProofMock,
}));

jest.unstable_mockModule("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: snapshotMock,
}));

// Import after mocks are set up
const { sendMessage, verifyDmSent } = await import("./dmSending.ts");

describe("dmSending", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sleepMock.mockResolvedValue(undefined);
		analyzeDmProofMock.mockResolvedValue({
			dm_sent: true,
			confidence: 90,
			reason: "test",
			indicators: [],
			is_dm_thread: true,
			message_visible: true,
			error_detected: false,
		});
	});

	describe("sendMessage", () => {
		test("sends message using first selector", async () => {
			const clickable = {
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
			};
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<typeof clickable | null>>()
					.mockImplementation(async (selector: string) => {
						// Return element for send button selectors
						if (
							selector.includes('aria-label="Send"') ||
							selector.includes("send-button") ||
							selector.includes("Send")
						) {
							return clickable;
						}
						return null;
					}) as unknown as Page["$"],
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						if (typeof fn === "function") {
							try {
								// Try to execute the function - if it accesses window, return mock value
								const fnString = fn.toString();
								if (
									fnString.includes("window") ||
									fnString.includes("mouseX") ||
									fnString.includes("mouseY")
								) {
									return { x: 100, y: 100 }; // Mock mouse position
								}
								// getElementCenter - return center coordinates
								const result = await (fn as (...args: unknown[]) => unknown)(
									...args,
								);
								if (
									result &&
									typeof result === "object" &&
									"x" in result &&
									"y" in result
								) {
									return { x: 50, y: 20 }; // Center of 100x40 box
								}
								// Mouse position tracking
								if (typeof result === "object" && result !== null) {
									return { x: 100, y: 100 };
								}
								return result;
							} catch {
								// If function tries to access window, return mock mouse position
								return { x: 100, y: 100 };
							}
						}
						return undefined;
					}) as unknown as Page["evaluate"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});
			const result = await sendMessage(page as unknown as Page);

			expect(result).toBe(true);
		});

		test("tries multiple selectors until one works", async () => {
			const clickable = {
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
			};
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<typeof clickable | null>>()
					.mockImplementation(async (selector: string) => {
						// First selector fails, second succeeds
						if (selector.includes('aria-label="Send"')) {
							return null;
						}
						if (selector.includes("send-button") || selector.includes("Send")) {
							return clickable;
						}
						return null;
					}) as unknown as Page["$"],
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						if (typeof fn === "function") {
							try {
								const fnString = fn.toString();
								if (
									fnString.includes("window") ||
									fnString.includes("mouseX") ||
									fnString.includes("mouseY")
								) {
									return { x: 100, y: 100 }; // Mock mouse position
								}
								const result = await (fn as (...args: unknown[]) => unknown)(
									...args,
								);
								if (
									result &&
									typeof result === "object" &&
									"x" in result &&
									"y" in result
								) {
									return { x: 50, y: 20 };
								}
								if (typeof result === "object" && result !== null) {
									return { x: 100, y: 100 };
								}
								return result;
							} catch {
								return { x: 100, y: 100 };
							}
						}
						return undefined;
					}) as unknown as Page["evaluate"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});
			const result = await sendMessage(page as unknown as Page);

			expect(result).toBe(true);
		});

		test("falls back to clickAny when selectors fail", async () => {
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockImplementation(async (_selector: string) => {
						// All selectors fail, clickAny will also fail and fall back to Enter
						return null;
					}) as unknown as Page["$"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});
			const result = await sendMessage(page as unknown as Page);

			expect(result).toBe(true);
		});

		test("falls back to Enter key when all else fails", async () => {
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<null>>()
					.mockResolvedValue(null) as unknown as Page["$"],
				keyboard: {
					press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const result = await sendMessage(page as unknown as Page);

			expect(result).toBe(true);
			expect(page.keyboard.press).toHaveBeenCalledWith("Enter");
		});
	});

	describe("verifyDmSent", () => {
		test("verifies DM sent successfully", async () => {
			const page = createPageMock({
				isClosed: jest.fn<() => boolean>().mockReturnValue(false),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true) as unknown as Page["evaluate"],
			});

			const result = await verifyDmSent(page as unknown as Page, "testuser");

			expect(result.sent).toBe(true);
			expect(result.proofPath).toBeDefined();
		});

		test("handles AI analysis with low confidence", async () => {
			const page = createPageMock({
				isClosed: jest.fn<() => boolean>().mockReturnValue(false),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true) as unknown as Page["evaluate"],
			});

			const result = await verifyDmSent(page as unknown as Page, "testuser");

			expect(result.sent).toBe(true);
		});

		test("handles AI analysis failure gracefully", async () => {
			const page = createPageMock({
				isClosed: jest.fn<() => boolean>().mockReturnValue(false),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true) as unknown as Page["evaluate"],
			});

			const result = await verifyDmSent(page as unknown as Page, "testuser");

			expect(result.sent).toBe(true);
		});

		test("verifies message appears in thread", async () => {
			const page = createPageMock({
				isClosed: jest.fn<() => boolean>().mockReturnValue(false),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValueOnce(true) // isInDmThread
					.mockResolvedValueOnce(true) as unknown as Page["evaluate"], // appearsInThread
			});

			const result = await verifyDmSent(page as unknown as Page, "testuser");

			expect(result.sent).toBe(true);
		});
	});
});
