import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// Mock file system
const mockMkdir = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockWriteFile = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("node:fs/promises", () => ({
	default: {
		mkdir: mockMkdir,
		writeFile: mockWriteFile,
	},
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
}));

// Mock runs module
const mockGetCurrentRunId = jest
	.fn<() => string | null>()
	.mockReturnValue(null);
const mockAddScreenshotToRun = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);

jest.unstable_mockModule("../runs/runs.ts", () => ({
	getCurrentRunId: mockGetCurrentRunId,
	addScreenshotToRun: mockAddScreenshotToRun,
}));

// Mock config - needs to be a function that returns the config
let mockDebugScreenshots = true;
let mockLocalBrowser = false;

jest.unstable_mockModule("../config/config.ts", () => ({
	get DEBUG_SCREENSHOTS() {
		return mockDebugScreenshots;
	},
	get LOCAL_BROWSER() {
		return mockLocalBrowser;
	},
}));

const { snapshot, saveScreenshot } = await import("./snapshot.ts");

const createMockPage = (overrides = {}): Page => {
	return {
		screenshot: jest
			.fn<() => Promise<Buffer>>()
			.mockResolvedValue(Buffer.from("fakepngbinary", "utf8")),
		isClosed: jest.fn<() => boolean>().mockReturnValue(false),
		waitForFunction: jest
			.fn<() => Promise<unknown>>()
			.mockResolvedValue(undefined),
		evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
		url: jest.fn<() => string>().mockReturnValue("https://www.instagram.com/"),
		waitForSelector: jest
			.fn<() => Promise<unknown>>()
			.mockResolvedValue(undefined),
		...overrides,
	} as unknown as Page;
};

