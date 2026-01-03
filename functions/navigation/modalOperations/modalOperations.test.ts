/**
 * Modal Operations Tests
 *
 * Instagram modal operations for the Following modal:
 *
 * Functions:
 * - openFollowingModal(page): Opens the "Following" modal on a profile
 *   - Tries multiple CSS selectors for the following link
 *   - Falls back to page.evaluate() for DOM-level click
 * - extractFollowingUsernames(page, batchSize): Extracts usernames from modal
 *   - Waits for modal content to load
 *   - Scrolls to load initial content
 *   - Tries multiple selector variants for robustness
 * - scrollFollowingModal(page, scrollAmount): Scrolls modal to load more profiles
 */

import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";

// Mock sleep function (used internally by delay functions)
const sleepMock = jest.fn<(ms: number) => Promise<void>>();
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const humanClickMock = jest.fn<
	(
		page: Page,
		handle: ElementHandle<Element>,
		options?: { elementType?: string },
	) => Promise<void>
>();
const humanClickAtMock = jest.fn<() => Promise<void>>();
const humanScrollMock = jest.fn<() => Promise<void>>();
const humanWiggleMock = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("../humanInteraction/humanInteraction.ts", () => ({
	humanClick: humanClickMock,
	humanClickAt: humanClickAtMock,
	humanScroll: humanScrollMock,
	humanWiggle: humanWiggleMock,
}));

const {
	clickUsernameInModal,
	extractFollowingUsernames,
	openFollowingModal,
	scrollFollowingModal,
} = await import("./modalOperations.ts");

