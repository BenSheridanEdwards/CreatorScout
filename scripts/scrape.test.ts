/**
 * Scrape Module Tests
 *
 * Tests for the core discovery/scraping functions:
 * - loadSeeds(): Loads seed usernames from file into queue
 * - processFollowingList(): Extracts and processes following list from a seed profile
 */

import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

// ═══════════════════════════════════════════════════════════════════════════
// Mock Setup
// ═══════════════════════════════════════════════════════════════════════════

// Mock file system
const existsSyncMock = jest.fn<(path: string) => boolean>();
const readFileSyncMock = jest.fn<(path: string, encoding: string) => string>();
jest.unstable_mockModule("node:fs", () => ({
	existsSync: existsSyncMock,
	readFileSync: readFileSyncMock,
	createWriteStream: jest.fn(() => ({
		write: jest.fn(),
		end: jest.fn(),
		on: jest.fn(),
	})),
	mkdirSync: jest.fn(),
	writeFileSync: jest.fn(),
	appendFileSync: jest.fn(),
}));

// Mock fs/promises
jest.unstable_mockModule("node:fs/promises", () => ({
	readFile: jest.fn(() => Promise.resolve("")),
	writeFile: jest.fn(() => Promise.resolve()),
	mkdir: jest.fn(() => Promise.resolve()),
	access: jest.fn(() => Promise.resolve()),
	default: {
		readFile: jest.fn(() => Promise.resolve("")),
		writeFile: jest.fn(() => Promise.resolve()),
	},
}));