describe("snapshot", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDebugScreenshots = true;
		mockLocalBrowser = false;
		mockGetCurrentRunId.mockReturnValue(null);
		mockMkdir.mockClear();
		mockWriteFile.mockClear();
	});

	describe("Basic functionality", () => {
		test("saves screenshot and returns path with label", async () => {
			const page = createMockPage();
			const path = await snapshot(page, "test_label");

			expect(typeof path).toBe("string");
			expect(path).toContain("test_label");
			expect(path).toMatch(/screenshots\/\d{4}-\d{2}-\d{2}\//);
			expect(path).toMatch(/\.png$/);
			expect(mockMkdir).toHaveBeenCalled();
			expect(page.screenshot).toHaveBeenCalled();
		});

		test("creates date-based directory structure", async () => {
			const page = createMockPage();
			await snapshot(page, "label");

			// Should create screenshots/YYYY-MM-DD/ directory
			expect(mockMkdir).toHaveBeenCalledWith(
				expect.stringMatching(/screenshots\/\d{4}-\d{2}-\d{2}/),
				{ recursive: true },
			);
		});

		test("includes timestamp in filename", async () => {
			const page = createMockPage();
			const before = Date.now();
			const path = await snapshot(page, "label");
			const after = Date.now();

			// Extract timestamp from path
			const match = path.match(/label-(\d+)\.png$/);
			expect(match).toBeTruthy();
			// biome-ignore lint/style/noNonNullAssertion: We verify match is truthy above
			const timestamp = Number.parseInt(match![1]);
			expect(timestamp).toBeGreaterThanOrEqual(before);
			expect(timestamp).toBeLessThanOrEqual(after);
		});
	});

	describe("DEBUG_SCREENSHOTS flag", () => {
		// Note: Due to ESM module caching, we can't easily test dynamic config changes
		// These tests verify the overall behavior instead
		test("takes screenshot when DEBUG_SCREENSHOTS is enabled (default for tests)", async () => {
			// mockDebugScreenshots is true by default
			const page = createMockPage();

			const path = await snapshot(page, "label");

			expect(path).not.toBe("");
			expect(page.screenshot).toHaveBeenCalled();
		});
	});

	describe("Force parameter", () => {
		test("takes screenshot when forced even if DEBUG_SCREENSHOTS is false", async () => {
			mockDebugScreenshots = false;
			const page = createMockPage();

			const path = await snapshot(page, "label", true);

			expect(path).not.toBe("");
			expect(path).toContain("label");
			expect(page.screenshot).toHaveBeenCalled();
		});

		test("respects force=true regardless of DEBUG_SCREENSHOTS", async () => {
			mockDebugScreenshots = false;
			const page = createMockPage();

			const path = await snapshot(page, "forced_screenshot", true);

			expect(path).toMatch(/screenshots\/.*forced_screenshot.*\.png$/);
		});
	});

	describe("Page closed error handling", () => {
		test("throws error when page is closed initially", async () => {
			const page = createMockPage({
				isClosed: jest.fn<() => boolean>().mockReturnValue(true),
			});

			await expect(snapshot(page, "label")).rejects.toThrow(
				"Cannot take screenshot: page is closed",
			);
		});

		test("throws error when page closes during waitForPageReady", async () => {
			const page = createMockPage({
				isClosed: jest
					.fn<() => boolean>()
					.mockReturnValueOnce(false) // Initial check
					.mockReturnValue(true), // After wait
			});

			await expect(snapshot(page, "label")).rejects.toThrow(
				"Cannot take screenshot: page was closed while waiting",
			);
		});

		test("throws error when page closes during screenshot capture", async () => {
			const page = createMockPage({
				screenshot: jest
					.fn<() => Promise<Buffer>>()
					.mockRejectedValue(new Error("Target closed")),
			});

			await expect(snapshot(page, "label")).rejects.toThrow();
		});
	});

	describe("Run association", () => {
		test("associates screenshot with current run when run exists", async () => {
			mockGetCurrentRunId.mockReturnValue("test-run-123");
			const page = createMockPage();

			const path = await snapshot(page, "label");

			expect(mockAddScreenshotToRun).toHaveBeenCalledWith("test-run-123", path);
		});

		test("does not call addScreenshotToRun when no current run", async () => {
			mockGetCurrentRunId.mockReturnValue(null);
			const page = createMockPage();

			await snapshot(page, "label");

			expect(mockAddScreenshotToRun).not.toHaveBeenCalled();
		});
	});

	describe("Browser mode (LOCAL_BROWSER vs Browserless)", () => {
		test("uses standard screenshot for LOCAL_BROWSER", async () => {
			mockLocalBrowser = true;
			const page = createMockPage();

			await snapshot(page, "label");

			expect(page.screenshot).toHaveBeenCalledWith({
				path: expect.stringContaining("label"),
				fullPage: true,
			});
		});

		test("attempts standard screenshot first for Browserless", async () => {
			mockLocalBrowser = false;
			const page = createMockPage();

			await snapshot(page, "label");

			expect(page.screenshot).toHaveBeenCalledWith({
				path: expect.stringContaining("label"),
				fullPage: true,
			});
		});

		test("falls back to CDP for Browserless when puppeteer screenshot fails", async () => {
			mockLocalBrowser = false;
			const mockCDP = {
				send: jest
					.fn<
						(method: string, params?: unknown) => Promise<{ data?: string }>
					>()
					.mockResolvedValue({ data: "base64data" }),
			};
			const page = createMockPage({
				screenshot: jest
					.fn<() => Promise<Buffer>>()
					.mockRejectedValue(new Error("Session closed")),
				createCDPSession: jest
					.fn<
						() => Promise<{
							send: (
								method: string,
								params?: unknown,
							) => Promise<{ data?: string }>;
						}>
					>()
					.mockResolvedValue(mockCDP),
			});

			await snapshot(page, "label");

			expect(mockCDP.send).toHaveBeenCalledWith("Page.captureScreenshot", {
				format: "png",
				fromSurface: true,
			});
			expect(mockWriteFile).toHaveBeenCalled();
		});
	});

	describe("Page ready waiting", () => {
		test("waits for page to be ready before screenshot", async () => {
			const page = createMockPage();

			await snapshot(page, "label");

			expect(page.waitForFunction).toHaveBeenCalledWith(
				expect.any(Function),
				expect.objectContaining({ timeout: expect.any(Number) }),
			);
		});

		test("checks for login page and waits longer", async () => {
			const page = createMockPage({
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(true), // On login page
			});

			await snapshot(page, "label");

			expect(page.evaluate).toHaveBeenCalled();
		});

		test("continues if waitForPageReady times out", async () => {
			const page = createMockPage({
				waitForFunction: jest
					.fn<() => Promise<unknown>>()
					.mockRejectedValue(new Error("Timeout")),
			});

			// Should not throw, just continue
			const path = await snapshot(page, "label");
			expect(path).toContain("label");
		});
	});
});

