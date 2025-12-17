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
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";
import { getLinkFromBio } from "./getLinkFromBio.ts";

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
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue("https://example.com"),
				}),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBe("https://example.com");
		});

		test("returns creator link when found first", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue("https://patreon.com/creator"),
				}),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBe("https://patreon.com/creator");
		});

		test("returns Linktree link when found", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue("https://linktr.ee/username"),
				}),
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
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue(""),
				}),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});

		test("returns null when href attribute is null", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue(null),
				}),
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
					.fn<any>()
					.mockRejectedValue(new Error("Evaluation failed")),
			};
			const page = createPageWithElementMock({
				$: jest.fn<any>().mockResolvedValue(linkElement),
			});

			const result = await getLinkFromBio(page);

			expect(result).toBeNull();
		});
	});
});
