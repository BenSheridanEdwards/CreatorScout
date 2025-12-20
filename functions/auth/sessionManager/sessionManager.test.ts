import { jest } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ElementHandle, Page } from "puppeteer";
import {
	clearCookies,
	getUserDataDir,
	isLoggedIn,
	loadCookies,
	saveCookies,
} from "./sessionManager.ts";

/**
 * Session Manager Tests
 *
 * The sessionManager module provides cookie-based session persistence to:
 * 1. Avoid repeated logins (reduces detection risk)
 * 2. Maintain session state across browser restarts
 * 3. Provide login status checking without navigation
 *
 * Functions:
 * - getUserDataDir(): Returns path for browser profile storage
 * - saveCookies(page): Extracts and persists cookies from browser
 * - loadCookies(page): Restores saved cookies to browser
 * - isLoggedIn(page): Checks for Instagram login indicators
 * - clearCookies(): Removes saved session data
 */

const COOKIES_FILE = "instagram_cookies.json";
const sessionDirFromModule = path.dirname(getUserDataDir());
const cookiesFilePath = path.join(sessionDirFromModule, COOKIES_FILE);

type MockPage = Page & {
	setCookie: jest.MockedFunction<Page["setCookie"]>;
	cookies: jest.MockedFunction<Page["cookies"]>;
	goto: jest.MockedFunction<Page["goto"]>;
	$: jest.MockedFunction<Page["$"]>;
	evaluate: jest.MockedFunction<Page["evaluate"]>;
};

describe("sessionManager", () => {
	let page: MockPage;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.restoreAllMocks();

		// Clean slate for each test
		fs.rmSync(sessionDirFromModule, { recursive: true, force: true });

		page = {
			setCookie: jest.fn<Page["setCookie"]>().mockResolvedValue(undefined),
			cookies: jest.fn<Page["cookies"]>().mockResolvedValue([]),
			goto: jest.fn<Page["goto"]>().mockResolvedValue(null),
			$: jest.fn<Page["$"]>().mockResolvedValue(null),
			evaluate: jest.fn<Page["evaluate"]>().mockResolvedValue(false),
		} as unknown as MockPage;
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
		fs.rmSync(sessionDirFromModule, { recursive: true, force: true });
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// getUserDataDir() - Browser Profile Path
	// ═══════════════════════════════════════════════════════════════════════════

	describe("getUserDataDir()", () => {
		test("returns path within .sessions directory", () => {
			const result = getUserDataDir();

			expect(typeof result).toBe("string");
			expect(result).toContain(".sessions");
		});

		test("returns path containing browser_profile subdirectory", () => {
			const result = getUserDataDir();

			expect(result).toContain("browser_profile");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// saveCookies() - Persist Browser Session
	// ═══════════════════════════════════════════════════════════════════════════

	describe("saveCookies()", () => {
		test("creates session directory if it does not exist", async () => {
			page.cookies.mockResolvedValue([]);

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
		});

		test("extracts cookies from page and writes to file", async () => {
			type PageCookies = Awaited<ReturnType<Page["cookies"]>>;
			const mockCookies: PageCookies = [
				{
					name: "sessionid",
					value: "abc123",
					domain: ".instagram.com",
				} as PageCookies[number],
				{
					name: "csrftoken",
					value: "xyz789",
					domain: ".instagram.com",
				} as PageCookies[number],
			];
			page.cookies.mockResolvedValue(mockCookies);

			await saveCookies(page);

			expect(fs.existsSync(cookiesFilePath)).toBe(true);
			const saved = JSON.parse(fs.readFileSync(cookiesFilePath, "utf-8"));
			expect(saved).toEqual(mockCookies);
		});

		test("overwrites existing cookies file with new data", async () => {
			// Create initial cookies
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, JSON.stringify([{ name: "old" }]));

			const newCookies = [{ name: "new", value: "value", domain: ".test.com" }];
			page.cookies.mockResolvedValue(newCookies as import("puppeteer").Cookie[]);

			await saveCookies(page);

			const saved = JSON.parse(fs.readFileSync(cookiesFilePath, "utf-8"));
			expect(saved[0].name).toBe("new");
		});

		test("handles page.cookies() errors gracefully without throwing", async () => {
			page.cookies.mockRejectedValue(new Error("Failed to get cookies"));

			await expect(saveCookies(page)).resolves.not.toThrow();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// loadCookies() - Restore Browser Session
	// ═══════════════════════════════════════════════════════════════════════════

	describe("loadCookies()", () => {
		test("returns false when no cookies file exists", async () => {
			const result = await loadCookies(page);

			expect(result).toBe(false);
			expect(page.setCookie).not.toHaveBeenCalled();
		});

		test("returns false when cookies file is empty array", async () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, "[]");

			const result = await loadCookies(page);

			expect(result).toBe(false);
			expect(page.setCookie).not.toHaveBeenCalled();
		});

		test("returns false when cookies file contains invalid JSON", async () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, "invalid json content");

			const result = await loadCookies(page);

			expect(result).toBe(false);
		});

		test("returns false when cookies file contains non-array JSON", async () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, '{"not":"an array"}');

			const result = await loadCookies(page);

			expect(result).toBe(false);
			expect(page.setCookie).not.toHaveBeenCalled();
		});

		test("loads valid cookies from file and sets them on page", async () => {
			const mockCookies = [
				{ name: "sessionid", value: "abc123", domain: ".instagram.com" },
				{ name: "csrftoken", value: "xyz789", domain: ".instagram.com" },
			];
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, JSON.stringify(mockCookies));
			page.setCookie.mockResolvedValue(undefined);

			const result = await loadCookies(page);

			expect(result).toBe(true);
			expect(page.setCookie).toHaveBeenCalledWith(
				mockCookies[0],
				mockCookies[1],
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// isLoggedIn() - Session Status Check
	// ═══════════════════════════════════════════════════════════════════════════

	describe("isLoggedIn()", () => {
		test("returns true when inbox link element is found (logged in indicator)", async () => {
			// Simulate logged-in state via page.evaluate()
			page.evaluate.mockResolvedValue(true as never);

			const result = await isLoggedIn(page);

			expect(result).toBe(true);
			expect(page.evaluate).toHaveBeenCalled();
		});

		test("returns false when inbox link element is not found", async () => {
			// Simulate logged-out state via page.evaluate()
			page.evaluate.mockResolvedValue(false as never);

			const result = await isLoggedIn(page);

			expect(result).toBe(false);
			expect(page.evaluate).toHaveBeenCalled();
		});

		test("returns false when selector query throws an error", async () => {
			page.evaluate.mockRejectedValue(new Error("Selector error") as never);

			const result = await isLoggedIn(page);

			expect(result).toBe(false);
		});

		test("checks login status without requiring navigation", async () => {
			page.evaluate.mockResolvedValue(true as never);

			await isLoggedIn(page);

			// Should only use selector, not navigate
			expect(page.goto).not.toHaveBeenCalled();
			expect(page.evaluate).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// clearCookies() - Session Cleanup
	// ═══════════════════════════════════════════════════════════════════════════

	describe("clearCookies()", () => {
		test("deletes cookies file when it exists", () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, "data");

			clearCookies();

			expect(fs.existsSync(cookiesFilePath)).toBe(false);
		});

		test("completes without error when cookies file does not exist", () => {
			expect(() => clearCookies()).not.toThrow();
			expect(fs.existsSync(cookiesFilePath)).toBe(false);
		});
	});
});