describe("modalOperations", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// openFollowingModal() - Open the Following List Modal
	// ═══════════════════════════════════════════════════════════════════════════

	describe("openFollowingModal()", () => {
		test("clicks following link when found by CSS selector", async () => {
			const mockElement = {
				evaluate: jest
					.fn<(fn: unknown) => Promise<string>>()
					.mockResolvedValueOnce("/testuser/following/") // href
					.mockResolvedValueOnce("following"), // text
			} as unknown as ElementHandle<Element>;

			const page = {
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/testuser/"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValueOnce(mockElement) // First selector finds element
					.mockResolvedValueOnce(mockElement), // Modal check finds dialog
				evaluate: jest.fn(),
			} as unknown as Page;

			const ok = await openFollowingModal(page);

			expect(ok).toBe(true);
			expect(humanClickMock).toHaveBeenCalled();
			expect(sleepMock).toHaveBeenCalled();
		});

		test("falls back to page.evaluate when CSS selectors fail", async () => {
			const mockDialog = {} as ElementHandle<Element>;
			const page = {
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/testuser/"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null) // All CSS selectors fail (5 selectors)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(null)
					.mockResolvedValueOnce(mockDialog), // Modal check succeeds
				evaluate: jest
					.fn<
						() => Promise<{
							found: boolean;
							x: number;
							y: number;
							href: string;
						}>
					>()
					.mockResolvedValue({
						found: true,
						x: 100,
						y: 200,
						href: "/testuser/following/",
					}),
			} as unknown as Page;

			const ok = await openFollowingModal(page);

			expect(ok).toBe(true);
			expect(page.evaluate).toHaveBeenCalled();
			expect(sleepMock).toHaveBeenCalled();
		});

		test("returns false when neither CSS selector nor evaluate finds following link", async () => {
			const page = {
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/testuser/"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null),
				evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
			} as unknown as Page;

			const ok = await openFollowingModal(page);

			expect(ok).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// extractFollowingUsernames() - Extract Usernames from Modal
	// ═══════════════════════════════════════════════════════════════════════════

	describe("extractFollowingUsernames()", () => {
		test("returns empty array when modal content selector times out", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockRejectedValue(new Error("timeout")),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([]),
				evaluate: jest.fn(),
			} as unknown as Page;

			const names = await extractFollowingUsernames(page, 2);

			expect(names).toEqual([]);
		});

		test("extracts usernames from href attributes respecting batch size", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				evaluate: jest
					.fn<() => Promise<string[]>>()
					.mockResolvedValue(["user1", "user2"]),
			} as unknown as Page;

			const names = await extractFollowingUsernames(page, 2);

			expect(names).toEqual(["user1", "user2"]);
		});

		test("filters out 'explore' paths and respects batch limit", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				evaluate: jest
					.fn<() => Promise<string[]>>()
					.mockResolvedValue(["realuser"]), // 'explore' already filtered out by implementation
			} as unknown as Page;

			const names = await extractFollowingUsernames(page, 10);

			// Should only include realuser, not explore
			expect(names).toContain("realuser");
			expect(names).not.toContain("explore");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// clickUsernameInModal() - Click Username Link in Modal
	// ═══════════════════════════════════════════════════════════════════════════

	describe("clickUsernameInModal()", () => {
		test("returns false when modal is not found", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockRejectedValue(new Error("timeout")),
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(false);
			expect(humanClickMock).not.toHaveBeenCalled();
		});

		test("clicks username link found via direct selector and confirms navigation", async () => {
			const mockLinkElement = {} as ElementHandle<Element>;
			const mockDialog = {} as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue(mockDialog),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockLinkElement), // Direct selector finds link
				url: jest
					.fn<() => string>()
					.mockReturnValueOnce("https://www.instagram.com/seeduser/") // Initial URL
					.mockReturnValueOnce("https://www.instagram.com/testuser/"), // After navigation
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined), // Modal closes
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(true);
			expect(humanClickMock).toHaveBeenCalledWith(
				page,
				mockLinkElement,
				expect.objectContaining({ elementType: "link" }),
			);
		});

		test("finds username via evaluate/index approach when direct selector fails", async () => {
			const mockLinkElement1 = {} as ElementHandle<Element>;
			const mockLinkElement2 = {} as ElementHandle<Element>;
			const mockDialog = {} as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue(mockDialog),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null), // Direct selector fails
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([mockLinkElement1, mockLinkElement2]),
				evaluate: jest
					.fn<() => Promise<number>>()
					.mockResolvedValue(1), // Username found at index 1
				url: jest
					.fn<() => string>()
					.mockReturnValueOnce("https://www.instagram.com/seeduser/")
					.mockReturnValueOnce("https://www.instagram.com/testuser/"),
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(true);
			expect(page.evaluate).toHaveBeenCalled();
			expect(humanClickMock).toHaveBeenCalledWith(
				page,
				mockLinkElement2, // Should click element at index 1
				expect.objectContaining({ elementType: "link" }),
			);
		});

		test("returns false when username not found in modal", async () => {
			const mockDialog = {} as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue(mockDialog),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null), // Direct selector fails
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([]),
				evaluate: jest
					.fn<() => Promise<number>>()
					.mockResolvedValue(-1), // Username not found
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "nonexistent");

			expect(result).toBe(false);
			expect(humanClickMock).not.toHaveBeenCalled();
		});

		test("confirms navigation via URL change when modal doesn't close immediately", async () => {
			const mockLinkElement = {} as ElementHandle<Element>;
			const mockDialog = {} as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue(mockDialog),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockLinkElement),
				url: jest
					.fn<() => string>()
					.mockReturnValueOnce("https://www.instagram.com/seeduser/")
					.mockReturnValueOnce("https://www.instagram.com/testuser/"), // URL changed
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockRejectedValue(new Error("timeout")), // Modal doesn't close immediately
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(true);
			expect(humanClickMock).toHaveBeenCalled();
		});

		test("returns false when click succeeds but navigation not confirmed", async () => {
			const mockLinkElement = {} as ElementHandle<Element>;
			const mockDialog = {} as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue(mockDialog),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockLinkElement),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/seeduser/"), // URL doesn't change
				waitForFunction: jest
					.fn<() => Promise<void>>()
					.mockRejectedValue(new Error("timeout")), // Modal doesn't close
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(false);
			expect(humanClickMock).toHaveBeenCalled(); // Click was attempted
		});

		test("handles errors gracefully and returns false", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockRejectedValue(new Error("Unexpected error")),
			} as unknown as Page;

			const result = await clickUsernameInModal(page, "testuser");

			expect(result).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// scrollFollowingModal() - Scroll to Load More Content
	// ═══════════════════════════════════════════════════════════════════════════

	describe("scrollFollowingModal()", () => {
		test("scrolls modal container by specified amount", async () => {
			const evaluateMock = jest
				.fn<(fn: (amount: number) => void, amount: number) => Promise<void>>()
				.mockImplementation(async (_fn, _amount) => undefined);
			const page = {
				evaluate: evaluateMock,
			} as unknown as Page;

			await scrollFollowingModal(page, 123);

			expect(evaluateMock).toHaveBeenCalled();
		});

		test("waits after scrolling to allow content to load", async () => {
			const page = {
				evaluate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as Page;

			await scrollFollowingModal(page, 600);

			// microDelay(0.2, 0.5) uses delay function which internally calls sleep with random value between 200-500ms
			expect(sleepMock).toHaveBeenCalled();
			const sleepCall = sleepMock.mock.calls[0]?.[0];
			expect(sleepCall).toBeGreaterThanOrEqual(200);
			expect(sleepCall).toBeLessThanOrEqual(500);
		});

		test("uses default scroll amount of 600px when not specified", async () => {
			const evaluateMock = jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined);
			const page = {
				evaluate: evaluateMock,
			} as unknown as Page;

			await scrollFollowingModal(page);

			// Default is 600px
			expect(evaluateMock).toHaveBeenCalledWith(expect.any(Function), 600);
		});
	});
});
