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

const sleepMock = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const humanLikeClickHandleMock = jest.fn<
	(page: Page, handle: ElementHandle<Element>) => Promise<void>
>();
jest.unstable_mockModule("../humanClick/humanClick.ts", () => ({
	humanLikeClickHandle: humanLikeClickHandleMock,
}));

const { extractFollowingUsernames, openFollowingModal, scrollFollowingModal } =
	await import("./modalOperations.ts");

describe("modalOperations", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// openFollowingModal() - Open the Following List Modal
	// ═══════════════════════════════════════════════════════════════════════════

	describe("openFollowingModal()", () => {
		test("clicks following link when found by CSS selector", async () => {
			const page = {
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				evaluate: jest.fn(),
			} as unknown as Page;

			const ok = await openFollowingModal(page);

			expect(ok).toBe(true);
			expect(humanLikeClickHandleMock).toHaveBeenCalled();
			expect(sleepMock).toHaveBeenCalledWith(3000);
		});

		test("falls back to page.evaluate when CSS selectors fail", async () => {
			const page = {
				$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
				evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
			} as unknown as Page;

			const ok = await openFollowingModal(page);

			expect(ok).toBe(true);
			expect(page.evaluate).toHaveBeenCalled();
			expect(sleepMock).toHaveBeenCalledWith(3000);
		});

		test("returns false when neither CSS selector nor evaluate finds following link", async () => {
			const page = {
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
			const makeItem = (href: string) =>
				({
					evaluate: jest
						.fn<
							(
								fn: (el: { getAttribute: () => string }) => string,
							) => Promise<string>
						>()
						.mockImplementation(async (fn) => fn({ getAttribute: () => href })),
				}) as unknown as ElementHandle<Element>;

			const items = [
				makeItem("/user1/"),
				makeItem("/user2/"),
				makeItem("/explore/"), // Should be filtered out
			];

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValueOnce(items)
					.mockResolvedValue([]),
				evaluate: jest.fn(),
			} as unknown as Page;

			const names = await extractFollowingUsernames(page, 2);

			expect(names).toEqual(["user1", "user2"]);
		});

		test("filters out 'explore' paths and respects batch limit", async () => {
			const makeItem = (href: string) =>
				({
					evaluate: jest
						.fn()
						.mockImplementation(async (fn: any) =>
							fn({ getAttribute: () => href }),
						),
				}) as unknown as ElementHandle<Element>;

			const items = [
				makeItem("/explore/tags/"),
				makeItem("/realuser/"),
			];

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValueOnce(items)
					.mockResolvedValue([]),
				evaluate: jest.fn(),
			} as unknown as Page;

			const names = await extractFollowingUsernames(page, 10);

			// Should only include realuser, not explore
			expect(names).toContain("realuser");
			expect(names).not.toContain("explore");
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
				evaluate: jest.fn().mockResolvedValue(undefined),
			} as unknown as Page;

			await scrollFollowingModal(page, 600);

			expect(sleepMock).toHaveBeenCalledWith(400);
		});

		test("uses default scroll amount of 600px when not specified", async () => {
			const evaluateMock = jest.fn().mockResolvedValue(undefined);
			const page = {
				evaluate: evaluateMock,
			} as unknown as Page;

			await scrollFollowingModal(page);

			// Default is 600px
			expect(evaluateMock).toHaveBeenCalledWith(expect.any(Function), 600);
		});
	});
});
