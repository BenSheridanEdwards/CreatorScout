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
	test("buildUniqueLinks collects primary, header, and html matches", () => {
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

	test("buildUniqueLinks deduplicates and drops instagram-hosted links", () => {
		const html = `
      https://linktr.ee/dupe
      https://instagram.com/should-be-ignored
      "external_url":"https://linktr.ee/dupe"
    `;
		const links = buildUniqueLinks(html, ["https://linktr.ee/dupe"], null);
		expect(links).toEqual(["https://linktr.ee/dupe"]);
	});

	test("buildUniqueLinks extracts external_url json and unescapes", () => {
		const html =
			'"external_url":"https://beacons.ai/example?foo=1\\u0026bar=2" more text';
		const links = buildUniqueLinks(html, [], null);
		expect(links).toEqual(["https://beacons.ai/example?foo=1\\u0026bar=2"]);
	});

	test("hasDirectCreatorLink detects creator domains", () => {
		expect(hasDirectCreatorLink(["https://patreon.com/x"])).toBe(true);
		expect(hasDirectCreatorLink(["https://example.com"])).toBe(false);
	});

	test("collectAggregatorLinks filters aggregator domains", () => {
		const aggregators = collectAggregatorLinks([
			"https://linktr.ee/x",
			"https://example.com",
			"https://beacons.ai/x",
		]);
		expect(aggregators.sort()).toEqual([
			"https://beacons.ai/x",
			"https://linktr.ee/x",
		]);
	});

	test("toSafeHttps normalizes http and slashes", () => {
		expect(toSafeHttps("http://example.com")).toBe("https://example.com");
		expect(toSafeHttps("//example.com")).toBe("https://example.com");
		expect(toSafeHttps("https://secure.com")).toBe("https://secure.com");
		expect(toSafeHttps("")).toBe("");
	});
});
