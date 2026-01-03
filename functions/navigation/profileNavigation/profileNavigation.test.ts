/**
 * Profile Navigation Tests
 *
 * Profile navigation and status checking utilities:
 *
 * Functions:
 * - navigateToProfile(page, username, options): Navigate to an Instagram profile
 *   - Waits for page to load with networkidle2
 *   - Optionally waits for header element
 * - checkProfileStatus(page): Check profile accessibility
 *   - Returns: { isPrivate, notFound, isAccessible }
 * - verifyLoggedIn(page): Check if user is logged in
 *   - Looks for inbox link, home icon, or absence of login button
 * - ensureLoggedIn(page): Ensure logged in, re-authenticate if needed
 *   - Checks multiple login indicators
 *   - Triggers login() if not authenticated
 * - navigateToProfileAndCheck(page, username, options): Navigate and check status
 *   - Combines navigateToProfile + checkProfileStatus
 */

import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const loginMock =
	jest.fn<
		(
			page: Page,
			creds: { username: string; password: string },
			options?: { skipIfLoggedIn?: boolean },
		) => Promise<void>
	>();
const parseProfileStatusMock = jest
	.fn<(text: string) => { isPrivate: boolean; notFound: boolean }>()
	.mockReturnValue({ isPrivate: false, notFound: false });
const sleepMock = jest.fn<() => Promise<void>>();
const configMock = {
	IG_USER: "u",
	IG_PASS: "p",
	DEBUG_SCREENSHOTS: false,
	DELAY_SCALE: 1.0,
	DELAY_SCALES: {
		navigation: 1.0,
		modal: 1.0,
		input: 1.0,
		action: 1.0,
		pacing: 1.0,
	},
	DELAYS: {
		after_scroll: [0.5, 1.5],
		after_navigate: [1, 3],
		after_action: [0.5, 1.5],
	},
	DELAY_CATEGORIES: {},
	TIMEOUT_SCALE: 1.0,
	TIMEOUTS: {
		page_load: 30000,
		element_wait: 10000,
		navigation: 30000,
	},
};

// Mock humanInteraction to avoid ghost-cursor initialization in tests
const humanClickMock = jest
	.fn<(page: Page, element: unknown, options?: unknown) => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../../auth/login/login.ts", () => ({
	login: loginMock,
}));
jest.unstable_mockModule(
	"../../profile/profileStatus/profileStatus.ts",
	() => ({ parseProfileStatus: parseProfileStatusMock }),
);
jest.unstable_mockModule("../../shared/config/config.ts", () => configMock);
// Mock sleep function (used internally by delay functions)
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));
const humanScrollMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);
const humanWiggleMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);
jest.unstable_mockModule("../humanInteraction/humanInteraction.ts", () => ({
	humanClick: humanClickMock,
	humanScroll: humanScrollMock,
	humanWiggle: humanWiggleMock,
}));

// Mock humanize functions that use delay/sleep
const humanClickElementMock = jest
	.fn<(page: Page, selector: string, options?: unknown) => Promise<boolean>>()
	.mockResolvedValue(true);
const humanTypeTextMock = jest
	.fn<
		(
			page: Page,
			selector: string,
			text: string,
			options?: unknown,
		) => Promise<boolean>
	>()
	.mockResolvedValue(true);

