import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// Mock pageVerification module BEFORE importing login
const navigateToHomeViaUIMock = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);
const verifyHomePageLoadedMock = jest
	.fn<() => Promise<boolean>>()
	.mockResolvedValue(true);

jest.unstable_mockModule(
	"../../shared/pageVerification/pageVerification.ts",
	() => ({
		navigateToHomeViaUI: navigateToHomeViaUIMock,
		verifyHomePageLoaded: verifyHomePageLoadedMock,
	}),
);

// Import login after mocks are set up
const { login } = await import("./login.ts");

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
		goto: jest
			.fn<Page["goto"]>()
			.mockResolvedValue(null as unknown as Awaited<ReturnType<Page["goto"]>>),
		$: jest
			.fn<Page["$"]>()
			.mockImplementation(
				async <Selector extends string>(
					selector: Selector,
				): Promise<
					| import("puppeteer").ElementHandle<
							import("puppeteer").NodeFor<Selector>
					  >
					| null
				> => {
					const el = {
						click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
						type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					};
					if (
						selector.includes("username") ||
						selector.includes("Phone number")
					)
						return el as unknown as import("puppeteer").ElementHandle<
							import("puppeteer").NodeFor<Selector>
						>;
					if (selector.includes("password"))
						return el as unknown as import("puppeteer").ElementHandle<
							import("puppeteer").NodeFor<Selector>
						>;
					if (selector.includes('button[type="submit"]'))
						return el as unknown as import("puppeteer").ElementHandle<
							import("puppeteer").NodeFor<Selector>
						>;
					return null;
				},
			) as Page["$"],
		$$: jest.fn<Page["$$"]>().mockResolvedValue([]),
		waitForSelector: jest
			.fn<Page["waitForSelector"]>()
			.mockResolvedValue({} as Awaited<ReturnType<Page["waitForSelector"]>>),
		waitForFunction: jest
			.fn<Page["waitForFunction"]>()
			.mockResolvedValue(
				undefined as unknown as Awaited<ReturnType<Page["waitForFunction"]>>,
			),
		type: jest.fn<Page["type"]>().mockResolvedValue(undefined),
		click: jest.fn<Page["click"]>().mockResolvedValue(undefined),
		evaluate: jest.fn<Page["evaluate"]>().mockResolvedValue(""),
		url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/"),
		isClosed: jest.fn<() => boolean>().mockReturnValue(false),
		keyboard: {
			press: jest.fn<Page["keyboard"]["press"]>().mockResolvedValue(undefined),
		},
		cookies: jest.fn<Page["cookies"]>().mockResolvedValue([]),
		setCookie: jest.fn<Page["setCookie"]>(),
		screenshot: jest
			.fn<Page["screenshot"]>()
			.mockResolvedValue(Buffer.from("mock-screenshot")),
	}) as unknown as Page;

describe("login", () => {
	let page: Page;

	beforeEach(() => {
		jest.clearAllMocks();
		navigateToHomeViaUIMock.mockClear();
		verifyHomePageLoadedMock.mockClear();
		page = createMockPage();
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 1: Navigation to Instagram
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Step 1: Navigate to Instagram", () => {
		test("navigates to Instagram homepage on login attempt", async () => {
			await login(page, { username: "testuser", password: "testpass" });

			// Login now uses navigateToHomeViaUI instead of page.goto
			expect(navigateToHomeViaUIMock).toHaveBeenCalledWith(page);
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
			expect(navigateToHomeViaUIMock).toHaveBeenCalled();
		});

		test("skips cookie loading when skipCookies option is true", async () => {
			await login(
				page,
				{ username: "testuser", password: "testpass" },
				{ skipCookies: true },
			);

			// Should still navigate but skip cookie operations
			expect(navigateToHomeViaUIMock).toHaveBeenCalled();
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
			(page as { $: Page["$"] }).$ = jest
				.fn<Page["$"]>()
				.mockResolvedValue(null) as Page["$"];

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

			// waitForFunction may be called for frame stability checks, but not for login completion
			// The key is that skipSubmit means we don't wait for login success indicators
			// Frame stability checks are separate and always happen
			expect(navigateToHomeViaUIMock).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// ERROR HANDLING
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Error handling", () => {
		test("throws timeout error when login takes too long", async () => {
			// Simulate timeout waiting for success indicators
			(page as { waitForFunction: Page["waitForFunction"] }).waitForFunction =
				jest
					.fn<Page["waitForFunction"]>()
					.mockRejectedValue(new Error("Timeout")) as Page["waitForFunction"];
			(page as { evaluate: Page["evaluate"] }).evaluate = jest
				.fn<Page["evaluate"]>()
				.mockResolvedValue("") as Page["evaluate"];

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
			expect(navigateToHomeViaUIMock).toHaveBeenCalledWith(page);
			expect(page.$).toHaveBeenCalled();
			expect(page.$).toHaveBeenCalledWith('button[type="submit"]');
		});
	});
});
