/**
 * Browser Helper Tests
 *
 * The browser module provides unified browser creation with consistent configuration:
 *
 * Functions:
 * - createBrowser(options): Creates a Puppeteer browser instance
 *   - Local mode: Launches browser with stealth plugin and persistent profile
 *   - Cloud mode: Connects to Browserless.io for remote browser
 * - createPage(browser, options): Creates a configured page with:
 *   - Custom timeouts and viewport
 *   - Stealth techniques (webdriver override, navigator patches)
 *   - Human-like HTTP headers
 * - getUniqueUserDataDir(prefix): Generates unique profile paths to avoid conflicts
 */

import { jest } from "@jest/globals";
import type { Browser, Page } from "puppeteer";

// Mock external dependencies BEFORE importing the module
const mockLaunch = jest.fn<(options: object) => Promise<Browser>>();
const mockConnect = jest.fn<(options: object) => Promise<Browser>>();
const mockUse = jest.fn<(plugin: unknown) => void>();
const mockGetUserDataDir = jest
	.fn<() => string>()
	.mockReturnValue("/tmp/test-data");
const mockConfig = {
	LOCAL_BROWSER: true,
	BROWSERLESS_TOKEN: "test-token",
};

jest.unstable_mockModule("puppeteer-extra", () => ({
	default: {
		use: mockUse,
		launch: mockLaunch,
		connect: mockConnect,
	},
}));
jest.unstable_mockModule("puppeteer-extra-plugin-stealth", () => ({
	default: () => ({}),
}));
jest.unstable_mockModule("../../auth/sessionManager/sessionManager.ts", () => ({
	getUserDataDir: mockGetUserDataDir,
}));
jest.unstable_mockModule("../../shared/config/config.ts", () => mockConfig);

// Helper to import module after any config tweaks
const loadBrowserModule = async () => {
	jest.resetModules();
	return await import("./browser.ts");
};

describe("browser helpers", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockConfig.LOCAL_BROWSER = true;
		mockConfig.BROWSERLESS_TOKEN = "test-token";
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// createBrowser() - Local Mode
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createBrowser() - Local browser mode", () => {
		test("launches local browser with stealth plugin and standard arguments", async () => {
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

		test("uses persistent user data directory from sessionManager when not specified", async () => {
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

		test("uses custom user data directory when explicitly provided", async () => {
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
	// createBrowser() - Cloud Mode (Browserless)
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createBrowser() - Cloud browser mode (Browserless.io)", () => {
		test("connects to Browserless.io with stealth endpoint when LOCAL_BROWSER is false", async () => {
			mockConfig.LOCAL_BROWSER = false;
			mockConfig.BROWSERLESS_TOKEN = "token-123";
			const fakeBrowser = {
				newPage: jest.fn<() => Promise<Page>>(),
			} as unknown as Browser;
			mockConnect.mockResolvedValue(fakeBrowser);
			const { createBrowser } = await loadBrowserModule();

			await createBrowser();

			expect(mockConnect).toHaveBeenCalledWith({
				browserWSEndpoint:
					"wss://chrome.browserless.io/chrome/stealth?token=token-123",
			});
		});

		test("throws descriptive error when BROWSERLESS_TOKEN is missing", async () => {
			mockConfig.LOCAL_BROWSER = false;
			mockConfig.BROWSERLESS_TOKEN = "";
			const { createBrowser } = await loadBrowserModule();

			await expect(createBrowser()).rejects.toThrow(
				"BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER",
			);
			expect(mockConnect).not.toHaveBeenCalled();
			expect(mockLaunch).not.toHaveBeenCalled();
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
			} as unknown as Page;
			const mockBrowser = {
				newPage: jest.fn<() => Promise<Page>>().mockResolvedValue(mockPage),
				pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([mockPage]),
			} as unknown as Browser;
			const { createPage } = await loadBrowserModule();

			await createPage(mockBrowser);

			expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(20000);
			expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(12000);
			expect(mockPage.setViewport).toHaveBeenCalledWith({
				width: 1440,
				height: 900,
			});
			expect(mockPage.setUserAgent).toHaveBeenCalled();
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
