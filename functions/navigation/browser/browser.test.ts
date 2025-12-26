/**
 * Browser Helper Tests
 *
 * Updated for AdsPower-first flow:
 * - createBrowser() uses AdsPower when adsPowerProfileId is available and LOCAL_BROWSER is false
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
	DECODO_HOST: "gate.decodo.net",
	DECODO_PORT: 20011,
	DECODO_USERNAME: undefined,
	DECODO_PASSWORD: undefined,
	DECODO_STICKY_SESSION_MIN: 20,
	DECODO_STICKY_SESSION_MAX: 30,
	SMARTPROXY_HOST: "gate.smartproxy.com",
	SMARTPROXY_PORT: 7000,
	SMARTPROXY_USERNAME: undefined,
	SMARTPROXY_PASSWORD: undefined,
	SMARTPROXY_STICKY_SESSION_MIN: 15,
	SMARTPROXY_STICKY_SESSION_MAX: 30,
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
const mockConnectToAdsPower = jest
	.fn<() => Promise<Browser>>()
	.mockResolvedValue({
		pages: jest.fn<() => Promise<Page[]>>().mockResolvedValue([]),
	} as unknown as Browser);

jest.unstable_mockModule("./adsPowerConnector.ts", () => ({
	connectToAdsPowerProfile: mockConnectToAdsPower,
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
	// createBrowser() - AdsPower mode
	// ═══════════════════════════════════════════════════════════════════════════

	describe("createBrowser() - AdsPower mode", () => {
		test("connects to AdsPower when adsPowerProfileId is provided and LOCAL_BROWSER is false", async () => {
			mockConfig.LOCAL_BROWSER = false;
			delete process.env.LOCAL_BROWSER;
			const { createBrowser } = await loadBrowserModule();

			await createBrowser({ adsPowerProfileId: "test-profile-123" });

			expect(mockConnectToAdsPower).toHaveBeenCalledWith("test-profile-123", {
				timeout: 30000,
			});
			expect(mockLaunch).not.toHaveBeenCalled();
		});

		test("falls back to local Puppeteer when no AdsPower profile ID is provided", async () => {
			mockConfig.LOCAL_BROWSER = false;
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