// Mock sleep
const sleepMock = jest.fn<(ms: number) => Promise<void>>();
jest.unstable_mockModule("../functions/timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

// Mock humanize delays
const getDelayMock = jest.fn<(name: string) => [number, number]>();
const shortDelayMock = jest.fn<(min: number, max: number) => Promise<void>>();
const mouseWiggleMock = jest.fn<(page: Page) => Promise<void>>();
jest.unstable_mockModule("../functions/timing/humanize/humanize.ts", () => ({
	getDelay: getDelayMock.mockReturnValue([0.1, 0.2]),
	shortDelay: shortDelayMock,
	mouseWiggle: mouseWiggleMock,
}));

// Mock database functions
const queueAddMock =
	jest.fn<
		(username: string, priority: number, source: string) => Promise<void>
	>();
const wasVisitedMock = jest.fn<(username: string) => Promise<boolean>>();
const getScrollIndexMock = jest.fn<(username: string) => Promise<number>>();
const updateScrollIndexMock =
	jest.fn<(username: string, index: number) => Promise<void>>();
jest.unstable_mockModule("../functions/shared/database/database.ts", () => ({
	queueAdd: queueAddMock,
	wasVisited: wasVisitedMock,
	getScrollIndex: getScrollIndexMock,
	updateScrollIndex: updateScrollIndexMock,
	getStats: jest.fn(() =>
		Promise.resolve({
			total_visited: 0,
			confirmed_creators: 0,
			dms_sent: 0,
			queue_size: 0,
		}),
	),
	markVisited: jest.fn(() => Promise.resolve()),
	markAsCreator: jest.fn(() => Promise.resolve()),
	queueCount: jest.fn(() => Promise.resolve(0)),
	queueNext: jest.fn(() => Promise.resolve(null)),
	wasDmSent: jest.fn(() => Promise.resolve(false)),
	wasFollowed: jest.fn(() => Promise.resolve(false)),
}));

// Mock modal operations
const openFollowingModalMock = jest.fn<(page: Page) => Promise<boolean>>();
const isFollowingModalEmptyMock = jest.fn<(page: Page) => Promise<boolean>>();
const extractFollowingUsernamesMock =
	jest.fn<(page: Page, batchSize: number) => Promise<string[]>>();
const scrollFollowingModalMock =
	jest.fn<
		(
			page: Page,
			amount: number,
		) => Promise<{ scrolled: boolean; scrollHeight: number }>
	>();
const clickUsernameInModalMock =
	jest.fn<(page: Page, username: string) => Promise<boolean>>();
const closeModalMock = jest.fn<(page: Page) => Promise<boolean>>();
jest.unstable_mockModule(
	"../functions/navigation/modalOperations/modalOperations.ts",
	() => ({
		openFollowingModal: openFollowingModalMock,
		isFollowingModalEmpty: isFollowingModalEmptyMock,
		extractFollowingUsernames: extractFollowingUsernamesMock,
		scrollFollowingModal: scrollFollowingModalMock,
		clickUsernameInModal: clickUsernameInModalMock,
		closeModal: closeModalMock,
	}),
);

// Mock profile navigation
const navigateToProfileAndCheckMock =
	jest.fn<
		(
			page: Page,
			username: string,
			options?: { timeout?: number },
		) => Promise<{ notFound: boolean; isPrivate: boolean }>
	>();
const checkProfileStatusMock = jest.fn<
	(page: Page) => Promise<{ notFound: boolean; isPrivate: boolean; isAccessible: boolean }>
>().mockResolvedValue({ notFound: false, isPrivate: false, isAccessible: true });
jest.unstable_mockModule(
	"../functions/navigation/profileNavigation/profileNavigation.ts",
	() => ({
		navigateToProfileAndCheck: navigateToProfileAndCheckMock,
		checkProfileStatus: checkProfileStatusMock,
	}),
);

// Mock profile stats
const getProfileStatsMock =
	jest.fn<
		(
			page: Page,
		) => Promise<{ following: number; followers: number; posts: number }>
	>();
jest.unstable_mockModule(
	"../functions/extraction/getProfileStats/getProfileStats.ts",
	() => ({
		getProfileStats: getProfileStatsMock,
	}),
);

// Mock config
jest.unstable_mockModule("../functions/shared/config/config.ts", () => ({
	CONFIDENCE_THRESHOLD: 70,
	MAX_DMS_PER_DAY: 50,
	FOLLOWING_BATCH_SIZE: 30,
}));

// Mock logger
const loggerMock = {
	info: jest.fn(),
	debug: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	errorWithScreenshot: jest.fn(() => Promise.resolve()),
};
const cycleManagerMock = {
	recordWarning: jest.fn(),
	recordProfileProcessed: jest.fn(),
	recordDMSent: jest.fn(),
	recordFollowCompleted: jest.fn(),
};
jest.unstable_mockModule("../functions/shared/logger/logger.ts", () => ({
	createLogger: () => loggerMock,
	createLoggerWithCycleTracking: () => ({
		logger: loggerMock,
		cycleManager: cycleManagerMock,
		startCycle: jest.fn().mockReturnValue("test-cycle"),
		endCycle: jest.fn(),
		recordError: jest.fn(),
		shouldContinue: jest.fn().mockReturnValue(true),
	}),
}));

// Mock session initializer
jest.unstable_mockModule(
	"../functions/auth/sessionInitializer/sessionInitializer.ts",
	() => ({
		initializeInstagramSession: jest.fn(() =>
			Promise.resolve({
				browser: { close: jest.fn(), disconnect: jest.fn() },
				page: {},
				logger: loggerMock,
			}),
		),
	}),
);

// Mock human scroll
jest.unstable_mockModule(
	"../functions/navigation/humanInteraction/humanInteraction.ts",
	() => ({
		humanScroll: jest.fn(() => Promise.resolve()),
		humanClick: jest.fn(() => Promise.resolve()),
		humanClickAt: jest.fn(() => Promise.resolve()),
	}),
);

// Mock bio matcher
jest.unstable_mockModule(
	"../functions/profile/bioMatcher/bioMatcher.ts",
	() => ({
		calculateScore: jest.fn(() => ({ score: 50 })),
	}),
);

// Mock profile actions
jest.unstable_mockModule(
	"../functions/profile/profileActions/profileActions.ts",
	() => ({
		sendDMToUser: jest.fn(() => Promise.resolve(true)),
		followUserAccount: jest.fn(() => Promise.resolve()),
		addFollowingToQueue: jest.fn(() => Promise.resolve(0)),
	}),
);

// Mock random engagement
jest.unstable_mockModule(
	"../functions/profile/profileActions/randomEngagement.ts",
	() => ({
		shouldEngageOnProfile: jest.fn(() => false),
		performRandomEngagement: jest.fn(() =>
			Promise.resolve({ type: "none", duration: 0, success: true }),
		),
	}),
);

// Mock profile analysis
jest.unstable_mockModule(
	"../functions/profile/profileAnalysis/profileAnalysis.ts",
	() => ({
		analyzeProfileComprehensive: jest.fn(() =>
			Promise.resolve({
				bio: "test bio",
				isCreator: false,
				confidence: 30,
				indicators: [],
				links: [],
				screenshots: [],
				reason: null,
			}),
		),
	}),
);

// Mock warmup
jest.unstable_mockModule("../functions/timing/warmup/warmup.ts", () => ({
	warmUpProfile: jest.fn(() =>
		Promise.resolve({ scrolls: 0, likes: 0, reelsWatched: 0 }),
	),
}));

// Mock metrics
jest.unstable_mockModule("../functions/shared/metrics/metrics.ts", () => ({
	getGlobalMetricsTracker: jest.fn(() => ({
		getSessionId: jest.fn(() => "test-session"),
		recordProfileVisit: jest.fn(),
		recordVisionApiCall: jest.fn(),
		recordCreatorFound: jest.fn(),
		recordDMSent: jest.fn(),
		recordFollowCompleted: jest.fn(),
		recordError: jest.fn(),
		endSession: jest.fn(),
		getSessionMetrics: jest.fn(() => ({
			profilesVisited: 0,
			creatorsFound: 0,
			dmsSent: 0,
		})),
	})),
	startTimer: jest.fn(() => ({ end: jest.fn(() => 0) })),
}));

// Mock snapshot
jest.unstable_mockModule("../functions/shared/snapshot/snapshot.ts", () => ({
	snapshot: jest.fn(() => Promise.resolve("test-screenshot.png")),
}));

// Import after mocks
const { loadSeeds, processFollowingList } = await import("./scrape.ts");

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("scrape", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sleepMock.mockResolvedValue(undefined);
		shortDelayMock.mockResolvedValue(undefined);
		mouseWiggleMock.mockResolvedValue(undefined);
		queueAddMock.mockResolvedValue(undefined);
		closeModalMock.mockResolvedValue(true);
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// loadSeeds() - Load Seeds from File
	// ═══════════════════════════════════════════════════════════════════════════

	describe("loadSeeds()", () => {
		test("returns 0 when seeds file does not exist", async () => {
			existsSyncMock.mockReturnValue(false);

			const count = await loadSeeds("data/seeds.txt");

			expect(count).toBe(0);
			expect(queueAddMock).not.toHaveBeenCalled();
		});

		test("loads seeds from file and adds to queue", async () => {
			existsSyncMock.mockReturnValue(true);
			readFileSyncMock.mockReturnValue("user1\nuser2\nuser3");

			const count = await loadSeeds("data/seeds.txt");

			expect(count).toBe(3);
			expect(queueAddMock).toHaveBeenCalledTimes(3);
			expect(queueAddMock).toHaveBeenCalledWith("user1", 100, "seed");
			expect(queueAddMock).toHaveBeenCalledWith("user2", 100, "seed");
			expect(queueAddMock).toHaveBeenCalledWith("user3", 100, "seed");
		});

		test("ignores empty lines and comments", async () => {
			existsSyncMock.mockReturnValue(true);
			readFileSyncMock.mockReturnValue(
				"user1\n\n# this is a comment\nuser2\n   \nuser3",
			);

			const count = await loadSeeds("data/seeds.txt");

			expect(count).toBe(3);
			expect(queueAddMock).toHaveBeenCalledTimes(3);
		});

		test("normalizes usernames to lowercase", async () => {
			existsSyncMock.mockReturnValue(true);
			readFileSyncMock.mockReturnValue("UserOne\nUSER_TWO");

			const count = await loadSeeds("data/seeds.txt");

			expect(count).toBe(2);
			expect(queueAddMock).toHaveBeenCalledWith("userone", 100, "seed");
			expect(queueAddMock).toHaveBeenCalledWith("user_two", 100, "seed");
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// processFollowingList() - Process Following List
	// ═══════════════════════════════════════════════════════════════════════════

	describe("processFollowingList()", () => {
		const createPageMock = () =>
			({
				url: jest.fn().mockReturnValue("https://instagram.com/testuser"),
				keyboard: { press: jest.fn() },
			}) as unknown as Page;

		test("returns early when seed profile is not found", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: true,
				isPrivate: false,
			});

			await processFollowingList("seeduser", page);

			expect(cycleManagerMock.recordWarning).toHaveBeenCalledWith(
				"PROFILE_NOT_FOUND",
				expect.any(String),
				"seeduser",
			);
			expect(openFollowingModalMock).not.toHaveBeenCalled();
		});

		test("returns early when seed profile is private", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: true,
			});

			await processFollowingList("seeduser", page);

			expect(cycleManagerMock.recordWarning).toHaveBeenCalledWith(
				"PROFILE_PRIVATE",
				expect.any(String),
				"seeduser",
			);
			expect(openFollowingModalMock).not.toHaveBeenCalled();
		});

		test("returns early when profile has 0 following", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 0,
				followers: 100,
				posts: 50,
			});

			await processFollowingList("seeduser", page);

			expect(cycleManagerMock.recordWarning).toHaveBeenCalledWith(
				"PROFILE_NOT_FOUND",
				"Profile has 0 following",
				"seeduser",
			);
			expect(openFollowingModalMock).not.toHaveBeenCalled();
		});

		test("returns early when modal fails to open", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(false);

			await processFollowingList("seeduser", page);

			expect(openFollowingModalMock).toHaveBeenCalled();
			expect(extractFollowingUsernamesMock).not.toHaveBeenCalled();
		});

		test("closes modal and returns when following list is empty", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(true);

			await processFollowingList("seeduser", page);

			expect(closeModalMock).toHaveBeenCalled();
			expect(extractFollowingUsernamesMock).not.toHaveBeenCalled();
		});

		test("extracts usernames and filters already visited", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(false);
			extractFollowingUsernamesMock
				.mockResolvedValueOnce(["user1", "user2", "user3"])
				.mockResolvedValue([]); // End extraction
			scrollFollowingModalMock.mockResolvedValue({
				scrolled: false,
				scrollHeight: 1000,
			});
			wasVisitedMock
				.mockResolvedValueOnce(false) // user1 not visited
				.mockResolvedValueOnce(true) // user2 already visited
				.mockResolvedValueOnce(false) // user3 not visited
				.mockResolvedValue(false); // For processing loop

			// Click first username succeeds
			clickUsernameInModalMock.mockResolvedValue(true);

			await processFollowingList("seeduser", page);

			// Should have extracted usernames
			expect(extractFollowingUsernamesMock).toHaveBeenCalled();
			// Should filter out visited
			expect(wasVisitedMock).toHaveBeenCalledWith("user1");
			expect(wasVisitedMock).toHaveBeenCalledWith("user2");
			expect(wasVisitedMock).toHaveBeenCalledWith("user3");
		});

		test("clicks first username in modal for natural navigation", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(false);
			extractFollowingUsernamesMock
				.mockResolvedValueOnce(["firstuser", "seconduser"])
				.mockResolvedValue([]);
			scrollFollowingModalMock.mockResolvedValue({
				scrolled: false,
				scrollHeight: 1000,
			});
			wasVisitedMock.mockResolvedValue(false);
			clickUsernameInModalMock.mockResolvedValue(true);

			await processFollowingList("seeduser", page);

			// Should click the first username in modal
			expect(clickUsernameInModalMock).toHaveBeenCalledWith(page, "firstuser");
		});

		test("falls back to closing modal when click fails", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(false);
			extractFollowingUsernamesMock
				.mockResolvedValueOnce(["user1"])
				.mockResolvedValue([]);
			scrollFollowingModalMock.mockResolvedValue({
				scrolled: false,
				scrollHeight: 1000,
			});
			wasVisitedMock.mockResolvedValue(false);
			clickUsernameInModalMock.mockResolvedValue(false); // Click fails

			await processFollowingList("seeduser", page);

			// Should fall back to closing modal
			expect(shortDelayMock).toHaveBeenCalled();
			expect(closeModalMock).toHaveBeenCalled();
		});

		test("processes multiple batches until following list exhausted", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(false);

			// First batch: return 15 usernames, then empty (triggers second batch)
			// Second batch: return 10 usernames, then flatline
			let callCount = 0;
			extractFollowingUsernamesMock.mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					// First batch extractions
					return Promise.resolve(
						Array.from({ length: 15 }, (_, i) => `user_batch1_${i}`),
					);
				}
				if (callCount <= 4) {
					// Second batch extractions
					return Promise.resolve(
						Array.from({ length: 10 }, (_, i) => `user_batch2_${i}`),
					);
				}
				return Promise.resolve([]); // Empty after that
			});

			// Flatline after second batch
			let scrollHeight = 1000;
			let scrollCount = 0;
			scrollFollowingModalMock.mockImplementation(() => {
				scrollCount++;
				if (scrollCount <= 3) {
					scrollHeight += 500;
				}
				// After scroll 3, height stays same (flatline)
				return Promise.resolve({
					scrolled: scrollCount <= 3,
					scrollHeight,
				});
			});
			wasVisitedMock.mockResolvedValue(false);
			clickUsernameInModalMock.mockResolvedValue(true);

			await processFollowingList("seeduser", page);

			// Should have processed multiple batches
			expect(loggerMock.info).toHaveBeenCalledWith(
				"BATCH",
				expect.stringContaining("Starting batch #1"),
			);
			// Should indicate exhaustion
			expect(loggerMock.info).toHaveBeenCalledWith(
				"PROFILE",
				expect.stringContaining("Finished processing"),
			);
		});

		test("detects end of list via scroll flatline", async () => {
			const page = createPageMock();
			navigateToProfileAndCheckMock.mockResolvedValue({
				notFound: false,
				isPrivate: false,
			});
			getProfileStatsMock.mockResolvedValue({
				following: 100,
				followers: 100,
				posts: 50,
			});
			openFollowingModalMock.mockResolvedValue(true);
			isFollowingModalEmptyMock.mockResolvedValue(false);
			extractFollowingUsernamesMock.mockResolvedValue(["user1"]);
			// Scroll height doesn't change (flatline)
			scrollFollowingModalMock.mockResolvedValue({
				scrolled: false,
				scrollHeight: 1000, // Same height twice = flatline
			});
			wasVisitedMock.mockResolvedValue(false);
			clickUsernameInModalMock.mockResolvedValue(true);

			await processFollowingList("seeduser", page);

			// Should detect flatline and stop
			expect(loggerMock.info).toHaveBeenCalledWith(
				"EXTRACTION",
				expect.stringContaining("End of following list"),
			);
		});
	});
});
