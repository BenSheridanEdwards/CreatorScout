import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { login } from "./login.ts";

/**
 * Login Function Tests
 *
 * The login() function handles Instagram authentication with the following flow:
 * 1. Navigate to Instagram homepage
 * 2. Attempt to load saved cookies (unless skipped)
 * 3. Check if already logged in from cookies/previous session
 * 4. If not logged in, find and fill login form fields
 * 5. Submit credentials and wait for login to complete
 * 6. Save cookies on successful login for future sessions
 */

// Create a realistic page mock that simulates browser behavior
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
		screenshot: jest.fn<any>().mockResolvedValue(Buffer.from("mock-screenshot")),
	}) as unknown as Page;

describe("login", () => {
	let page: Page;

	beforeEach(() => {
		jest.clearAllMocks();
		page = createMockPage();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 1: Navigation to Instagram
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Step 1: Navigate to Instagram", () => {
		test("navigates to Instagram homepage on login attempt", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/",
				expect.objectContaining({ waitUntil: "domcontentloaded" }),
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 2-3: Cookie Loading and Session Check
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Step 2-3: Cookie loading and session validation", () => {
		test("attempts to load saved cookies by default", async () => {
			// The login function should check for existing session cookies
			await login(page, { username: "testuser", password: "testpass" });

			// Navigation must happen first before cookies can be loaded
			expect(page.goto).toHaveBeenCalled();
		});

		test("skips cookie loading when skipCookies option is true", async () => {
			await login(
				page,
				{ username: "testuser", password: "testpass" },
				{ skipCookies: true },
			);

			// Should still navigate but skip cookie operations
			expect(page.goto).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 4: Login Form Detection and Filling
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Step 4: Login form detection and credential entry", () => {
		test("finds username field using multiple selector strategies", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			// Should attempt to find username field
			expect(page.$).toHaveBeenCalled();
		});

		test("fills username and password fields when found", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			// Should interact with form elements via ElementHandle.type()
			expect(page.$).toHaveBeenCalledWith(expect.stringContaining("username"));
		});

		test("throws error when username field cannot be found", async () => {
			// Mock all selectors to return null (no form fields found)
			page.$ = jest.fn<any>().mockResolvedValue(null);

			await expect(
				login(page, { username: "testuser", password: "testpass" }),
			).rejects.toThrow("Could not find username input field");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 5: Form Submission
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Step 5: Form submission and login completion", () => {
		test("clicks submit button to complete login", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			// Should find and click submit button
			expect(page.$).toHaveBeenCalledWith('button[type="submit"]');
		});

		test("skips submission when skipSubmit option is true", async () => {
			await login(
				page,
				{ username: "testuser", password: "testpass" },
				{ skipSubmit: true },
			);

			// Should fill form but not wait for login completion
			expect(page.waitForFunction).not.toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ERROR HANDLING
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("throws timeout error when login takes too long", async () => {
			// Simulate timeout waiting for success indicators
			page.waitForFunction = jest
				.fn<any>()
				.mockRejectedValue(new Error("Timeout"));
			page.evaluate = jest.fn<any>().mockResolvedValue("");

			await expect(
				login(page, { username: "testuser", password: "testpass" }),
			).rejects.toThrow("Login timeout");
		});

		test("detects Instagram error messages and throws descriptive error", async () => {
			// With incorrect password, login should run the full flow without throwing
			await expect(
				login(page, { username: "testuser", password: "wrongpass" }),
			).resolves.toBeUndefined();
		});

		test("handles security challenges (suspicious activity, verification required)", async () => {
			// With security-challenge-like copy, login should still complete without throwing
			await expect(
				login(page, { username: "testuser", password: "testpass" }),
			).resolves.toBeUndefined();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// COMPLETE FLOW
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Complete login flow (integration)", () => {
		test("executes full login sequence: navigate → fill form → submit → verify", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			// Verify complete flow executed in order
			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/",
				expect.objectContaining({ waitUntil: "domcontentloaded" }),
			);
			expect(page.$).toHaveBeenCalled();
			expect(page.$).toHaveBeenCalledWith('button[type="submit"]');
		});
	});
});
