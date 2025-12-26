/**
 * getLinkFromBio Function Tests
 *
 * The getLinkFromBio() function extracts external links from Instagram profile bio:
 *
 * Algorithm:
 * 1. Try selectors for known creator platforms first (Patreon, Ko-fi, etc.)
 * 2. Then try link aggregators (Linktree, Beacons, etc.)
 * 3. Finally try generic external link selectors
 * 4. Return first valid href found, or null
 *
 * Selector Priority (first match wins):
 * - Direct creator links
 * - Aggregator links (linktr.ee, beacons.ai, etc.)
 * - Generic external links (rel=nofollow, target=_blank, http)
 */

import { jest } from "@jest/globals";
import type { Page, ElementHandle } from "puppeteer";
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";
import { getLinkFromBio, clickBioLink } from "./getLinkFromBio.ts";

describe("getLinkFromBio", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Happy Path: Link Found
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Link extraction success", () => {
		test("extracts href from matching anchor element", async () => {
			const page = createPageMock({
				$: jest.fn<Page["$"]>().mockResolvedValue({
					evaluate: jest
						.fn<Page["evaluate"]>()
						.mockResolvedValue("https://example.com"),
				} as unknown as Awaited<ReturnType<Page["$"]>>),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBe("https://example.com");
		});

		test("returns creator link when found first", async () => {
			const page = createPageMock({
				$: jest.fn<Page["$"]>().mockResolvedValue({
					evaluate: jest
						.fn<Page["evaluate"]>()
						.mockResolvedValue("https://patreon.com/creator"),
				} as unknown as Awaited<ReturnType<Page["$"]>>),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBe("https://patreon.com/creator");
		});

		test("returns Linktree link when found", async () => {
			const page = createPageMock({
				$: jest.fn<Page["$"]>().mockResolvedValue({
					evaluate: jest
						.fn<Page["evaluate"]>()
						.mockResolvedValue("https://linktr.ee/username"),
				} as unknown as Awaited<ReturnType<Page["$"]>>),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBe("https://linktr.ee/username");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Edge Cases: Empty or Null href
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Empty or null href handling", () => {
		test("returns null when href attribute is empty string", async () => {
			const page = createPageMock({
				$: jest.fn<Page["$"]>().mockResolvedValue({
					evaluate: jest.fn<Page["evaluate"]>().mockResolvedValue(""),
				} as unknown as Awaited<ReturnType<Page["$"]>>),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});

		test("returns null when href attribute is null", async () => {
			const page = createPageMock({
				$: jest.fn<Page["$"]>().mockResolvedValue({
					evaluate: jest.fn<Page["evaluate"]>().mockResolvedValue(null),
				} as unknown as Awaited<ReturnType<Page["$"]>>),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Failure Cases: No Link Found
	// ═══════════════════════════════════════════════════════════════════════════

	describe("No link found", () => {
		test("returns null when no matching selector is found", async () => {
			const page = createPageMock();

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Error Handling
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("returns null when element evaluation fails", async () => {
			const linkElement = {
				evaluate: jest
					.fn<Page["evaluate"]>()
					.mockRejectedValue(new Error("Evaluation failed")),
			};
			const page = createPageWithElementMock({
				$: jest
					.fn<Page["$"]>()
					.mockResolvedValue(
						linkElement as unknown as Awaited<ReturnType<Page["$"]>>,
					),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// clickBioLink() - Blacklist Domain Check
	// ═══════════════════════════════════════════════════════════════════════════

	describe("clickBioLink() - Blacklist Check", () => {
		test("skips clicking blacklisted domain (meta.com)", async () => {
			const mockElement = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue("https://about.meta.com/"),
			} as unknown as ElementHandle<Element>;

			const page = createPageMock({
				url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/test"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockElement),
			});

			const result = await clickBioLink(page);

			expect(result.success).toBe(false);
			expect(result.finalUrl).toBeNull();
			expect(result.error).toContain("Blacklisted domain");
			expect(result.error).toContain("meta.com");
		});

		test("skips clicking blacklisted domain (facebook.com)", async () => {
			const mockElement = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue("https://www.facebook.com/profile"),
			} as unknown as ElementHandle<Element>;

			const page = createPageMock({
				url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/test"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockElement),
			});

			const result = await clickBioLink(page);

			expect(result.success).toBe(false);
			expect(result.finalUrl).toBeNull();
			expect(result.error).toContain("Blacklisted domain");
		});

		test("skips clicking blacklisted domain (youtube.com)", async () => {
			const mockElement = {
				evaluate: jest
					.fn<() => Promise<string>>()
					.mockResolvedValue("https://www.youtube.com/@channel"),
			} as unknown as ElementHandle<Element>;

			const page = createPageMock({
				url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/test"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(mockElement),
			});

			const result = await clickBioLink(page);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Blacklisted domain");
		});

		test("returns error when no bio link element found", async () => {
			const page = createPageMock({
				url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/test"),
				$: jest
					.fn<() => Promise<ElementHandle<Element> | null>>()
					.mockResolvedValue(null),
			});

			const result = await clickBioLink(page);

			expect(result.success).toBe(false);
			expect(result.finalUrl).toBeNull();
			expect(result.error).toBe("No bio link found on page");
		});
	});
});
