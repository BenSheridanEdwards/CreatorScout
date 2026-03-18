/**
 * Instagram DOM Mock Utilities
 *
 * Provides realistic Instagram profile HTML structures for testing extraction functions.
 * Based on actual Instagram DOM structure from real creator profiles.
 *
 * Note: Uses a simplified DOM simulation approach compatible with Jest ES modules.
 */

import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";
import { createPageMock } from "./testUtils.ts";

/**
 * Realistic Instagram creator profile HTML structure
 * Based on actual Instagram DOM from minki_minna_ profile
 */
export const INSTAGRAM_CREATOR_PROFILE_HTML = `
<header class="x11t971q xvc5jky x1yztbdb x178p66w xdj266r xwy3nlu x7ep2pv x19app5s x1qe1wrf">
  <section class="x98rzlu xeuugli">
    <div>
      <h2 dir="auto">minki_minna_</h2>
      <div>
        <span dir="auto">Minki Minna</span>
      </div>
      <div>
        <span dir="auto">1,376 posts</span>
        <a href="/minki_minna_/followers/" role="link">
          <span dir="auto"><span title="239,346">239K</span> followers</span>
        </a>
        <a href="/minki_minna_/following/" role="link">
          <span dir="auto"><span>993</span> following</span>
        </a>
      </div>
      <div>
        <span dir="auto">
          ✖️If you aren't here for my captions, go away<br>
          📍Bali, probably travelling <br>
          ✖️Director <a href="/fourplayofficial_/">@fourplayofficial_</a> <br>
          ✖️Yes I have one, check highlights ⬇️
        </span>
        <div>
          <svg aria-label="Link icon" class="x1lliihq x1n2onr6 xl0gqc1">
            <title>Link icon</title>
          </svg>
          <a href="https://l.instagram.com/?u=http%3A%2F%2Fgofund.me%2Ffourplay-vast-15dec" 
             rel="me nofollow noopener noreferrer" target="_blank">
            <div dir="auto">gofund.me/fourplay-vast-15dec</div>
          </a>
        </div>
      </div>
    </div>
  </section>
  <section class="x172qv1o xg8uqk0 x4afuhf x10todor x1lhsz42 x1mdcw8r x17fa7br x1jaan3d">
    <div role="menu">
      <ul class="_acay">
        <li>
          <a aria-label="View Link 🔗 highlight" href="/stories/highlights/18079393571055490/">
            <div role="button" tabindex="0">
              <img alt="highlight cover" src="cover1.jpg" />
            </div>
            <div>
              <span dir="auto">Link 🔗</span>
            </div>
          </a>
        </li>
        <li>
          <a aria-label="View Music✨ highlight" href="/stories/highlights/18074242123881913/">
            <div role="button" tabindex="0">
              <img alt="highlight cover" src="cover2.jpg" />
            </div>
            <div>
              <span dir="auto">Music✨</span>
            </div>
          </a>
        </li>
        <li>
          <a aria-label="View Art✨ highlight" href="/stories/highlights/17902680928233049/">
            <div role="button" tabindex="0">
              <img alt="highlight cover" src="cover3.jpg" />
            </div>
            <div>
              <span dir="auto">Art✨</span>
            </div>
          </a>
        </li>
      </ul>
    </div>
  </section>
</header>
`;

/**
 * Profile without bio (edge case)
 */
export const INSTAGRAM_PROFILE_NO_BIO_HTML = `
<header>
  <section>
    <div>
      <h2 dir="auto">username</h2>
      <div>
        <span dir="auto">100 posts</span>
        <a href="/username/followers/">500 followers</a>
        <a href="/username/following/">200 following</a>
      </div>
    </div>
  </section>
</header>
`;

/**
 * Profile with creator link (direct)
 */
export const INSTAGRAM_PROFILE_WITH_CREATOR_LINK_HTML = `
<header>
  <section>
    <div>
      <span dir="auto">Creator bio with Patreon link</span>
      <a href="https://patreon.com/creator" rel="nofollow" target="_blank">Link</a>
    </div>
  </section>
</header>
`;

