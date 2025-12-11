// Mock external dependencies BEFORE importing the module
import { jest } from "@jest/globals";
import type { Browser, Page } from "puppeteer";

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

	test("createBrowser launches local browser with provided options", async () => {
		const fakeBrowser = {
			newPage: jest.fn<() => Promise<Page>>(),
		} as unknown as Browser;
		mockLaunch.mockResolvedValue(fakeBrowser);
		const { createBrowser } = await loadBrowserModule();
		await createBrowser({ headless: false, userDataDir: "/tmp/custom" });

		expect(mockLaunch).toHaveBeenCalledWith({
			headless: false,
			args: ["--no-sandbox", "--disable-dev-shm-usage"],
			userDataDir: "/tmp/custom",
		});
	});

	test("createBrowser uses getUserDataDir when not provided", async () => {
		const fakeBrowser = {
			newPage: jest.fn<() => Promise<Page>>(),
		} as unknown as Browser;
		mockLaunch.mockResolvedValue(fakeBrowser);

		const { createBrowser } = await loadBrowserModule();
		await createBrowser();

		expect(mockGetUserDataDir).toHaveBeenCalled();
		expect(mockLaunch).toHaveBeenCalledWith(
			expect.objectContaining({ userDataDir: "/tmp/test-data" }),
		);
	});

	test("createBrowser connects to browserless when not local", async () => {
		mockConfig.LOCAL_BROWSER = false;
		mockConfig.BROWSERLESS_TOKEN = "token-123";
		const fakeBrowser = {
			newPage: jest.fn<() => Promise<Page>>(),
		} as unknown as Browser;
		mockConnect.mockResolvedValue(fakeBrowser);

		const { createBrowser } = await loadBrowserModule();
		await createBrowser();

		expect(mockConnect).toHaveBeenCalledWith({
			browserWSEndpoint: "wss://chrome.browserless.io?token=token-123",
		});
	});

	test("createBrowser throws when browserless token missing", async () => {
		mockConfig.LOCAL_BROWSER = false;
		mockConfig.BROWSERLESS_TOKEN = "";
		const fakeBrowser = {
			newPage: jest.fn<() => Promise<Page>>(),
		} as unknown as Browser;
		mockConnect.mockResolvedValue(fakeBrowser);

		const { createBrowser } = await loadBrowserModule();
		await expect(createBrowser()).rejects.toThrow(
			"BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER",
		);
		expect(mockConnect).not.toHaveBeenCalled();
		expect(mockLaunch).not.toHaveBeenCalled();
	});

	test("createPage applies defaults to the new page", async () => {
		const mockPage = {
			setDefaultNavigationTimeout: jest.fn<(ms: number) => void>(),
			setDefaultTimeout: jest.fn<(ms: number) => void>(),
			setViewport: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			setUserAgent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		} as unknown as Page;
		const mockBrowser = {
			newPage: jest.fn<() => Promise<Page>>().mockResolvedValue(mockPage),
		} as unknown as Browser;

		const { createPage } = await loadBrowserModule();
		await createPage(mockBrowser);

		expect(mockBrowser.newPage).toHaveBeenCalled();
		expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(20000);
		expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(12000);
		expect(mockPage.setViewport).toHaveBeenCalledWith({
			width: 1440,
			height: 900,
		});
		expect(mockPage.setUserAgent).toHaveBeenCalled();
	});

	test("createPage allows overriding defaults", async () => {
		const mockPage = {
			setDefaultNavigationTimeout: jest.fn<(ms: number) => void>(),
			setDefaultTimeout: jest.fn<(ms: number) => void>(),
			setViewport: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			setUserAgent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		} as unknown as Page;
		const mockBrowser = {
			newPage: jest.fn<() => Promise<Page>>().mockResolvedValue(mockPage),
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
