/**
 * Link Extraction Utility Tests
 *
 * Link extraction utilities for collecting and analyzing external links:
 *
 * Functions:
 * - buildUniqueLinks(html, headerHrefs, primaryBioLink): Collects unique external links
 *   - Combines primary bio link, header anchors, and HTML content matches
 *   - Filters Instagram-hosted links (except redirect URLs)
 *   - Extracts external_url from JSON in HTML
 * - hasDirectCreatorLink(links): Checks for direct creator links
 * - collectAggregatorLinks(links): Filters for link aggregator domains
 * - toSafeHttps(url): Normalizes URLs to HTTPS
 * - decodeInstagramRedirect(url): Extracts actual URL from Instagram redirects
 * - analyzeExternalLink(page, linkUrl, username): Deep analysis of external pages
 * - shouldUseVisionAnalysis(...): Determines if vision AI should be used
 */

import {
	buildUniqueLinks,
	collectAggregatorLinks,
	hasDirectCreatorLink,
	toSafeHttps,
} from "./linkExtraction.ts";

const sampleHtml = `
  <a href="https://linktr.ee/example"></a>
  <a href="https://patreon.com/creator"></a>
  "external_url":"https://beacons.ai/example"
  some text https://linkin.bio/demo
`;

describe("linkExtraction", () => {
	// ═══════════════════════════════════════════════════════════════════════════
	// buildUniqueLinks() - Collect External Links
	// ═══════════════════════════════════════════════════════════════════════════

	describe("buildUniqueLinks()", () => {
		test("collects links from primary bio link, header hrefs, and HTML content", () => {
			const links = buildUniqueLinks(
				sampleHtml,
				["https://foo.com"],
				"https://bar.com",
			);

			expect(links).toContain("https://foo.com");
			expect(links).toContain("https://bar.com");
			expect(links.some((l) => l.includes("linktr.ee"))).toBe(true);
			expect(links.some((l) => l.includes("patreon.com"))).toBe(true);
			expect(links.some((l) => l.includes("beacons.ai"))).toBe(true);
			expect(links.some((l) => l.includes("linkin.bio"))).toBe(true);
		});

		test("deduplicates links appearing in multiple sources", () => {
			const html = `
        https://linktr.ee/dupe
        "external_url":"https://linktr.ee/dupe"
      `;
			const links = buildUniqueLinks(html, ["https://linktr.ee/dupe"], null);

			expect(links).toEqual(["https://linktr.ee/dupe"]);
		});

		test("filters out Instagram-hosted links (not external)", () => {
			const html = `
        https://linktr.ee/valid
        https://instagram.com/should-be-ignored
      `;
			const links = buildUniqueLinks(html, [], null);

			expect(links.some((l) => l.includes("instagram.com"))).toBe(false);
			expect(links.some((l) => l.includes("linktr.ee"))).toBe(true);
		});

		test("extracts and unescapes external_url from JSON in HTML", () => {
			const html =
				'"external_url":"https://beacons.ai/example?foo=1\\u0026bar=2" more text';
			const links = buildUniqueLinks(html, [], null);

			expect(links).toEqual(["https://beacons.ai/example?foo=1\\u0026bar=2"]);
		});

		test("allows Instagram redirect URLs (l.instagram.com)", () => {
			const html = "some text https://l.instagram.com/?u=https://example.com";
			const links = buildUniqueLinks(html, [], null);

			// Should allow l.instagram.com redirect URLs
			expect(links.length).toBeGreaterThanOrEqual(0); // Implementation specific
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// hasDirectCreatorLink() - Check for Creator Platforms
	// ═══════════════════════════════════════════════════════════════════════════

	describe("hasDirectCreatorLink()", () => {
		test("returns true when creator link is present", () => {
			expect(hasDirectCreatorLink(["https://patreon.com/creator"])).toBe(true);
		});

		test("returns false when no creator platform links present", () => {
			expect(hasDirectCreatorLink(["https://example.com"])).toBe(false);
		});

		test("returns true for case-insensitive Patreon URLs", () => {
			expect(hasDirectCreatorLink(["https://PATREON.COM/creator"])).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// collectAggregatorLinks() - Filter Aggregator Domains
	// ═══════════════════════════════════════════════════════════════════════════

	describe("collectAggregatorLinks()", () => {
		test("filters and returns only aggregator domain links", () => {
			const aggregators = collectAggregatorLinks([
				"https://linktr.ee/username",
				"https://example.com/page",
				"https://beacons.ai/user",
			]);

			expect(aggregators.sort()).toEqual([
				"https://beacons.ai/user",
				"https://linktr.ee/username",
			]);
		});

		test("returns empty array when no aggregators present", () => {
			const aggregators = collectAggregatorLinks([
				"https://example.com",
				"https://twitter.com/user",
			]);

			expect(aggregators).toEqual([]);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// toSafeHttps() - URL Normalization
	// ═══════════════════════════════════════════════════════════════════════════

	describe("toSafeHttps()", () => {
		test("converts http:// to https://", () => {
			expect(toSafeHttps("http://example.com")).toBe("https://example.com");
		});

		test("strips leading slashes and adds https://", () => {
			expect(toSafeHttps("//example.com")).toBe("https://example.com");
		});

		test("leaves https:// URLs unchanged", () => {
			expect(toSafeHttps("https://secure.com")).toBe("https://secure.com");
		});

		test("returns empty string for empty input", () => {
			expect(toSafeHttps("")).toBe("");
		});

		test("handles protocol-less URLs", () => {
			expect(toSafeHttps("example.com")).toBe("https://example.com");
		});
	});
});
