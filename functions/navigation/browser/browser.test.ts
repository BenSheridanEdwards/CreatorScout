import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Browser, Page } from "puppeteer";

// Create typed mock functions
const mockSetDefaultNavigationTimeout =
	jest.fn<Page["setDefaultNavigationTimeout"]>();
const mockSetDefaultTimeout = jest.fn<Page["setDefaultTimeout"]>();
const mockSetViewport = jest
	.fn<Page["setViewport"]>()
	.mockResolvedValue(undefined);
const mockSetUserAgent = jest
	.fn<Page["setUserAgent"]>()
	.mockResolvedValue(undefined);
const mockSetExtraHTTPHeaders = jest
	.fn<Page["setExtraHTTPHeaders"]>()
	.mockResolvedValue(undefined);
const mockOn = jest.fn<Page["on"]>();
const mockEvaluateOnNewDocument = jest.fn(() => Promise.resolve());
const mockPageClose = jest.fn<Page["close"]>().mockResolvedValue(undefined);

const mockPage = {
	setDefaultNavigationTimeout: mockSetDefaultNavigationTimeout,
	setDefaultTimeout: mockSetDefaultTimeout,
	setViewport: mockSetViewport,
	setUserAgent: mockSetUserAgent,
	setExtraHTTPHeaders: mockSetExtraHTTPHeaders,
	on: mockOn,
	evaluateOnNewDocument: mockEvaluateOnNewDocument,
	close: mockPageClose,
} as unknown as Page;

const mockPages = jest.fn<Browser["pages"]>().mockResolvedValue([mockPage]);
const mockNewPage = jest.fn<Browser["newPage"]>().mockResolvedValue(mockPage);
const mockBrowserClose = jest
	.fn<Browser["close"]>()
	.mockResolvedValue(undefined);

const mockBrowser = {
	pages: mockPages,
	newPage: mockNewPage,
	close: mockBrowserClose,
} as unknown as Browser;

const mockLaunch = jest
	.fn<() => Promise<Browser>>()
	.mockResolvedValue(mockBrowser);

jest.unstable_mockModule("puppeteer", () => ({
	default: {
		launch: mockLaunch,
	},
}));

jest.unstable_mockModule("../../auth/sessionManager/sessionManager.ts", () => ({
	getUserDataDir: jest.fn<() => string>().mockReturnValue("/tmp/test-session"),
}));

jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	LOCAL_BROWSER: false,
}));

jest.unstable_mockModule("../../shared/logger/logger.ts", () => ({
	createLogger: jest.fn(() => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

jest.unstable_mockModule("../proxy/proxyManager.ts", () => ({
	createStickyProxy: jest.fn().mockImplementation(() => {
		throw new Error("No proxy credentials");
	}),
}));

jest.unstable_mockModule("./adsPowerConnector.ts", () => ({
	connectToAdsPowerProfile: jest.fn<() => Promise<Browser>>(),
}));

// Import after mocks
const adsPowerModule = await import("./adsPowerConnector.ts");
const { createBrowser, createPage, getUniqueUserDataDir } = await import(
	"./browser.ts"
);

const connectToAdsPowerProfileMock =
	adsPowerModule.connectToAdsPowerProfile as jest.MockedFunction<
		typeof adsPowerModule.connectToAdsPowerProfile
	>;

describe("browser", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env.LOCAL_BROWSER = "false";
		// Reset mock implementations
		mockPages.mockResolvedValue([mockPage]);
	});

	describe("getUniqueUserDataDir", () => {
		it("returns a path containing the prefix", () => {
			const dir = getUniqueUserDataDir("test");
			expect(dir).toContain(".sessions");
			expect(dir).toContain("test_");
		});

		it("returns unique paths on each call", () => {
			const dir1 = getUniqueUserDataDir();
			const dir2 = getUniqueUserDataDir();
			expect(dir1).not.toBe(dir2);
		});
	});

	describe("createBrowser", () => {
		it("launches local puppeteer browser by default", async () => {
			const browser = await createBrowser();

			expect(mockLaunch).toHaveBeenCalled();
			expect(browser).toBe(mockBrowser);
		});

		it("connects to AdsPower when profile ID is provided", async () => {
			connectToAdsPowerProfileMock.mockResolvedValue(mockBrowser);

			const browser = await createBrowser({
				adsPowerProfileId: "test-profile",
			});

			expect(connectToAdsPowerProfileMock).toHaveBeenCalledWith(
				"test-profile",
				expect.objectContaining({ timeout: 30000 }),
			);
			expect(browser).toBe(mockBrowser);
		});

		it("uses local browser when LOCAL_BROWSER env is true", async () => {
			process.env.LOCAL_BROWSER = "true";

			await createBrowser({ adsPowerProfileId: "test-profile" });

			expect(connectToAdsPowerProfileMock).not.toHaveBeenCalled();
			expect(mockLaunch).toHaveBeenCalled();
		});
	});

	describe("createPage", () => {
		it("returns a page with configured timeouts", async () => {
			const page = await createPage(mockBrowser);

			expect(mockSetDefaultNavigationTimeout).toHaveBeenCalledWith(30000);
			expect(mockSetDefaultTimeout).toHaveBeenCalledWith(15000);
			expect(page).toBe(mockPage);
		});

		it("applies custom viewport dimensions", async () => {
			await createPage(mockBrowser, {
				viewport: { width: 1920, height: 1080 },
			});

			expect(mockSetViewport).toHaveBeenCalledWith({
				width: 1920,
				height: 1080,
			});
		});

		it("sets custom user agent when provided", async () => {
			const customUA = "Custom User Agent";
			await createPage(mockBrowser, { userAgent: customUA });

			expect(mockSetUserAgent).toHaveBeenCalledWith(customUA);
		});

		it("sets up console and error event handlers", async () => {
			await createPage(mockBrowser);

			expect(mockOn).toHaveBeenCalledWith("console", expect.any(Function));
			expect(mockOn).toHaveBeenCalledWith("pageerror", expect.any(Function));
			expect(mockOn).toHaveBeenCalledWith(
				"requestfailed",
				expect.any(Function),
			);
		});

		it("applies stealth when applyStealth is true", async () => {
			await createPage(mockBrowser, { applyStealth: true });

			expect(mockEvaluateOnNewDocument).toHaveBeenCalled();
		});

		it("skips stealth when applyStealth is false", async () => {
			await createPage(mockBrowser, { applyStealth: false });

			expect(mockEvaluateOnNewDocument).not.toHaveBeenCalled();
		});

		it("closes extra pages from previous sessions", async () => {
			const extraPageClose = jest
				.fn<Page["close"]>()
				.mockResolvedValue(undefined);
			const extraPage = { close: extraPageClose } as unknown as Page;
			mockPages.mockResolvedValueOnce([mockPage, extraPage]);

			await createPage(mockBrowser);

			expect(extraPageClose).toHaveBeenCalled();
		});
	});
});
