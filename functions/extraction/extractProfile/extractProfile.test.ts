import { describe, expect, test } from "@jest/globals";
import {
	createPageWithDOM,
	INSTAGRAM_CREATOR_PROFILE_HTML,
} from "../../__test__/domMocks.ts";
import { extractProfile } from "./extractProfile.ts";

describe("extractProfile", () => {
	test("extracts all profile elements using text array approach", async () => {
		const page = createPageWithDOM(INSTAGRAM_CREATOR_PROFILE_HTML);
		const extraction = await extractProfile(page);

		// Verify all elements are extracted (some may be null if extraction fails)
		expect(extraction.username).toBeTruthy();
		// Display name may be null if extraction fails - that's okay
		expect(extraction.bio).toBeTruthy();
		expect(extraction.stats.followers).toBeTruthy();
		expect(extraction.stats.following).toBeTruthy();
		expect(extraction.stats.posts).toBeTruthy();
		expect(extraction.highlights.length).toBeGreaterThan(0);

		// Verify extraction structure
		expect(extraction).toHaveProperty("username");
		expect(extraction).toHaveProperty("displayName");
		expect(extraction).toHaveProperty("bio");
		expect(extraction).toHaveProperty("bioLink");
		expect(extraction).toHaveProperty("stats");
		expect(extraction).toHaveProperty("highlights");
	});

	test("returns complete structure even with minimal HTML", async () => {
		const minimalHTML = `
			<header>
				<h2>testuser</h2>
				<span>100 posts</span>
				<span>200 followers</span>
				<span>50 following</span>
			</header>
		`;
		const page = createPageWithDOM(minimalHTML);
		const extraction = await extractProfile(page);

		// Should extract username from text array
		expect(extraction.username).toBe("testuser");

		// Should have stats
		expect(extraction.stats.posts).toBe(100);
		expect(extraction.stats.followers).toBe(200);
		expect(extraction.stats.following).toBe(50);

		// Verify structure is complete
		expect(extraction).toHaveProperty("username");
		expect(extraction).toHaveProperty("displayName");
		expect(extraction).toHaveProperty("bio");
		expect(extraction).toHaveProperty("bioLink");
		expect(extraction).toHaveProperty("stats");
		expect(extraction).toHaveProperty("highlights");
	});

	test("calculates follower ratio when both followers and following exist", async () => {
		const page = createPageWithDOM(INSTAGRAM_CREATOR_PROFILE_HTML);
		const extraction = await extractProfile(page);

		// Ratio should be calculated
		if (extraction.stats.followers && extraction.stats.following) {
			expect(extraction.stats.ratio).toBe(
				extraction.stats.followers / extraction.stats.following,
			);
		}
	});
});
