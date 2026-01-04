import { describe, test, expect } from "@jest/globals";
import {
	extractTextArrayFromHTML,
	parseStatNumber,
	identifyProfileElements,
	extractProfileFromHTML,
} from "./textArrayExtraction.ts";

describe("textArrayExtraction", () => {
	describe("parseStatNumber", () => {
		test("parses plain numbers", () => {
			expect(parseStatNumber("878")).toBe(878);
			expect(parseStatNumber("40")).toBe(40);
			expect(parseStatNumber("46")).toBe(46);
		});

		test("parses numbers with commas", () => {
			expect(parseStatNumber("1,376")).toBe(1376);
			expect(parseStatNumber("239,346")).toBe(239346);
		});

		test("parses K suffix", () => {
			expect(parseStatNumber("239K")).toBe(239000);
			expect(parseStatNumber("1.5K")).toBe(1500);
		});

		test("parses M suffix", () => {
			expect(parseStatNumber("1M")).toBe(1000000);
			expect(parseStatNumber("2.5M")).toBe(2500000);
		});

		test("returns null for invalid input", () => {
			expect(parseStatNumber("")).toBeNull();
			expect(parseStatNumber("abc")).toBeNull();
		});
	});

	describe("extractTextArrayFromHTML", () => {
		test("extracts text in order from simple HTML", () => {
			const html = `<div><h2>username</h2><span>Display Name</span></div>`;
			const texts = extractTextArrayFromHTML(html);
			expect(texts).toContain("username");
			expect(texts).toContain("Display Name");
			expect(texts.indexOf("username")).toBeLessThan(
				texts.indexOf("Display Name"),
			);
		});

		test("handles nested elements", () => {
			const html = `<div><span><span>878</span> followers</span></div>`;
			const texts = extractTextArrayFromHTML(html);
			expect(texts).toContain("878");
			expect(texts).toContain("followers");
		});

		test("skips SVG content", () => {
			const html = `<div><svg><title>Options</title></svg><span>bio</span></div>`;
			const texts = extractTextArrayFromHTML(html);
			expect(texts).not.toContain("Options");
			expect(texts).toContain("bio");
		});
	});

	describe("identifyProfileElements", () => {
		test("identifies elements from brookeyyyx profile text array", () => {
			// Text array from the provided HTML
			const texts = [
				"brookeyyyx",
				"40",
				"posts",
				"878",
				"followers",
				"46",
				"following",
				"🍸🌺🐆🍒",
				"Follow",
				"💋",
			];

			const result = identifyProfileElements(texts);

			expect(result.username).toBe("brookeyyyx");
			expect(result.posts).toBe(40);
			expect(result.followers).toBe(878);
			expect(result.following).toBe(46);
			expect(result.bio).toBe("🍸🌺🐆🍒");
			expect(result.highlights).toContain("💋");
		});

		test("identifies elements with display name", () => {
			const texts = [
				"gracedzeja_",
				"Gracie Dzeja",
				"624",
				"posts",
				"208K",
				"followers",
				"2,109",
				"following",
				"Bali📍",
				"Yes I have one check my highlight story",
				"Follow",
				"CHAT W ME",
				"Travel ✈️",
			];

			const result = identifyProfileElements(texts);

			expect(result.username).toBe("gracedzeja_");
			expect(result.displayName).toBe("Gracie Dzeja");
			expect(result.posts).toBe(624);
			expect(result.followers).toBe(208000);
			expect(result.following).toBe(2109);
			expect(result.bio).toContain("Bali");
			expect(result.highlights).toContain("CHAT W ME");
			expect(result.highlights).toContain("Travel ✈️");
		});

		test("handles profile without display name", () => {
			const texts = [
				"someuser",
				"10",
				"posts",
				"100",
				"followers",
				"50",
				"following",
				"My bio here",
				"Follow",
			];

			const result = identifyProfileElements(texts);

			expect(result.username).toBe("someuser");
			expect(result.displayName).toBeNull();
			expect(result.bio).toBe("My bio here");
		});
	});

	describe("extractProfileFromHTML - real Instagram HTML", () => {
		test("extracts from brookeyyyx header HTML", () => {
			const html = `<header class="x11t971q xvc5jky x1yztbdb x178p66w xdj266r xwy3nlu x7ep2pv x19app5s x1qe1wrf"><div class="x6s0dn4 x78zum5 x1q0g3np"><section class="xlo4toe xd3so5o x2wt2w"><div class="x6s0dn4 x78zum5 xdt5ytf x1iyjqo2 x2lah0s xl56j7k x1n2onr6"><span aria-describedby="_r_2_" class="html-span xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x1hl2dhg x16tdsg8 x1vvkbs x4k7w5x x1h91t0o x1h9r5lt x1jfb8zj xv2umb2 x1beo9mf xaigb6o x12ejxvf x3igimt xarpa2k xedcshv x1lytzrv x1t2pt76 x7ja8zs x1qrby5j"><div><div class="x6s0dn4 xamitd3 x1lliihq xl56j7k x1n2onr6"><a class="x1i10hfl" href="/brookeyyyx/" role="link" tabindex="0" style="height: 150px; width: 150px;"><img alt="brookeyyyx's profile picture" src="https://example.com/pic.jpg"></a></div></div></span></div></section><section class="x98rzlu xeuugli"><div class="x7a106z"><div class="html-div"><div class="x78zum5 x193iq5w x6ikm8r x10wlt62"><a class="x1i10hfl" href="#" role="link" tabindex="0"><h2 class="x1lliihq" dir="auto"><span class="x1lliihq x193iq5w x6ikm8r x10wlt62 xlyipyv xuxw1ft">brookeyyyx</span></h2></a></div><div class="html-div"><span class="x1lliihq x1plvlek" dir="auto"><span class="x5n08af x1s688f"><span class="html-span">40</span></span> posts</span></div><div><a class="x1i10hfl" href="/brookeyyyx/followers/" role="link" tabindex="0"><span class="x1lliihq" dir="auto"><span class="x5n08af x1s688f" title="878"><span class="html-span">878</span></span> followers</span></a></div><div><a class="x1i10hfl" href="/brookeyyyx/following/" role="link" tabindex="0"><span class="x1lliihq" dir="auto"><span class="x5n08af x1s688f"><span class="html-span">46</span></span> following</span></a></div></div><div class="x7a106z"><div class="html-div"><span class="_ap3a _aaco _aacu _aacx _aad7 _aade" dir="auto"><div aria-disabled="false" role="button" tabindex="0" style="display: inline; cursor: pointer;"><span class="_ap3a _aaco _aacu _aacx _aad7 _aade" dir="auto">🍸🌺🐆🍒</span></div></span></div></div></section></div><section class="x14vqqas x172qv1o"><div class="html-div"><div class="html-div"><div class="html-div"><div class="html-div"><div class="html-div"><button class="_aswp _aswr _aswu _aswy _asw_ _asx2" type="button"><div class="html-div"><div class="_ap3a _aaco _aacw _aad6 _aade" dir="auto">Follow</div></div></button></div></div></div></div></div></section><section class="x172qv1o xg8uqk0 x4afuhf x10todor x1lhsz42 x1mdcw8r x17fa7br x1jaan3d"><div role="menu"><div class="xcbf60w x1mzvp2d x1yztbdb x69nqbv xw7yly9"><div class="x1qjc9v5 x9f619 x78zum5 xdt5ytf xln7xf2 xk390pu x5yr21d x1n2onr6 x11njtxf xh8yej3"><div class="x1qjc9v5 x78zum5 x1q0g3np x5yr21d xw2csxc x10wlt62 x1n2onr6 x1rohswg xfk6m8" role="presentation"><div class="x1qjc9v5 x9f619 x78zum5 x1q0g3np xln7xf2 xk390pu x5yr21d x1n2onr6 x11njtxf"><ul class="_acay"><li class="_acaz" tabindex="-1"><div class="html-div"><div class="x9f619"><a aria-label="View 💋 highlight" class="x1i10hfl" href="/stories/highlights/17914390272061194/" role="link" tabindex="0"><div class="x1i10hfl" role="button" tabindex="0"><div class="xqy66fx x1wq6e7o xh8yej3 x1ypdohk x2b8uid"><span class="x1lliihq x1plvlek" dir="auto"><span class="x1lliihq x193iq5w x6ikm8r x10wlt62 xlyipyv xuxw1ft">💋</span></span></div></div></a></div></div></li></ul></div></div></div></div></div></section></header>`;

			const result = extractProfileFromHTML(html);

			expect(result.username).toBe("brookeyyyx");
			expect(result.posts).toBe(40);
			expect(result.followers).toBe(878);
			expect(result.following).toBe(46);
			expect(result.bio).toBe("🍸🌺🐆🍒");
			expect(result.highlights).toContain("💋");
		});
	});
});
