import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

/**
 * Common test utilities for consistent mocking and test setup
 */

/**
 * Creates a minimal Puppeteer page mock with commonly used methods
 */
export const createPageMock = (overrides: Record<string, unknown> = {}) => {
	// Smart evaluate mock that handles TreeWalker patterns for text array extraction
	const smartEvaluateMock = jest.fn((fn: () => unknown) => {
		if (typeof fn === "function") {
			const fnStr = fn.toString();
			// Return empty array for TreeWalker-based text extraction
			if (fnStr.includes("TreeWalker") || fnStr.includes("SHOW_TEXT")) {
				return Promise.resolve([]);
			}
		}
		return Promise.resolve(undefined);
	});

	const baseMock = {
		$: jest.fn<Page["$"]>().mockResolvedValue(null),
		$$: jest.fn<Page["$$"]>().mockResolvedValue([]),
		$eval: jest.fn<Page["$eval"]>().mockResolvedValue(null),
		$$eval: jest.fn<Page["$$eval"]>().mockResolvedValue([]),
		evaluate: smartEvaluateMock as unknown as jest.Mocked<Page["evaluate"]>,
		evaluateHandle: jest.fn<Page["evaluateHandle"]>(),
		waitForSelector: jest
			.fn<Page["waitForSelector"]>()
			.mockRejectedValue(new Error("Selector not found")),
		waitForFunction: jest
			.fn<Page["waitForFunction"]>()
			.mockRejectedValue(new Error("Function timeout")),
		click: jest.fn<Page["click"]>().mockResolvedValue(undefined),
		type: jest.fn<Page["type"]>().mockResolvedValue(undefined),
		goto: jest
			.fn<Page["goto"]>()
			.mockResolvedValue(null as unknown as Awaited<ReturnType<Page["goto"]>>),
		content: jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("<html></html>"),
		url: jest.fn<() => string>().mockReturnValue("https://example.com"),
		isClosed: jest.fn<() => boolean>().mockReturnValue(false),
		screenshot: jest
			.fn<Page["screenshot"]>()
			.mockResolvedValue(Buffer.from("fake-screenshot")),
		keyboard: {
			press: jest.fn<Page["keyboard"]["press"]>().mockResolvedValue(undefined),
			type: jest.fn<Page["keyboard"]["type"]>().mockResolvedValue(undefined),
		},
		mouse: {
			click: jest.fn<Page["mouse"]["click"]>().mockResolvedValue(undefined),
			move: jest.fn<Page["mouse"]["move"]>().mockResolvedValue(undefined),
			down: jest.fn<Page["mouse"]["down"]>().mockResolvedValue(undefined),
			up: jest.fn<Page["mouse"]["up"]>().mockResolvedValue(undefined),
		},
		cookies: jest.fn<Page["cookies"]>().mockResolvedValue([]),
		setCookie: jest.fn<Page["setCookie"]>().mockResolvedValue(undefined),
		deleteCookie: jest.fn<Page["deleteCookie"]>().mockResolvedValue(undefined),
		setExtraHTTPHeaders: jest
			.fn<Page["setExtraHTTPHeaders"]>()
			.mockResolvedValue(undefined),
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
		click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		// Provide a realistic boundingBox so helpers like humanClick
		// can operate without throwing in tests.
		boundingBox: jest
			.fn<
				() => Promise<{
					x: number;
					y: number;
					width: number;
					height: number;
				} | null>
			>()
			.mockResolvedValue({
				x: 0,
				y: 0,
				width: 100,
				height: 40,
			}),
		type: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		evaluate: jest.fn<() => Promise<unknown>>(),
		$: jest.fn<Page["$"]>().mockResolvedValue(null),
		$$: jest.fn<Page["$$"]>().mockResolvedValue([]),
		...elementOverrides,
	};

	return createPageMock({
		$: jest
			.fn<Page["$"]>()
			.mockResolvedValue(element as unknown as Awaited<ReturnType<Page["$"]>>),
		$$: jest
			.fn<Page["$$"]>()
			.mockResolvedValue([
				element as unknown as Awaited<ReturnType<Page["$$"]>>[0],
			]),
		waitForSelector: jest
			.fn<Page["waitForSelector"]>()
			.mockResolvedValue(
				element as unknown as Awaited<ReturnType<Page["waitForSelector"]>>,
			),
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

	sleep: () => jest.fn<() => Promise<void>>().mockResolvedValue(undefined),

	snapshot: () =>
		jest.fn<() => Promise<string>>().mockResolvedValue("test-screenshot.png"),

	database: () => ({
		markDmSent: jest
			.fn<(username: string, proofPath?: string | null) => Promise<void>>()
			.mockResolvedValue(undefined),
		markFollowed: jest
			.fn<(username: string) => Promise<void>>()
			.mockResolvedValue(undefined),
		queueAdd: jest
			.fn<
				(username: string, priority: number, source: string) => Promise<void>
			>()
			.mockResolvedValue(undefined),
		wasVisited: jest
			.fn<(username: string) => Promise<boolean>>()
			.mockResolvedValue(false),
		getQueuedUsers: jest.fn<() => Promise<string[]>>().mockResolvedValue([]),
		getUserStats: jest
			.fn<(username: string) => Promise<Record<string, unknown>>>()
			.mockResolvedValue({}),
	}),

	sessionManager: () => ({
		loadCookies: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
		saveCookies: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		isLoggedIn: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
		getUserDataDir: jest.fn<() => string>().mockReturnValue("/tmp/test-data"),
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

/**
 * Re-export DOM mock utilities for convenience
 */
export {
	createPageWithDOM,
	INSTAGRAM_CREATOR_PROFILE_HTML,
	INSTAGRAM_PROFILE_NO_BIO_HTML,
	INSTAGRAM_PROFILE_WITH_LINKTREE_HTML,
	INSTAGRAM_PROFILE_WITH_CREATOR_LINK_HTML,
} from "./domMocks.ts";
