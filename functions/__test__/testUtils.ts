import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

/**
 * Common test utilities for consistent mocking and test setup
 */

/**
 * Creates a minimal Puppeteer page mock with commonly used methods
 */
export const createPageMock = (overrides: Record<string, unknown> = {}) => {
	const baseMock = {
		$: jest.fn<any>().mockResolvedValue(null),
		$$: jest.fn<any>().mockResolvedValue([]),
		$eval: jest.fn<any>().mockResolvedValue(null),
		$$eval: jest.fn<any>().mockResolvedValue([]),
		evaluate: jest.fn<any>().mockResolvedValue(undefined),
		evaluateHandle: jest.fn<any>(),
		waitForSelector: jest
			.fn<any>()
			.mockRejectedValue(new Error("Selector not found")),
		waitForFunction: jest
			.fn<any>()
			.mockRejectedValue(new Error("Function timeout")),
		click: jest.fn<any>().mockResolvedValue(undefined),
		type: jest.fn<any>().mockResolvedValue(undefined),
		goto: jest.fn<any>().mockResolvedValue(undefined),
		content: jest.fn<any>().mockResolvedValue("<html></html>"),
		url: jest.fn<any>().mockReturnValue("https://example.com"),
		isClosed: jest.fn<any>().mockReturnValue(false),
		screenshot: jest
			.fn<any>()
			.mockResolvedValue(Buffer.from("fake-screenshot")),
		keyboard: {
			press: jest.fn<any>().mockResolvedValue(undefined),
			type: jest.fn<any>().mockResolvedValue(undefined),
		},
		mouse: {
			click: jest.fn<any>().mockResolvedValue(undefined),
			move: jest.fn<any>().mockResolvedValue(undefined),
			down: jest.fn<any>().mockResolvedValue(undefined),
			up: jest.fn<any>().mockResolvedValue(undefined),
		},
		cookies: jest.fn<any>().mockResolvedValue([]),
		setCookie: jest.fn<any>().mockResolvedValue(undefined),
		deleteCookie: jest.fn<any>().mockResolvedValue(undefined),
		setExtraHTTPHeaders: jest.fn<any>().mockResolvedValue(undefined),
	};

	return { ...baseMock, ...overrides } as unknown as Page;
};

/**
 * Creates a page mock that simulates successful selector finding
 */
export const createPageWithElementMock = (
	elementOverrides: Record<string, unknown> = {},
) => {
	const element = {
		click: jest.fn<any>().mockResolvedValue(undefined),
		// Provide a realistic boundingBox so helpers like humanLikeClickHandle
		// can operate without throwing in tests.
		boundingBox: jest.fn<any>().mockResolvedValue({
			x: 0,
			y: 0,
			width: 100,
			height: 40,
		}),
		type: jest.fn<any>().mockResolvedValue(undefined),
		evaluate: jest.fn<any>(),
		$: jest.fn<any>().mockResolvedValue(null),
		$$: jest.fn<any>().mockResolvedValue([]),
		...elementOverrides,
	};

	return createPageMock({
		$: jest.fn<any>().mockResolvedValue(element),
		$$: jest.fn<any>().mockResolvedValue([element]),
		waitForSelector: jest.fn<any>().mockResolvedValue(element),
	});
};

/**
 * Common mock factories for frequently mocked dependencies
 */
export const mockFactories = {
	config: () => ({
		SKIP_VISION: false,
		FAST_MODE: false,
		LOCAL_BROWSER: true,
		DELAY_SCALE: 1,
		TIMEOUT_SCALE: 1,
		CONFIDENCE_THRESHOLD: 50,
		MAX_DMS_PER_DAY: 50,
		DM_MESSAGE: "Hello!",
		BROWSERLESS_TOKEN: "test-token",
	}),

	sleep: () => jest.fn<any>().mockResolvedValue(undefined),

	snapshot: () => jest.fn<any>().mockResolvedValue("test-screenshot.png"),

	database: () => ({
		markDmSent: jest.fn<any>().mockResolvedValue(undefined),
		markFollowed: jest.fn<any>().mockResolvedValue(undefined),
		queueAdd: jest.fn<any>().mockResolvedValue(undefined),
		wasVisited: jest.fn<any>().mockResolvedValue(false),
		getQueuedUsers: jest.fn<any>().mockResolvedValue([]),
		getUserStats: jest.fn<any>().mockResolvedValue({}),
	}),

	sessionManager: () => ({
		loadCookies: jest.fn<any>().mockResolvedValue(false),
		saveCookies: jest.fn<any>().mockResolvedValue(undefined),
		isLoggedIn: jest.fn<any>().mockResolvedValue(false),
		getUserDataDir: jest.fn<any>().mockReturnValue("/tmp/test-data"),
	}),
};

/**
 * Helper to assert common function behaviors
 */
export const assertFunctionBehavior = {
	returnsBoolean: (result: unknown) => {
		expect(typeof result).toBe("boolean");
	},

	returnsString: (result: unknown) => {
		expect(typeof result).toBe("string");
	},

	returnsNumber: (result: unknown) => {
		expect(typeof result).toBe("number");
	},

	returnsObject: (result: unknown) => {
		expect(typeof result).toBe("object");
		expect(result).not.toBeNull();
	},

	doesNotThrow: async (fn: () => Promise<unknown>) => {
		await expect(fn()).resolves.not.toThrow();
	},

	resolvesToTruthy: async (fn: () => Promise<unknown>) => {
		const result = await fn();
		expect(result).toBeTruthy();
	},
};

/**
 * Common test data
 */
export const testData = {
	usernames: ["testuser", "creator_account", "business_profile"],
	urls: ["https://instagram.com/testuser", "https://example.com"],
	credentials: { username: "test@example.com", password: "testpass123" },
};