/**
 * Profile with Linktree link
 */
export const INSTAGRAM_PROFILE_WITH_LINKTREE_HTML = `
<header>
  <section>
    <div>
      <span dir="auto">Check my linktr.ee/username</span>
      <a href="https://linktr.ee/username" rel="nofollow" target="_blank">Link</a>
    </div>
  </section>
</header>
`;

import {
	extractTextArrayFromHTML,
	identifyProfileElements,
} from "../extraction/textArrayExtraction.ts";

/**
 * Creates a Puppeteer Page mock using the simplified text array approach.
 * Extracts all text from HTML in order, then identifies profile elements by position.
 */
export function createPageWithDOM(html: string): Page {
	// Extract all text from HTML in DOM order
	const textArray = extractTextArrayFromHTML(html);

	// Identify profile elements using the pure function
	const profile = identifyProfileElements(textArray);

	// Extract additional data for backward compatibility
	const followersLink =
		html.match(/href="([^"]*\/followers\/[^"]*)"/)?.[1] || null;
	const followingLink =
		html.match(/href="([^"]*\/following\/[^"]*)"/)?.[1] || null;
	const bioLinkMatch = html.match(
		/href="(https?:\/\/[^"]+)"[^>]*rel="[^"]*nofollow[^"]*"/,
	);
	const bioLink = bioLinkMatch ? bioLinkMatch[1] : profile.bioLink;

	// Header text for fallback
	const headerMatch = html.match(/<header[^>]*>([\s\S]*?)<\/header>/);
	const headerText = headerMatch
		? headerMatch[1]
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
		: "";

	// Helper to create ElementHandle mock
	const createElementHandle = (
		text: string | null,
		href: string | null = null,
	): ElementHandle<Element> | null => {
		if (!text && !href) return null;

		return {
			evaluate: jest.fn((fn: (el: Element) => unknown) => {
				const mockElement = {
					innerText: text || "",
					textContent: text || "",
					getAttribute: (attr: string) => (attr === "href" ? href : null),
				} as unknown as Element;
				return Promise.resolve(fn(mockElement));
			}),
			$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			$$: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
			boundingBox: jest
				.fn<
					() => Promise<{ x: number; y: number; width: number; height: number }>
				>()
				.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
			evaluateHandle: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			asElement: jest.fn<() => null>().mockReturnValue(null),
		} as unknown as ElementHandle<Element>;
	};

	return createPageMock({
		$: jest.fn((selector: string) => {
			// Username extraction
			if (selector.includes("h2") && profile.username) {
				return Promise.resolve(createElementHandle(profile.username));
			}
			// Bio extraction
			if (selector.includes('span[dir="auto"]') && profile.bio) {
				return Promise.resolve(createElementHandle(profile.bio));
			}
			// Followers link
			if (selector.includes("/followers") && followersLink) {
				const text = `${profile.followers || ""} followers`;
				return Promise.resolve(createElementHandle(text, followersLink));
			}
			// Following link
			if (selector.includes("/following") && followingLink) {
				const text = `${profile.following || ""} following`;
				return Promise.resolve(createElementHandle(text, followingLink));
			}
			// Header fallback
			if (selector === "header") {
				return Promise.resolve(createElementHandle(headerText));
			}
			// Bio link
			if (
				(selector.includes("nofollow") ||
					selector.includes("_blank") ||
					selector.includes("http")) &&
				bioLink
			) {
				return Promise.resolve(createElementHandle(null, bioLink));
			}
			return Promise.resolve(null);
		}),

		$$: jest.fn((selector: string) => {
			const elements: ElementHandle<Element>[] = [];

			// Highlight extraction - parse from HTML directly
			if (
				selector.includes('role="button"') ||
				selector.includes("/stories/highlights/")
			) {
				// Parse highlights from HTML using aria-label pattern
				const highlightMatches = html.matchAll(
					/<a[^>]*aria-label="View ([^"]+) highlight"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
				);

				for (const match of highlightMatches) {
					const title = match[1];
					const innerHTML = match[3];
					// Try to get title from span[dir="auto"] inside
					const titleMatch = innerHTML.match(
						/<span[^>]*dir="auto"[^>]*>([^<]+)<\/span>/,
					);
					const actualTitle = titleMatch ? titleMatch[1] : title;
					const imgMatch = innerHTML.match(/<img[^>]*src="([^"]+)"/);
					const coverImageUrl = imgMatch ? imgMatch[1] : null;

					const mockElement = {
						querySelector: (sel: string) => {
							if (sel.includes("span") || sel.includes("div")) {
								return { textContent: actualTitle };
							}
							if (sel.includes("img")) {
								return coverImageUrl
									? { src: coverImageUrl, getAttribute: () => coverImageUrl }
									: null;
							}
							return null;
						},
					};

					elements.push({
						evaluate: jest.fn((fn: (el: typeof mockElement) => unknown) =>
							Promise.resolve(fn(mockElement)),
						),
					} as unknown as ElementHandle<Element>);
				}
			}
			return Promise.resolve(elements);
		}),

		evaluate: jest.fn((fn: () => unknown) => {
			if (typeof fn !== "function") {
				return Promise.resolve(null);
			}

			// Check what the function is looking for by inspecting its string
			const fnStr = fn.toString();

			// TreeWalker pattern - extractTextArrayFromPage
			if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
				// Return the text array directly
				return Promise.resolve(textArray);
			}

			// Display name extraction pattern detection
			if (fnStr.includes("usernameH2") && fnStr.includes("statsContainer")) {
				// This is the getDisplayNameFromPage function
				return Promise.resolve(profile.displayName);
			}

			// Bio extraction with order-based logic
			if (fnStr.includes("statsContainer") && fnStr.includes("bioFromOrder")) {
				return Promise.resolve(profile.bio);
			}

			// Create a minimal mock document for other cases
			const mockDocument = {
				querySelector: (sel: string) => {
					if (sel === "header") {
						return {
							textContent: headerText,
							innerText: headerText,
							querySelector: () => null,
							querySelectorAll: () => [],
						};
					}
					if (sel.includes("h2") && profile.username) {
						return { textContent: profile.username };
					}
					return null;
				},
				querySelectorAll: (sel: string) => {
					if (sel === "a") {
						// Return links for stats extraction
						const links: {
							getAttribute: (attr: string) => string | null;
							textContent: string;
						}[] = [];
						if (followersLink) {
							links.push({
								getAttribute: (attr: string) =>
									attr === "href" ? followersLink : null,
								textContent: `${profile.followers} followers`,
							});
						}
						if (followingLink) {
							links.push({
								getAttribute: (attr: string) =>
									attr === "href" ? followingLink : null,
								textContent: `${profile.following} following`,
							});
						}
						return links;
					}
					return [];
				},
			};

			// Execute the function with document injected
			try {
				const bodyMatch = fnStr.match(
					/^(?:\(\)\s*=>|function\s*\(\))\s*\{([\s\S]*)\}$/,
				);
				const body = bodyMatch ? bodyMatch[1] : fnStr;
				const wrappedFn = new Function("document", body);
				return Promise.resolve(wrappedFn(mockDocument));
			} catch {
				// Fallback: just return null
				return Promise.resolve(null);
			}
		}),

		waitForSelector: jest.fn((selector: string) => {
			if (selector.includes('role="tablist"')) {
				// Check if highlights exist in HTML
				if (html.includes("/stories/highlights/")) {
					return Promise.resolve(createElementHandle("", null));
				}
				return Promise.reject(new Error("Selector not found"));
			}
			if (selector.includes('role="button"')) {
				return Promise.resolve(createElementHandle("", null));
			}
			return Promise.reject(new Error("Selector not found"));
		}),

		content: jest.fn<() => Promise<string>>().mockResolvedValue(html),
		url: jest
			.fn<() => string>()
			.mockReturnValue("https://www.instagram.com/test/"),
	}) as Page;
}