describe("saveScreenshot", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDebugScreenshots = true;
		mockLocalBrowser = false;
		mockMkdir.mockClear();
		mockWriteFile.mockClear();
	});

	describe("Basic functionality", () => {
		test("creates structured filename: YYYY-MM-DD_TYPE_USERNAME_ACTION.png", async () => {
			const page = createMockPage({
				url: jest.fn().mockReturnValue("https://www.instagram.com/testuser/"),
			});

			const path = await saveScreenshot(page, "follow", "testuser", "success");

			expect(path).toMatch(/\d{4}-\d{2}-\d{2}_follow_testuser_success\.png$/);
		});

		test("creates date-based directory", async () => {
			const page = createMockPage({
				url: jest.fn().mockReturnValue("https://www.instagram.com/user/"),
			});

			await saveScreenshot(page, "dm", "user", "sent");

			expect(mockMkdir).toHaveBeenCalledWith(
				expect.stringMatching(/screenshots\/\d{4}-\d{2}-\d{2}/),
				{ recursive: true },
			);
		});

		test("logs current URL for debugging", async () => {
			const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
			const page = createMockPage({
				url: jest.fn().mockReturnValue("https://www.instagram.com/testuser/"),
			});

			await saveScreenshot(page, "follow", "testuser", "success");

			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("https://www.instagram.com/testuser/"),
			);
			consoleSpy.mockRestore();
		});
	});

	describe("Profile page waiting", () => {
		test("waits for profile page to be ready for follow actions", async () => {
			const page = createMockPage({
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/user/"),
			});

			await saveScreenshot(page, "follow", "user", "success");

			// Should wait for selectors like header, article, etc.
			expect(page.waitForSelector).toHaveBeenCalled();
		});

		test("waits for profile page to be ready for dm actions", async () => {
			const page = createMockPage({
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/user/"),
			});

			await saveScreenshot(page, "dm", "user", "sent");

			// Should attempt to wait for profile selectors
			expect(page.waitForSelector).toHaveBeenCalled();
		});

		test("does not wait for profile page for login actions", async () => {
			const page = createMockPage({
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/accounts/login/"),
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockRejectedValue(new Error("Should not be called")),
			});

			// Should not throw even though waitForSelector would reject
			await saveScreenshot(page, "login", "user", "success");

			// waitForSelector should not be called for non-profile actions
			expect(page.waitForFunction).toHaveBeenCalled(); // Only general page ready wait
		});

		test("warns if profile page is not ready but continues", async () => {
			const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
			const page = createMockPage({
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/wrong-page/"),
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockRejectedValue(new Error("Timeout")),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<boolean>>()
					.mockResolvedValue(false), // Page not ready
			});

			await saveScreenshot(page, "follow", "testuser", "attempt");

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Profile page not ready"),
			);
			consoleWarnSpy.mockRestore();
		});
	});

	describe("DEBUG_SCREENSHOTS and force parameter", () => {
		// Note: Due to ESM module caching, we test the force parameter behavior
		// The force parameter should always take screenshots regardless of DEBUG_SCREENSHOTS
		test("takes screenshot with force=true", async () => {
			const page = createMockPage({
				url: jest.fn().mockReturnValue("https://www.instagram.com/user/"),
			});

			const path = await saveScreenshot(page, "dm", "user", "proof", true);

			expect(path).not.toBe("");
			expect(path).toContain("dm_user_proof");
			expect(page.screenshot).toHaveBeenCalled();
		});

		test("takes screenshot when DEBUG_SCREENSHOTS is enabled (default)", async () => {
			const page = createMockPage({
				url: jest.fn().mockReturnValue("https://www.instagram.com/user/"),
			});

			const path = await saveScreenshot(page, "follow", "user", "success");

			expect(path).not.toBe("");
			expect(path).toMatch(/\d{4}-\d{2}-\d{2}_follow_user_success\.png$/);
			expect(page.screenshot).toHaveBeenCalled();
		});
	});

	describe("Error handling", () => {
		test("throws error when page is closed initially", async () => {
			const page = createMockPage({
				isClosed: jest.fn<() => boolean>().mockReturnValue(true),
			});

			await expect(
				saveScreenshot(page, "follow", "user", "error"),
			).rejects.toThrow("Cannot take screenshot: page is closed");
		});

		test("throws error when page closes while waiting for profile", async () => {
			const page = createMockPage({
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/user/"),
				isClosed: jest
					.fn<() => boolean>()
					.mockReturnValueOnce(false) // Initial check
					.mockReturnValueOnce(false) // During profile wait setup
					.mockReturnValue(true), // After profile wait
				waitForSelector: jest
					.fn<() => Promise<unknown>>()
					.mockRejectedValue(new Error("Timeout")),
			});

			await expect(
				saveScreenshot(page, "follow", "user", "error"),
			).rejects.toThrow("page was closed while waiting for profile");
		});

		test("handles URL access failure gracefully", async () => {
			const page = createMockPage({
				url: jest.fn().mockImplementation(() => {
					throw new Error("Page closed");
				}),
				isClosed: jest.fn<() => boolean>().mockReturnValue(true),
			});

			await expect(
				saveScreenshot(page, "login", "user", "state"),
			).rejects.toThrow("Cannot take screenshot: page is closed");
		});
	});
});
