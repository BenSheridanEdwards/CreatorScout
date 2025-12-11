import { jest } from "@jest/globals";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Page } from "puppeteer";
import {
	clearCookies,
	getUserDataDir,
	isLoggedIn,
	loadCookies,
	saveCookies,
} from "./sessionManager.ts";

const COOKIES_FILE = "instagram_cookies.json";

const sessionDirFromModule = path.dirname(getUserDataDir());
const cookiesFilePath = path.join(sessionDirFromModule, COOKIES_FILE);

describe("sessionManager", () => {
	let page: Page;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.restoreAllMocks();

		fs.rmSync(sessionDirFromModule, { recursive: true, force: true });

		page = {
			setCookie: jest.fn<any>().mockResolvedValue(undefined),
			cookies: jest.fn<any>().mockResolvedValue([]),
			goto: jest.fn<any>().mockResolvedValue(undefined),
			$: jest.fn<any>().mockResolvedValue(null),
		} as unknown as Page;
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
		fs.rmSync(sessionDirFromModule, { recursive: true, force: true });
	});

	describe("getUserDataDir", () => {
		test("returns a string path containing browser_profile", () => {
			const result = getUserDataDir();
			expect(typeof result).toBe("string");
			expect(result).toContain("browser_profile");
			expect(result).toContain(".sessions");
		});
	});

	describe("saveCookies", () => {
		test("saves cookies to file when page has cookies", async () => {
			const mockCookies = [
				{ name: "sessionid", value: "abc123", domain: ".instagram.com" },
				{ name: "csrftoken", value: "xyz789", domain: ".instagram.com" },
			];

			(page.cookies as jest.Mock).mockResolvedValue(mockCookies);

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
			expect(fs.existsSync(cookiesFilePath)).toBe(true);
			const saved = JSON.parse(fs.readFileSync(cookiesFilePath, "utf-8"));
			expect(saved).toEqual(mockCookies);
		});

		test("creates session directory if it does not exist", async () => {
			(page.cookies as jest.Mock).mockResolvedValue([]);

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
		});

		test("does not create directory if it already exists", async () => {
			(page.cookies as jest.Mock).mockResolvedValue([]);
			fs.mkdirSync(sessionDirFromModule, { recursive: true });

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
		});

		test("handles errors gracefully", async () => {
			(page.cookies as jest.Mock).mockRejectedValue(
				new Error("Failed to get cookies"),
			);

			await expect(saveCookies(page)).resolves.not.toThrow();
		});
	});

	describe("loadCookies", () => {
		test("returns false when cookies file does not exist", async () => {
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
			fs.writeFileSync(cookiesFilePath, "invalid json");

			const result = await loadCookies(page);

			expect(result).toBe(false);
		});

		test("returns false when cookies file contains non-array", async () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, '{"not":"an array"}');

			const result = await loadCookies(page);

			expect(result).toBe(false);
			expect(page.setCookie).not.toHaveBeenCalled();
		});

		test("loads and sets cookies when valid cookies file exists", async () => {
			const mockCookies = [
				{ name: "sessionid", value: "abc123", domain: ".instagram.com" },
				{ name: "csrftoken", value: "xyz789", domain: ".instagram.com" },
			];

			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, JSON.stringify(mockCookies));
			(page.setCookie as jest.Mock).mockResolvedValue(undefined);

			const result = await loadCookies(page);

			expect(result).toBe(true);
			expect(page.setCookie).toHaveBeenCalledWith(
				mockCookies[0],
				mockCookies[1],
			);
		});
	});

	describe("isLoggedIn", () => {
		test("returns true when inbox link is found", async () => {
			const mockInboxElement = { click: jest.fn() };
			(page.goto as jest.Mock).mockResolvedValue(undefined);
			(page.$ as jest.Mock).mockResolvedValue(mockInboxElement);

			const resultPromise = isLoggedIn(page);

			await jest.runAllTimersAsync();

			const result = await resultPromise;

			expect(result).toBe(true);
			expect(page.goto).toHaveBeenCalledWith("https://www.instagram.com/", {
				waitUntil: "domcontentloaded",
				timeout: 10000,
			});
			expect(page.$).toHaveBeenCalledWith('a[href="/direct/inbox/"]');
		});

		test("returns false when inbox link is not found", async () => {
			(page.goto as jest.Mock).mockResolvedValue(undefined);
			(page.$ as jest.Mock).mockResolvedValue(null);

			const resultPromise = isLoggedIn(page);

			await jest.runAllTimersAsync();

			const result = await resultPromise;

			expect(result).toBe(false);
			expect(page.goto).toHaveBeenCalled();
			expect(page.$).toHaveBeenCalledWith('a[href="/direct/inbox/"]');
		});

		test("returns false when navigation fails", async () => {
			(page.goto as jest.Mock).mockRejectedValue(
				new Error("Navigation timeout"),
			);

			const result = await isLoggedIn(page);

			expect(result).toBe(false);
		});

		test("waits for page to load before checking", async () => {
			const mockInboxElement = { click: jest.fn() };
			(page.goto as jest.Mock).mockResolvedValue(undefined);
			(page.$ as jest.Mock).mockResolvedValue(mockInboxElement);

			const resultPromise = isLoggedIn(page);

			await jest.runAllTimersAsync();

			const result = await resultPromise;

			expect(result).toBe(true);
		});
	});

	describe("clearCookies", () => {
		test("deletes cookies file when it exists", () => {
			fs.mkdirSync(sessionDirFromModule, { recursive: true });
			fs.writeFileSync(cookiesFilePath, "data");

			clearCookies();

			expect(fs.existsSync(cookiesFilePath)).toBe(false);
		});

		test("does not delete file when it does not exist", () => {
			clearCookies();

			expect(fs.existsSync(cookiesFilePath)).toBe(false);
		});
	});
});
