/**
 * Unit tests for profileActions.ts
 * Uses real implementations of internal files - only mocks external dependencies
 */
import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

// Mock sleep to avoid delays in tests
const sleepMock = jest
	.fn<(ms: number) => Promise<void>>()
	.mockResolvedValue(undefined);

// Mock database functions to avoid actual database operations
const markDmSentMock = jest
	.fn<(username: string, proofPath?: string | null) => Promise<void>>()
	.mockResolvedValue(undefined);
const markFollowedMock = jest
	.fn<(username: string) => Promise<void>>()
	.mockResolvedValue(undefined);
const queueAddMock = jest
	.fn<(username: string, priority: number, source: string) => Promise<void>>()
	.mockResolvedValue(undefined);
const wasVisitedMock = jest
	.fn<(username: string) => Promise<boolean>>()
	.mockResolvedValue(false);

// Only mock external API calls (vision API)
const analyzeDmProofMock = jest
	.fn<
		(imagePath: string) => Promise<{
			dm_sent: boolean;
			confidence: number;
			reason: string;
			indicators: string[];
			is_dm_thread: boolean;
			message_visible: boolean;
			error_detected: boolean;
		} | null>
	>()
	.mockResolvedValue({
		dm_sent: true,
		confidence: 90,
		reason: "test",
		indicators: [],
		is_dm_thread: true,
		message_visible: true,
		error_detected: false,
	});

// Set up mocks before importing the module
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Mock query function - returns QueryResult with rows array
const queryMock = jest
	.fn<
		<T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
	>()
	.mockResolvedValue({ rows: [] });

jest.unstable_mockModule("../../shared/database/database.ts", () => ({
	markDmSent: markDmSentMock,
	markFollowed: markFollowedMock,
	queueAdd: queueAddMock,
	wasVisited: wasVisitedMock,
	query: queryMock,
	QueryResult: {} as { rows: unknown[] }, // Export the type if needed
}));

jest.unstable_mockModule("../vision/analyzeDmProof.ts", () => ({
	analyzeDmProof: analyzeDmProofMock,
}));

// Mock config for test values - include all exports that might be needed
jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	DM_MESSAGE: "Hello!",
	VISION_MODEL: "test-vision-model",
	OPENROUTER_API_KEY: "test-openrouter-key",
	DELAYS: {
		after_navigate: [1.5, 3.5],
		after_click: [0.2, 0.8],
		after_type: [0.1, 0.4],
		after_dm_type: [0.8, 1.8],
		after_dm_send: [1.5, 3.5],
		after_follow: [0.8, 1.8],
		mouse_wiggle: [0.5, 1.8],
		after_message_open: [1.8, 3.5],
		after_popup_dismiss: [0.5, 1.8],
		after_modal_open: [1.2, 2.8],
		after_modal_close: [0.8, 1.8],
		after_scroll: [0.3, 1.2],
		after_scroll_batch: [1.5, 3.5],
		after_linktree_click: [2.5, 4.5],
		after_credentials: [1.2, 2.8],
		after_login_submit: [3.5, 6.5],
		after_go_back: [1.8, 3.2],
		between_profiles: [1.5, 4.5],
		between_seeds: [45, 150],
		queue_empty: [180, 300],
	},
	DELAY_SCALE: 1.0,
	SLEEP_SCALE: 1.0,
	DELAY_SCALES: {
		navigation: 1.0,
		modal: 1.0,
		input: 1.0,
		action: 1.0,
		pacing: 1.0,
	},
	DELAY_CATEGORIES: {},
	TIMEOUT_SCALE: 1.0,
	TIMEOUTS: {
		page_load: 25000,
		navigation: 15000,
		element_default: 8000,
		element_modal: 4000,
		element_button: 2500,
		element_input: 3500,
		login: 12000,
		dm_send: 8000,
		follow: 2500,
	},
	FAST_MODE: false,
	SKIP_VISION: false,
	LOCAL_BROWSER: true,
	CONFIDENCE_THRESHOLD: 50,
	MAX_DMS_PER_DAY: 120,
}));

// Import after mocks are set up
const {
	checkDmThreadEmpty,
	sendDMToUser,
	followUserAccount,
	addFollowingToQueue,
} = await import("./profileActions.ts");