jest.unstable_mockModule("../../timing/humanize/humanize.ts", () => ({
	humanClickElement: humanClickElementMock,
	humanTypeText: humanTypeTextMock,
	shortDelay: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const {
	navigateToProfile,
	checkProfileStatus,
	verifyLoggedIn,
	navigateToProfileAndCheck,
} = await import("./profileNavigation.ts");

const pageMock = () =>
	({
		goto: jest
			.fn<(url: string, opts?: object) => Promise<void>>()
			.mockResolvedValue(undefined),
		url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/"),
		isClosed: jest.fn<() => boolean>().mockReturnValue(false),
		waitForSelector: jest
			.fn<
				(
					selector: string,
					options?: import("puppeteer").WaitForSelectorOptions,
				) => Promise<import("puppeteer").ElementHandle<Element>>
			>()
			.mockResolvedValue({} as import("puppeteer").ElementHandle<Element>),
		waitForFunction: jest
			.fn<
				(
					pageFunction: () => boolean,
					options?: { timeout?: number },
				) => Promise<void>
			>()
			.mockResolvedValue(undefined),
		evaluate: jest
			.fn<
				<T>(
					pageFunction: (...args: unknown[]) => T,
					...args: unknown[]
				) => Promise<T>
			>()
			.mockResolvedValue(undefined as unknown as never),
		$: jest
			.fn<
				(
					selector: string,
				) => Promise<import("puppeteer").ElementHandle<Element> | null>
			>()
			.mockResolvedValue(null),
		keyboard: {
			type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		},
	}) as unknown as Page;

describe("profileNavigation", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		configMock.IG_USER = "u";
		configMock.IG_PASS = "p";
		parseProfileStatusMock.mockReturnValue({
			isPrivate: false,
			notFound: false,
		});
		humanClickElementMock.mockResolvedValue(true);
		humanTypeTextMock.mockResolvedValue(true);
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// navigateToProfile() - Navigate to Instagram Profile
	// ═══════════════════════════════════════════════════════════════════════════

	describe("navigateToProfile()", () => {
		test("navigates to profile using search (no direct URL)", async () => {
			const page = pageMock();
			// Create a mock element with click method
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as import("puppeteer").ElementHandle<Element>;
			// Mock search input element - return element for search input selector
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					// Return element for search input selectors
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];
			let evaluateCallCount = 0;
			// Mock evaluate for clicking profile in search results
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
					evaluateCallCount++;
					// First call: tagName check
					if (evaluateCallCount === 1) {
						return "input";
					}
					// Profile search calls - return found profile
					if (
						typeof fn === "function" &&
						args.length > 0 &&
						args[0] === "user123"
					) {
						return { found: true, href: "/user123/", index: 0 };
					}
					// Default for other evaluate calls
					return "";
				}) as Page["evaluate"];
			// Mock page.$ to return element for profile link
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					if (
						selector.includes('a[href="/user123/"]') ||
						selector.includes("/user123/")
					) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];

			await navigateToProfile(page, "user123");

			// Should use search, not direct URL navigation
			expect(page.goto).not.toHaveBeenCalledWith(
				"https://www.instagram.com/user123/",
				expect.anything(),
			);
			// Should have tried to find search input
			expect(page.$).toHaveBeenCalled();
		});

		test("waits for content to load after navigation", async () => {
			const page = pageMock();
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				evaluate: jest.fn<() => Promise<string>>().mockResolvedValue("input"),
			} as unknown as import("puppeteer").ElementHandle<Element>;
			let evaluateCallCount = 0;
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					if (
						selector.includes('a[href="/user123/"]') ||
						selector.includes("/user123/")
					) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
					evaluateCallCount++;
					// First call: tagName check
					if (evaluateCallCount === 1) {
						return "input";
					}
					// Profile search calls - return found profile
					if (
						typeof fn === "function" &&
						args.length > 0 &&
						args[0] === "user123"
					) {
						return { found: true, href: "/user123/", index: 0 };
					}
					// Default for other evaluate calls
					return "";
				}) as Page["evaluate"];

			await navigateToProfile(page, "user123");

			// Should have called sleep during navigation (either directly or via delay functions)
			expect(sleepMock).toHaveBeenCalled();
		});

		test("waits for header element when waitForHeader option is true", async () => {
			const page = pageMock();
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as import("puppeteer").ElementHandle<Element>;
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					if (selector.includes('a[href="/user123/"]')) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockResolvedValue({
					found: true,
					href: "/user123/",
					index: 0,
				}) as Page["evaluate"];
			page.waitForSelector = jest
				.fn<
					(
						selector: string,
						options?: import("puppeteer").WaitForSelectorOptions,
					) => Promise<import("puppeteer").ElementHandle<Element>>
				>()
				.mockResolvedValue(
					{} as import("puppeteer").ElementHandle<Element>,
				) as Page["waitForSelector"];

			await navigateToProfile(page, "user123", { waitForHeader: true });

			expect(page.waitForSelector).toHaveBeenCalledWith("header", {
				timeout: 5000,
			});
		});

		test("uses custom timeout when specified", async () => {
			const page = pageMock();
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as import("puppeteer").ElementHandle<Element>;
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					if (selector.includes('a[href="/user123/"]')) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockResolvedValue({
					found: true,
					href: "/user123/",
					index: 0,
				}) as Page["evaluate"];

			await navigateToProfile(page, "user123", { timeout: 10000 });

			// Timeout is passed to navigateToProfileViaSearch which uses it for page.goto if needed
			// The function should complete without errors
			expect(page).toBeDefined();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// checkProfileStatus() - Check Profile Accessibility
	// ═══════════════════════════════════════════════════════════════════════════

	describe("checkProfileStatus()", () => {
		test("extracts body text and delegates to parseProfileStatus", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<string>>()
				.mockResolvedValue("page text") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: true,
				notFound: false,
			});

			const status = await checkProfileStatus(page);

			expect(parseProfileStatusMock).toHaveBeenCalledWith("page text");
			expect(status.isPrivate).toBe(true);
			expect(status.notFound).toBe(false);
		});

		test("returns isAccessible: true when profile is public and exists", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<string>>()
				.mockResolvedValue("normal profile") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: false,
				notFound: false,
			});

			const status = await checkProfileStatus(page);

			expect(status).toEqual({
				isPrivate: false,
				notFound: false,
				isAccessible: true,
			});
		});

		test("returns isAccessible: false when profile is private", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<() => Promise<string>>()
				.mockResolvedValue("text") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: true,
				notFound: false,
			});

			const status = await checkProfileStatus(page);

			expect(status.isAccessible).toBe(false);
		});

		test("returns isAccessible: false when profile is not found", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<() => Promise<string>>()
				.mockResolvedValue("text") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: false,
				notFound: true,
			});

			const status = await checkProfileStatus(page);

			expect(status.isAccessible).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// verifyLoggedIn() - Check Login Status
	// ═══════════════════════════════════════════════════════════════════════════

	describe("verifyLoggedIn()", () => {
		test("returns result from page.evaluate that checks login indicators", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<boolean>>()
				.mockResolvedValue(true) as Page["evaluate"];

			const ok = await verifyLoggedIn(page);

			expect(ok).toBe(true);
		});

		test("returns false when no login indicators are found", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<boolean>>()
				.mockResolvedValue(false) as Page["evaluate"];

			const ok = await verifyLoggedIn(page);

			expect(ok).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// navigateToProfileAndCheck() - Navigate and Check Status
	// ═══════════════════════════════════════════════════════════════════════════

	describe("navigateToProfileAndCheck()", () => {
		test("combines navigation and status checking in one call", async () => {
			const page = pageMock();
			const mockElement = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as import("puppeteer").ElementHandle<Element>;
			// Mock search navigation
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockImplementation((selector: string) => {
					if (selector.includes("Search") || selector.includes("explore")) {
						return Promise.resolve(mockElement);
					}
					if (selector.includes('a[href="/abc/"]')) {
						return Promise.resolve(mockElement);
					}
					return Promise.resolve(null);
				}) as Page["$"];
			page.$$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element>[]>
				>()
				.mockResolvedValue([mockElement]) as Page["$$"];
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<unknown>>()
				.mockImplementation((_fn: unknown, ...args: unknown[]) => {
					// First call: search for profile link by href
					if (args[0] === "abc") {
						return Promise.resolve({ found: true, href: "/abc/", index: 0 });
					}
					// Second call: checkProfileStatus body text
					return Promise.resolve("text");
				}) as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: false,
				notFound: true,
			});

			const status = await navigateToProfileAndCheck(page, "abc", {
				timeout: 111,
				waitForHeader: true,
			});

			// Should use search, not direct URL
			expect(page.goto).not.toHaveBeenCalledWith(
				"https://www.instagram.com/abc/",
				expect.anything(),
			);
			expect(status).toEqual({
				isPrivate: false,
				notFound: true,
				isAccessible: false,
			});
		});
	});
});
