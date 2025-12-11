import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";
import { getStoryHighlights } from "./getStoryHighlights.ts";

describe("getStoryHighlights", () => {
	test("returns empty array when highlights container is missing", async () => {
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

	test("extracts titles and covers from primary selector", async () => {
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

	test("falls back to alternate selector when primary yields no elements", async () => {
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
				.mockResolvedValueOnce([]) // primary selector empty
				.mockResolvedValueOnce([altElement]), // alternate selector
		} as unknown as Page;

		const highlights = await getStoryHighlights(page);

		expect(highlights).toEqual([
			{ title: "Food", coverImageUrl: "food.jpg", element: altElement },
		]);
		expect(evaluateMock).toHaveBeenCalledTimes(2); // title + cover image
	});

	test("ignores entries with neither title nor cover image", async () => {
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
