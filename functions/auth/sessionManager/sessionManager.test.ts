import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import {
	getUserDataDir,
	isLoggedIn,
	loadCookies,
	saveCookies,
} from "./sessionManager.ts";

jest.mock("node:fs", () => ({
	readFileSync: jest.fn<any>(() => "[]"),
	writeFileSync: jest.fn<any>(),
	existsSync: jest.fn<any>(() => true),
	mkdirSync: jest.fn<any>(),
	unlinkSync: jest.fn<any>(),
}));

const page = {
	setCookie: jest.fn<any>().mockResolvedValue(undefined),
	cookies: jest.fn<any>().mockResolvedValue([]),
} as unknown as Page;

describe("sessionManager", () => {
	test("getUserDataDir returns string", () => {
		expect(typeof getUserDataDir()).toBe("string");
	});

	test("loadCookies resolves", async () => {
		await expect(loadCookies(page)).resolves.not.toThrow();
	});

	test("saveCookies resolves", async () => {
		await expect(saveCookies(page)).resolves.not.toThrow();
	});

	test("isLoggedIn resolves", async () => {
		await expect(isLoggedIn(page)).resolves.not.toThrow();
	});
});
