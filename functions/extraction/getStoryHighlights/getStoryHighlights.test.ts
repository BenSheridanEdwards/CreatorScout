/**
 * getStoryHighlights Function Tests
 *
 * The getStoryHighlights() function extracts story highlight data from profiles:
 *
 * Algorithm:
 * 1. Wait for highlights container (div[role="tablist"])
 * 2. Try primary selector for highlight elements
 * 3. Fall back to alternative selector if primary yields nothing
 * 4. Extract title text and cover image URL from each element
 * 5. Filter out entries with neither title nor image
 *
 * Returns: Array of { title, coverImageUrl, element } objects
 *
 * Helper Functions:
 * - isLinkInBioHighlight(title): Checks for premium content indicators
 * - getHighlightTitlesText(highlights): Combines titles for keyword matching
 */

import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";
import { getStoryHighlights } from "./getStoryHighlights.ts";

describe("getStoryHighlights", () => {
	// ═══════════════════════════════════════════════════════════════════════════
	// Container Detection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Highlights container detection", () => {
		test("returns empty array when highlights container is not found", async () => {
			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockRejectedValue(new Error("no highlights")),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([]),
			} as unknown as Page;

			const highlights = await getStoryHighlights(page);

			expect(highlights).toEqual([]);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Primary Selector Extraction
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Extraction via primary selector", () => {
		test("extracts title and cover image from highlight elements", async () => {
			const evaluateMock = jest
				.fn<ElementHandle<Element>["evaluate"]>()
				.mockResolvedValue({ title: "Travel", coverImageUrl: "cover.jpg" });
			const element = {
				evaluate: evaluateMock,
			} as unknown as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([element]),
			} as unknown as Page;

			const highlights = await getStoryHighlights(page);

			expect(highlights).toEqual([
				{ title: "Travel", coverImageUrl: "cover.jpg", element },
			]);
			expect(evaluateMock).toHaveBeenCalled();
		});

		test("filters out entries without title or cover image", async () => {
			const evaluateMock = jest
				.fn<ElementHandle<Element>["evaluate"]>()
				.mockResolvedValue({ title: "", coverImageUrl: null });
			const element = {
				evaluate: evaluateMock,
			} as unknown as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue([element]),
			} as unknown as Page;

			const highlights = await getStoryHighlights(page);

			expect(highlights).toEqual([]);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Fallback Selector Extraction
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Fallback to alternate selector", () => {
		test("uses alternative selector when primary returns no elements", async () => {
			type FakeNode = {
				querySelector: (sel: string) => {
					textContent?: string;
					src?: string;
					getAttribute?: (k: string) => string;
				} | null;
			};
			const evaluateMock = jest
				.fn<(pageFunction: (node: FakeNode) => unknown) => Promise<unknown>>()
				.mockImplementation(async (pageFunction) => {
					const node: FakeNode = {
						querySelector: (sel: string) => {
							if (sel === "span") return { textContent: "Food" };
							if (sel === "img")
								return {
									src: "food.jpg",
									getAttribute: () => "food.jpg",
								};
							return null;
						},
					};
					return pageFunction(node);
				});
			const altElement = {
				evaluate: evaluateMock,
			} as unknown as ElementHandle<Element>;

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValueOnce([]) // Primary selector returns empty
					.mockResolvedValueOnce([altElement]), // Fallback selector finds element
			} as unknown as Page;

			const highlights = await getStoryHighlights(page);

			expect(highlights).toEqual([
				{ title: "Food", coverImageUrl: "food.jpg", element: altElement },
			]);
			expect(evaluateMock).toHaveBeenCalledTimes(2); // Title + cover image extraction
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Multiple Highlights
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Multiple highlights handling", () => {
		test("extracts data from multiple highlight elements", async () => {
			const createElement = (title: string, coverUrl: string) => ({
				evaluate: jest
					.fn<ElementHandle<Element>["evaluate"]>()
					.mockResolvedValue({ title, coverImageUrl: coverUrl }),
			}) as unknown as ElementHandle<Element>;

			const elements = [
				createElement("Highlight 1", "cover1.jpg"),
				createElement("Highlight 2", "cover2.jpg"),
				createElement("Highlight 3", "cover3.jpg"),
			];

			const page = {
				waitForSelector: jest
					.fn<() => Promise<ElementHandle<Element>>>()
					.mockResolvedValue({} as ElementHandle<Element>),
				$$: jest
					.fn<() => Promise<ElementHandle<Element>[]>>()
					.mockResolvedValue(elements),
			} as unknown as Page;

			const highlights = await getStoryHighlights(page);

			expect(highlights.length).toBe(3);
			expect(highlights[0].title).toBe("Highlight 1");
			expect(highlights[2].title).toBe("Highlight 3");
		});
	});
});