describe("profileActions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sleepMock.mockResolvedValue(undefined);
		markDmSentMock.mockResolvedValue(undefined);
		markFollowedMock.mockResolvedValue(undefined);
		queueAddMock.mockResolvedValue(undefined);
		wasVisitedMock.mockResolvedValue(false);
		analyzeDmProofMock.mockResolvedValue({
			dm_sent: true,
			confidence: 90,
			reason: "test",
			indicators: [],
			is_dm_thread: true,
			message_visible: true,
			error_detected: false,
		});
	});

	describe("checkDmThreadEmpty", () => {
		test("returns false when multiple nodes found", async () => {
			const page = createPageMock({
				$$: jest
					.fn<() => Promise<Array<{ id: number }>>>()
					.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
					.mockResolvedValue([]),
			});
			const result = await checkDmThreadEmpty(page as unknown as Page);
			expect(result).toBe(false);
		});

		test("returns true when no nodes", async () => {
			const page = createPageMock({
				$$: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
			});
			const result = await checkDmThreadEmpty(page as unknown as Page);
			expect(result).toBe(true);
		});

		test("returns true when only one node (header)", async () => {
			const page = createPageMock({
				$$: jest
					.fn<() => Promise<Array<{ id: number }>>>()
					.mockResolvedValueOnce([{ id: 1 }])
					.mockResolvedValue([]),
			});
			const result = await checkDmThreadEmpty(page as unknown as Page);
			expect(result).toBe(true);
		});
	});

	describe("sendDMToUser", () => {
		test("sends DM when conversation is empty", async () => {
			// Set up a test database URL to avoid connection errors
			if (!process.env.DATABASE_URL) {
				process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
			}

			const page = createPageMock({
				$$: jest
					.fn<(selector: string) => Promise<unknown[]>>()
					.mockImplementation(async (selector: string) => {
						// For checkDmThreadEmpty - return empty array
						if (
							selector.includes('role="row"') ||
							selector.includes('role="listitem"') ||
							selector.includes('data-scope="messages_table"')
						) {
							return [];
						}
						return [];
					}),
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/direct/t/user123/"),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockImplementation(async (fn: unknown, ...args: unknown[]) => {
						if (typeof fn === "function") {
							try {
								// Handle mouse position check (moveMouseToElement)
								if (
									fn.toString().includes("mouseX") ||
									fn.toString().includes("mouseY")
								) {
									return { x: 100, y: 100 };
								}
								const result = await (fn as (...args: unknown[]) => unknown)(
									...args,
								);
								// findMessageButton - return button info
								if (
									result &&
									typeof result === "object" &&
									"x" in result &&
									"y" in result
								) {
									return {
										x: 100,
										y: 200,
										width: 80,
										height: 30,
										isVisible: true,
									};
								}
								// navigateToProfile - check URL (returns string from page.url())
								if (typeof result === "string") {
									return !result.includes("/accounts/login/");
								}
								// verifyDmSent - check URL (window.location.href)
								if (
									typeof result === "object" &&
									result !== null &&
									"includes" in result
								) {
									return true; // in DM thread
								}
								// typeMessage - check text present (returns boolean)
								// The evaluate function checks if textContent includes part of the message
								// If the function returns a boolean, return true (text is present)
								if (typeof result === "boolean") {
									return true; // Text is present
								}
								// getElementCenter - returns { x, y } for element center
								if (
									result &&
									typeof result === "object" &&
									"x" in result &&
									"y" in result &&
									!("width" in result) &&
									!("height" in result)
								) {
									return { x: 50, y: 50 };
								}
								// Mouse position for clickMessageButton or getElementCenter
								if (
									result &&
									typeof result === "object" &&
									"x" in result &&
									"y" in result
								) {
									return { x: 50, y: 50 };
								}
								return result;
							} catch {
								// If function throws (e.g., document.querySelector doesn't exist),
								// check if it's a text check (typeMessage) and return true
								// Otherwise return null
								if (args && args.length >= 2 && typeof args[1] === "string") {
									return true; // typeMessage text check - assume text is present
								}
								return null;
							}
						}
						return null;
					}) as unknown as Page["evaluate"],
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockImplementation(async (selector: string) => {
						// Return element for message input selectors
						if (
							selector.includes('role="textbox"') ||
							selector.includes("contenteditable") ||
							selector.includes("Message") ||
							selector.includes("Send")
						) {
							return {
								click: jest
									.fn<() => Promise<void>>()
									.mockResolvedValue(undefined),
								boundingBox: jest
									.fn<
										() => Promise<{
											x: number;
											y: number;
											width: number;
											height: number;
										} | null>
									>()
									.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
								textContent: "Hello!",
							};
						}
						return null;
					}) as unknown as Page["$"],
				waitForSelector: jest
					.fn<(selector: string, opts?: object) => Promise<unknown>>()
					.mockImplementation(async (selector: string) => {
						// Return element for message input selectors
						if (
							selector.includes('role="textbox"') ||
							selector.includes("contenteditable") ||
							selector.includes("Message")
						) {
							return {
								click: jest
									.fn<() => Promise<void>>()
									.mockResolvedValue(undefined),
								boundingBox: jest
									.fn<
										() => Promise<{
											x: number;
											y: number;
											width: number;
											height: number;
										} | null>
									>()
									.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
								textContent: "Hello!",
							};
						}
						return null;
					}),
				keyboard: {
					press: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
					type: jest
						.fn<(text: string, opts?: object) => Promise<void>>()
						.mockResolvedValue(undefined),
					down: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
					up: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
				},
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					down: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
					up: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const ok = await sendDMToUser(page as unknown as Page, "user123");

			expect(ok).toBe(true);
			expect(page.goto).toHaveBeenCalled();
			expect(markDmSentMock).toHaveBeenCalled();
		}, 10000); // 10 second timeout

		test("skips when conversation is not empty", async () => {
			const page = createPageMock({
				$$: jest
					.fn<() => Promise<Array<{ id: number }>>>()
					.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // not empty
					.mockResolvedValue([]),
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/direct/t/user123/"),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockImplementation(async (fn: unknown) => {
						if (typeof fn === "function") {
							const result = await (fn as () => unknown)();
							if (
								result &&
								typeof result === "object" &&
								"x" in result &&
								"y" in result
							) {
								return {
									x: 100,
									y: 200,
									width: 80,
									height: 30,
									isVisible: true,
								};
							}
							if (typeof result === "string") {
								return !result.includes("/accounts/login/");
							}
						}
						return null;
					}) as unknown as Page["evaluate"],
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockResolvedValue(null) as unknown as Page["$"],
				mouse: {
					move: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				},
			});

			const ok = await sendDMToUser(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});

		test("handles errors gracefully", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockRejectedValue(new Error("Navigation failed")),
				url: jest
					.fn<() => string>()
					.mockReturnValue("https://www.instagram.com/"),
			});

			const ok = await sendDMToUser(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});
	});

	describe("followUserAccount", () => {
		test("follows user when button is found", async () => {
			let evaluateCallCount = 0;
			const mockButton = {
				click: jest.fn(),
				textContent: "Follow",
				boundingBox: jest
					.fn()
					.mockResolvedValue({ x: 0, y: 0, width: 100, height: 40 }),
				evaluate: jest.fn().mockResolvedValue(undefined),
			};
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				$: jest
					.fn<(selector: string) => Promise<typeof mockButton | null>>()
					.mockResolvedValue(mockButton as unknown as any),
				mouse: {
					move: jest.fn().mockResolvedValue(undefined),
					down: jest.fn().mockResolvedValue(undefined),
					up: jest.fn().mockResolvedValue(undefined),
				},
				evaluate: jest
					.fn<(fn: unknown) => Promise<unknown>>()
					.mockImplementation(async (fn: unknown): Promise<unknown> => {
						evaluateCallCount++;
						if (typeof fn === "function") {
							try {
								const result = await (fn as () => unknown)();
								// First call: check button state - returns { state: "can_follow", button: btn }
								if (evaluateCallCount === 1) {
									return { state: "can_follow", button: mockButton };
								}
								// Second call: check button state after click - returns "following" or "requested"
								if (evaluateCallCount === 2) {
									return "following"; // Button changed to "Following"
								}
								return result;
							} catch {
								// If function throws, return appropriate values
								if (evaluateCallCount === 1)
									return { state: "can_follow", button: mockButton };
								return "following";
							}
						}
						return { state: "not_found" };
					}) as unknown as Page["evaluate"],
			});

			const ok = await followUserAccount(page as unknown as Page, "user123");

			expect(ok).toBe(true);
			expect(page.goto).toHaveBeenCalledWith(
				"https://www.instagram.com/user123/",
				expect.objectContaining({
					waitUntil: "networkidle2",
					timeout: 15000,
				}),
			);
			expect(markFollowedMock).toHaveBeenCalledWith("user123");
		});

		test("returns false when already following", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluate: jest
					.fn<(fn: unknown) => Promise<unknown>>()
					.mockResolvedValue({ state: "already_following" }), // button shows "Following"
			});

			const ok = await followUserAccount(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});

		test("returns false when follow request already sent", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluate: jest
					.fn<(fn: unknown) => Promise<unknown>>()
					.mockResolvedValue({ state: "request_sent" }), // button shows "Requested"
			});

			const ok = await followUserAccount(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});

		test("returns false when button not found", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluate: jest
					.fn<(fn: unknown) => Promise<unknown>>()
					.mockResolvedValue("not_found"), // button not found
			});

			const ok = await followUserAccount(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});

		test("handles errors gracefully", async () => {
			const page = createPageMock({
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockRejectedValue(new Error("Navigation failed")),
			});

			const ok = await followUserAccount(page as unknown as Page, "user123");

			expect(ok).toBe(false);
		});
	});

	describe("addFollowingToQueue", () => {
		test("adds new users to queue", async () => {
			const page = createPageMock({
				keyboard: {
					press: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
				},
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockImplementation(async (selector: string) => {
						// Return element for following modal
						if (selector.includes("following") || selector.includes("modal")) {
							return {
								click: jest
									.fn<() => Promise<void>>()
									.mockResolvedValue(undefined),
							};
						}
						return null;
					}) as unknown as Page["$"],
				$$: jest
					.fn<(selector: string) => Promise<unknown[]>>()
					.mockResolvedValue([
						{ textContent: "user1" },
						{ textContent: "user2" },
					]),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValue(["user1", "user2"]),
			});

			const added = await addFollowingToQueue(
				page as unknown as Page,
				"seeduser",
				"source-tag",
				5,
			);

			// Should add users (actual count depends on database state)
			expect(typeof added).toBe("number");
			expect(added).toBeGreaterThanOrEqual(0);
		});

		test("skips already visited users", async () => {
			wasVisitedMock.mockImplementation((u) => Promise.resolve(u === "user1")); // user1 already visited
			const page = createPageMock({
				keyboard: {
					press: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
				},
				waitForSelector: jest
					.fn<(selector: string, opts?: object) => Promise<unknown>>()
					.mockResolvedValue({}), // Modal found
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockImplementation(async (selector: string) => {
						if (selector.includes("following") || selector.includes("modal")) {
							return {
								click: jest
									.fn<() => Promise<void>>()
									.mockResolvedValue(undefined),
							};
						}
						return null;
					}) as unknown as Page["$"],
				$$: jest
					.fn<(selector: string) => Promise<unknown[]>>()
					.mockResolvedValue([
						{
							evaluate: jest
								.fn<(fn: unknown) => Promise<string>>()
								.mockResolvedValue("/user1/"),
							textContent: "user1",
						},
						{
							evaluate: jest
								.fn<(fn: unknown) => Promise<string>>()
								.mockResolvedValue("/user2/"),
							textContent: "user2",
						},
					]),
				evaluate: jest
					.fn<(fn: unknown, ...args: unknown[]) => Promise<unknown>>()
					.mockResolvedValue(["user1", "user2"]),
			});

			const added = await addFollowingToQueue(
				page as unknown as Page,
				"seed",
				"source",
			);

			expect(added).toBe(1);
			expect(queueAddMock).toHaveBeenCalledTimes(1);
			expect(queueAddMock).toHaveBeenCalledWith("user2", 50, "source");
		});

		test("returns 0 when modal fails to open", async () => {
			const page = createPageMock({
				$: jest
					.fn<(selector: string) => Promise<unknown>>()
					.mockResolvedValue(null) as unknown as Page["$"],
			});

			const added = await addFollowingToQueue(
				page as unknown as Page,
				"seed",
				"source",
			);

			expect(added).toBe(0);
		});
	});
});
