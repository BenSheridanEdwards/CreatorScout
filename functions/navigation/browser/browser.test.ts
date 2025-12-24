/**
 * Browser Helper Tests
 *
 * Updated for GoLogin-first flow:
 * - createBrowser() uses GoLogin when token is available and LOCAL_BROWSER is false
 * - createBrowser() launches local Puppeteer when LOCAL_BROWSER is true
 * - createPage() applies minimal stealth patches only when `applyStealth: true`
 */

import { jest } from "@jest/globals";
import type { Browser, Page } from "puppeteer";

// Mock external dependencies BEFORE importing the module
const mockLaunch = jest.fn<(options: object) => Promise<Browser>>();
const mockGetUserDataDir = jest
	.fn<() => string>()
	.mockReturnValue("/tmp/test-data");
const mockConfig = {
	LOCAL_BROWSER: true,
	GOLOGIN_API_TOKEN: "gologin-token",
	GOLOGIN_USE_LOCAL: false,
	GOLOGIN_VPS_IP: "localhost",
};

jest.unstable_mockModule("puppeteer", () => ({
	default: {
		launch: mockLaunch,
	},
}));
jest.unstable_mockModule("../../auth/sessionManager/sessionManager.ts", () => ({
	getUserDataDir: mockGetUserDataDir,
}));
jest.unstable_mockModule("../../shared/config/config.ts", () => mockConfig);
const mockConnectToGoLogin = jest
	.fn<() => Promise<Browser>>()
	.mockResolvedValue({
		pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
	} as unknown as Browser);

jest.unstable_mockModule("./goLoginConnector.ts", () => ({
	connectToGoLoginProfile: mockConnectToGoLogin,
}));

// Helper to import module after any config tweaks
const loadBrowserModule = async () => {
	jest.resetModules();
	return await import("./browser.ts");
};

describe("browser helpers", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockConfig.LOCAL_BROWSER = true;
		mockConfig.GOLOGIN_API_TOKEN = "gologin-token";
		process.env.LOCAL_BROWSER = "true";
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// createBrowser() - Local Mode
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createBrowser() - Local browser mode", () => {
		test("launches local browser with standard arguments", async () => {
			// Ensure LOCAL_BROWSER is set for this test
			process.env.LOCAL_BROWSER = "true";
			const fakeBrowser = {
				newPage: jest.fn<() => Promise<Page>>(),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
			} as unknown as Browser;
			mockLaunch.mockResolvedValue(fakeBrowser);
			const { createBrowser } = await loadBrowserModule();

			await createBrowser({ headless: false, userDataDir: "/tmp/custom" });

			expect(mockLaunch).toHaveBeenCalledWith({
				headless: false,
				args: [
					"--no-sandbox",
					"--disable-dev-shm-usage",
					"--disable-features=VizDisplayCompositor",
					"--disable-blink-features=AutomationControlled",
					"--disable-features=IsolateOrigins,site-per-process",
					"--disable-web-security",
					"--disable-features=BlockInsecurePrivateNetworkRequests",
				],
				userDataDir: "/tmp/custom",
			});
		});

		test.skip("uses persistent user data directory from sessionManager when not specified", async () => {
			const fakeBrowser = {
				newPage: jest.fn<() => Promise<Page>>(),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
			} as unknown as Browser;
			mockLaunch.mockResolvedValue(fakeBrowser);
			const { createBrowser } = await loadBrowserModule();

			await createBrowser();

			expect(mockGetUserDataDir).toHaveBeenCalled();
			expect(mockLaunch).toHaveBeenCalledWith(
				expect.objectContaining({ userDataDir: "/tmp/test-data" }),
			);
		});

		test.skip("uses custom user data directory when explicitly provided", async () => {
			const fakeBrowser = {
				newPage: jest.fn<() => Promise<Page>>(),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
			} as unknown as Browser;
			mockLaunch.mockResolvedValue(fakeBrowser);
			const { createBrowser } = await loadBrowserModule();

			await createBrowser({ userDataDir: "/tmp/custom" });

			expect(mockLaunch).toHaveBeenCalledWith(
				expect.objectContaining({ userDataDir: "/tmp/custom" }),
			);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// createBrowser() - GoLogin mode
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createBrowser() - GoLogin mode", () => {
		test("connects to GoLogin when goLoginToken is available and LOCAL_BROWSER is false", async () => {
			mockConfig.LOCAL_BROWSER = false;
			delete process.env.LOCAL_BROWSER;
			mockConfig.GOLOGIN_API_TOKEN = "token-123";
			const { createBrowser } = await loadBrowserModule();

			await createBrowser();
			// We don't assert internal connector args here; connector is unit-tested separately.
			expect(mockLaunch).not.toHaveBeenCalled();
		});

		test("falls back to local Puppeteer when no GoLogin token is configured", async () => {
			mockConfig.LOCAL_BROWSER = false;
			mockConfig.GOLOGIN_API_TOKEN = undefined as unknown as string;
			delete process.env.LOCAL_BROWSER;
			const fakeBrowser = {
				newPage: jest.fn<() => Promise<Page>>(),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
			} as unknown as Browser;
			mockLaunch.mockResolvedValue(fakeBrowser);
			const { createBrowser } = await loadBrowserModule();

			await createBrowser();
			expect(mockLaunch).toHaveBeenCalled();
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// createPage() - Page Configuration
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createPage() - Page creation and configuration", () => {
		test("configures page with default timeouts and viewport", async () => {
			const mockPage = {
				setDefaultNavigationTimeout: jest.fn<(ms: number) => void>(),
				setDefaultTimeout: jest.fn<(ms: number) => void>(),
				setViewport: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				setUserAgent: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				setExtraHTTPHeaders: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluateOnNewDocument: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				on: jest.fn<(event: string, handler: unknown) => void>(),
			} as unknown as Page;
			const mockBrowser = {
				newPage: jest.fn<() => Promise<Page>>().mockResolvedValue(mockPage),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([mockPage]),
			} as unknown as Browser;
			const { createPage } = await loadBrowserModule();

			await createPage(mockBrowser, { applyStealth: false });

			expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(30000);
			expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(15000);
			expect(mockPage.setViewport).toHaveBeenCalledWith({
				width: 1440,
				height: 900,
			});
			expect(mockPage.setUserAgent).toHaveBeenCalled();
			expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalled();
		});

		test("allows overriding default page configuration", async () => {
			const mockPage = {
				setDefaultNavigationTimeout: jest.fn<(ms: number) => void>(),
				setDefaultTimeout: jest.fn<(ms: number) => void>(),
				setViewport: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				setUserAgent: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				setExtraHTTPHeaders: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluateOnNewDocument: jest
					.fn<() => Promise<void>>()
					.mockResolvedValue(undefined),
				on: jest.fn<(event: string, handler: unknown) => void>(),
			} as unknown as Page;
			const mockBrowser = {
				newPage: jest.fn<() => Promise<Page>>().mockResolvedValue(mockPage),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([mockPage]),
			} as unknown as Browser;
			const { createPage } = await loadBrowserModule();

			await createPage(mockBrowser, {
				defaultNavigationTimeout: 5000,
				defaultTimeout: 4000,
				viewport: { width: 800, height: 600 },
				userAgent: "custom-agent",
				applyStealth: false,
			});

			expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(5000);
			expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(4000);
			expect(mockPage.setViewport).toHaveBeenCalledWith({
				width: 800,
				height: 600,
			});
			expect(mockPage.setUserAgent).toHaveBeenCalledWith("custom-agent");
		});
	});
});
