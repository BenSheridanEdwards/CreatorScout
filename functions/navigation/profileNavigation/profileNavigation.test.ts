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
const configMock = { IG_USER: "u", IG_PASS: "p" };

jest.unstable_mockModule("../../auth/login/login.ts", () => ({
	login: loginMock,
}));
jest.unstable_mockModule(
	"../../profile/profileStatus/profileStatus.ts",
	() => ({ parseProfileStatus: parseProfileStatusMock }),
);
jest.unstable_mockModule("../../shared/config/config.ts", () => configMock);
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const {
	navigateToProfile,
	checkProfileStatus,
	verifyLoggedIn,
	ensureLoggedIn,
	navigateToProfileAndCheck,
} = await import("./profileNavigation.ts");

const pageMock = () =>
	({
		goto: jest
			.fn<(url: string, opts?: object) => Promise<void>>()
			.mockResolvedValue(undefined),
		waitForSelector: jest
			.fn<
				(
					selector: string,
					options?: import("puppeteer").WaitForSelectorOptions,
				) => Promise<import("puppeteer").ElementHandle<Element>>
			>()
			.mockResolvedValue({} as import("puppeteer").ElementHandle<Element>),
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
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// navigateToProfile() - Navigate to Instagram Profile
	// ═══════════════════════════════════════════════════════════════════════════

	describe("navigateToProfile()", () => {
		test("navigates to profile URL with username", async () => {
			const page = pageMock();

			await navigateToProfile(page, "user123");

			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/user123/",
				expect.objectContaining({ waitUntil: "networkidle2", timeout: 20000 }),
			);
		});

		test("waits for content to load after navigation", async () => {
			const page = pageMock();

			await navigateToProfile(page, "user123");

			expect(sleepMock).toHaveBeenCalledWith(3000);
		});

		test("waits for header element when waitForHeader option is true", async () => {
			const page = pageMock();
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

			await navigateToProfile(page, "user123", { timeout: 10000 });

			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/user123/",
				expect.objectContaining({ timeout: 10000 }),
			);
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
			page.evaluate = jest.fn().mockResolvedValue("text") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: true,
				notFound: false,
			});

			const status = await checkProfileStatus(page);

			expect(status.isAccessible).toBe(false);
		});

		test("returns isAccessible: false when profile is not found", async () => {
			const page = pageMock();
			page.evaluate = jest.fn().mockResolvedValue("text") as Page["evaluate"];
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
	// ensureLoggedIn() - Ensure Authenticated Session
	// ═══════════════════════════════════════════════════════════════════════════

	describe("ensureLoggedIn()", () => {
		test("returns immediately when inbox link exists (already logged in)", async () => {
			const page = pageMock();
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockResolvedValue(
					{} as import("puppeteer").ElementHandle<Element>,
				) as Page["$"];

			await ensureLoggedIn(page);

			expect(loginMock).not.toHaveBeenCalled();
		});

		test("triggers login when no login indicators are found", async () => {
			const page = pageMock();
			page.$ = jest.fn<() => Promise<null>>().mockResolvedValue(null);
			loginMock.mockResolvedValue(undefined);

			await ensureLoggedIn(page);

			expect(loginMock).toHaveBeenCalledWith(page, {
				username: "u",
				password: "p",
			});
		});

		test("throws error when credentials are not configured", async () => {
			configMock.IG_USER = "";
			configMock.IG_PASS = "";
			const page = pageMock();
			page.$ = jest
				.fn<
					(
						selector: string,
					) => Promise<import("puppeteer").ElementHandle<Element> | null>
				>()
				.mockResolvedValue(null) as Page["$"];

			jest.resetModules();
			const { ensureLoggedIn: freshEnsureLoggedIn } = await import(
				"./profileNavigation.ts"
			);

			await expect(freshEnsureLoggedIn(page)).rejects.toThrow(
				"Instagram credentials not configured",
			);
			expect(loginMock).not.toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// navigateToProfileAndCheck() - Navigate and Check Status
	// ═══════════════════════════════════════════════════════════════════════════

	describe("navigateToProfileAndCheck()", () => {
		test("combines navigation and status checking in one call", async () => {
			const page = pageMock();
			page.evaluate = jest
				.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<string>>()
				.mockResolvedValue("text") as Page["evaluate"];
			parseProfileStatusMock.mockReturnValue({
				isPrivate: false,
				notFound: true,
			});

			const status = await navigateToProfileAndCheck(page, "abc", {
				timeout: 111,
				waitForHeader: true,
			});

			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/abc/",
				expect.objectContaining({ timeout: 111 }),
			);
			expect(status).toEqual({
				isPrivate: false,
				notFound: true,
				isAccessible: false,
			});
		});
	});
});
