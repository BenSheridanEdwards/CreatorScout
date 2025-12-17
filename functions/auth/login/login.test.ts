import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { login } from "./login.ts";

// For now, let's skip complex mocking and focus on basic behavior testing
// The functions will use their real implementations but we'll mock at the page level

// Create a more realistic page mock that simulates actual browser behavior
const createMockPage = (): Page =>
	({
		goto: jest.fn<any>().mockResolvedValue(undefined),
		$: jest.fn<any>().mockImplementation(async (selector: string) => {
			const el = {
				click: jest.fn<any>().mockResolvedValue(undefined),
				type: jest.fn<any>().mockResolvedValue(undefined),
			};
			if (selector.includes("username") || selector.includes("Phone number"))
				return el;
			if (selector.includes("password")) return el;
			if (selector.includes('button[type="submit"]')) return el;
			return null;
		}),
		$$: jest.fn<any>().mockResolvedValue([]),
		waitForSelector: jest.fn<any>().mockResolvedValue({} as unknown),
		waitForFunction: jest.fn<any>().mockResolvedValue(undefined),
		type: jest.fn<any>().mockResolvedValue(undefined),
		click: jest.fn<any>().mockResolvedValue(undefined),
		evaluate: jest.fn<any>().mockResolvedValue(""),
		url: jest.fn<any>().mockReturnValue("https://www.instagram.com/"),
		keyboard: { press: jest.fn<any>().mockResolvedValue(undefined) },
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

		// Verify username typing happened (login.ts types into the focused field)
		expect(page.type).toHaveBeenCalledWith(
			"input:focus",
			"testuser",
			expect.objectContaining({ delay: expect.any(Number) }),
		);

		// Submit is clicked via element handle (page.$(...).click())
		expect(page.$).toHaveBeenCalledWith('button[type="submit"]');
	});

	test("handles login form timeout", async () => {
		// Mock username selector to never resolve to simulate missing form fields
		page.$ = jest.fn<any>().mockResolvedValue(null);

		await expect(
			login(page, { username: "testuser", password: "testpass" }),
		).rejects.toThrow("Could not find username input field");
	});

	test("handles login failures", async () => {
		// Simulate a failure to complete login (timeout waiting for success indicators)
		page.waitForFunction = jest
			.fn<any>()
			.mockRejectedValue(new Error("Timeout"));
		page.evaluate = jest.fn<any>().mockResolvedValue("");

		await expect(
			login(page, { username: "testuser", password: "testpass" }),
		).rejects.toThrow("Login timeout");
	});

	test("handles Instagram error messages", async () => {
		// Mock successful field discovery but failed login completion
		page.waitForFunction = jest
			.fn<any>()
			.mockRejectedValue(new Error("Timeout"));

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
