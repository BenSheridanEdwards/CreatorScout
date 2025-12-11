import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { login } from "./login.ts";

// For now, let's skip complex mocking and focus on basic behavior testing
// The functions will use their real implementations but we'll mock at the page level

// Create a more realistic page mock that simulates actual browser behavior
const createMockPage = (): Page =>
	({
		goto: jest.fn<any>().mockResolvedValue(undefined),
		$: jest.fn<any>().mockResolvedValue(null),
		$$: jest.fn<any>().mockResolvedValue([]),
		waitForSelector: jest.fn<any>().mockResolvedValue({} as unknown),
		type: jest.fn<any>().mockResolvedValue(undefined),
		click: jest.fn<any>().mockResolvedValue(undefined),
		evaluate: jest.fn<any>().mockResolvedValue(""),
		url: jest.fn<any>().mockReturnValue("https://www.instagram.com/"),
		keyboard: { press: jest.fn<any>() },
		cookies: jest.fn<any>().mockResolvedValue([]),
		setCookie: jest.fn<any>(),
	}) as unknown as Page;

describe("login", () => {
	let page: Page;

	beforeEach(() => {
		jest.clearAllMocks();
		page = createMockPage();
	});

	test("successful login flow", async () => {
		// Test the complete happy path
		await login(page, { username: "testuser", password: "testpass" });

		// Verify navigation happened
		expect(page.goto).toHaveBeenCalledWith(
			"https://www.instagram.com/",
			expect.objectContaining({ waitUntil: "domcontentloaded" }),
		);

		// Verify form was filled and submitted
		expect(page.type).toHaveBeenCalledWith(
			'input[name="username"]',
			"testuser",
			{ delay: 5 },
		);
		expect(page.type).toHaveBeenCalledWith(
			'input[name="password"]',
			"testpass",
			{ delay: 5 },
		);
		expect(page.click).toHaveBeenCalledWith('button[type="submit"]');
	});

	test("handles login form timeout", async () => {
		// Mock waitForSelector to simulate timeout
		page.waitForSelector = jest
			.fn<any>()
			.mockRejectedValue(new Error("Timeout"));

		await expect(
			login(page, { username: "testuser", password: "testpass" }),
		).rejects.toThrow("Could not find login form");
	});

	test("handles login failures", async () => {
		// Mock waitForSelector to simulate timeout
		page.waitForSelector = jest
			.fn<any>()
			.mockRejectedValue(new Error("Timeout"));

		await expect(
			login(page, { username: "testuser", password: "testpass" }),
		).rejects.toThrow("Could not find login form");
	});

	test("handles Instagram error messages", async () => {
		// Mock successful form submission but failed login
		page.waitForSelector = jest
			.fn<any>()
			.mockResolvedValueOnce({}) // Username field found
			.mockRejectedValueOnce(new Error("Timeout")); // Inbox not found

		page.evaluate = jest
			.fn<any>()
			.mockResolvedValue(
				"Sorry, your password was incorrect. Please double-check your password.",
			);

		await expect(
			login(page, { username: "testuser", password: "wrongpass" }),
		).rejects.toThrow("Login failed");
	});
});
