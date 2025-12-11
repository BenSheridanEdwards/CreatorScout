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

const COOKIES_FILE = "instagram_cookies.json";

const sessionDirFromModule = path.dirname(getUserDataDir());
const cookiesFilePath = path.join(sessionDirFromModule, COOKIES_FILE);

type MockPage = Page & {
	setCookie: jest.MockedFunction<Page["setCookie"]>;
	cookies: jest.MockedFunction<Page["cookies"]>;
	goto: jest.MockedFunction<Page["goto"]>;
	$: jest.MockedFunction<Page["$"]>;
};

describe("sessionManager", () => {
	let page: MockPage;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.restoreAllMocks();

		fs.rmSync(sessionDirFromModule, { recursive: true, force: true });

		page = {
			setCookie: jest.fn<Page["setCookie"]>().mockResolvedValue(undefined),
			cookies: jest.fn<Page["cookies"]>().mockResolvedValue([]),
			goto: jest.fn<Page["goto"]>().mockResolvedValue(null),
			$: jest.fn<Page["$"]>().mockResolvedValue(null),
		} as unknown as MockPage;
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

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
			expect(fs.existsSync(cookiesFilePath)).toBe(true);
			const saved = JSON.parse(fs.readFileSync(cookiesFilePath, "utf-8"));
			expect(saved).toEqual(mockCookies);
		});

		test("creates session directory if it does not exist", async () => {
			page.cookies.mockResolvedValue([]);

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
		});

		test("does not create directory if it already exists", async () => {
			page.cookies.mockResolvedValue([]);
			fs.mkdirSync(sessionDirFromModule, { recursive: true });

			await saveCookies(page);

			expect(fs.existsSync(sessionDirFromModule)).toBe(true);
		});

		test("handles errors gracefully", async () => {
			page.cookies.mockRejectedValue(new Error("Failed to get cookies"));

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
			page.setCookie.mockResolvedValue(undefined);

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
			const mockInboxElement = {
				click: jest.fn(),
			} as unknown as ElementHandle<Element>;
			page.$.mockResolvedValue(mockInboxElement);

			const result = await isLoggedIn(page);

			expect(result).toBe(true);
			expect(page.$).toHaveBeenCalledWith('a[href="/direct/inbox/"]');
		});

		test("returns false when inbox link is not found", async () => {
			page.$.mockResolvedValue(null);

			const result = await isLoggedIn(page);

			expect(result).toBe(false);
			expect(page.$).toHaveBeenCalledWith('a[href="/direct/inbox/"]');
		});

		test("returns false when selector fails", async () => {
			page.$.mockRejectedValue(new Error("Selector error"));

			const result = await isLoggedIn(page);

			expect(result).toBe(false);
		});

		test("checks for inbox element immediately", async () => {
			const mockInboxElement = {
				click: jest.fn(),
			} as unknown as ElementHandle<Element>;
			page.$.mockResolvedValue(mockInboxElement);

			const result = await isLoggedIn(page);

			expect(result).toBe(true);
			expect(page.$).toHaveBeenCalledWith('a[href="/direct/inbox/"]');
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
