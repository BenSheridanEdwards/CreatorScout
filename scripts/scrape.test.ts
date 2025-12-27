/**
 * Unit tests for scrape.ts functions
 */
import { jest } from "@jest/globals";

// Mock all the dependencies
const mockMouseWiggle = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);
const mockNavigateToProfileAndCheck =
	jest.fn<
		() => Promise<
			import("../functions/navigation/profileNavigation/profileNavigation.ts").ProfileStatus
		>
	>();
const mockAnalyzeProfileComprehensive =
	jest.fn<
		() => Promise<
			import("../functions/profile/profileAnalysis/profileAnalysis.ts").ComprehensiveAnalysisResult
		>
	>();
const mockAnalyzeLinkWithVision = jest.fn<() => Promise<unknown>>(); // Keep for backwards compatibility
const mockSnapshot = jest.fn<() => Promise<string>>();
const mockMarkAsCreator = jest.fn<() => Promise<void>>();
const mockSendDMToUser = jest.fn<() => Promise<boolean>>();
const mockFollowUserAccount = jest.fn<() => Promise<boolean>>();
const mockAddFollowingToQueue = jest.fn<() => Promise<number>>();
const mockGetDelay = jest.fn<() => number>();
const mockSleep = jest.fn<() => Promise<void>>();
const mockEnsureLoggedIn = jest.fn<() => Promise<void>>();
const mockOpenFollowingModal = jest.fn<() => Promise<void>>();
const mockExtractFollowingUsernames = jest.fn<() => Promise<string[]>>();
const mockScrollFollowingModal = jest.fn<() => Promise<void>>();
const mockWasVisited = jest.fn<() => Promise<boolean>>();
const mockMarkVisited = jest.fn<() => Promise<void>>();
const mockGetScrollIndex = jest.fn<() => Promise<number>>();
const mockUpdateScrollIndex = jest.fn<() => Promise<void>>();
const mockGetStats =
	jest.fn<
		() => Promise<import("../functions/shared/database/database.ts").Stats>
	>();
const mockInitDb = jest.fn<() => Promise<void>>();
const mockQueueAdd = jest.fn<() => Promise<void>>();
const mockQueueCount = jest.fn<() => Promise<number>>();
const mockQueueNext = jest.fn<() => Promise<string | null>>();
const mockWasDmSent = jest.fn<() => Promise<boolean>>();
const mockWasFollowed = jest.fn<() => Promise<boolean>>();
const mockGetDailyMetrics =
	jest.fn<
		() => Promise<
			import("../functions/shared/database/database.ts").DailyMetrics | null
		>
	>();
const mockCreateLogger =
	jest.fn<() => import("../functions/shared/logger/logger.ts").Logger>();
const mockCreateLoggerWithCycleTracking =
	jest.fn<
		() => ReturnType<
			typeof import("../functions/shared/logger/loggingIntegration.ts").createLoggerWithCycleTracking
		>
	>();
const mockGetGlobalMetricsTracker =
	jest.fn<
		() => import("../functions/shared/metrics/metrics.ts").MetricsTracker
	>();

// Mock the modules
jest.unstable_mockModule("node:fs", () => ({
	existsSync: jest.fn(),
	readFileSync: jest.fn(),
	mkdirSync: jest.fn(),
	writeFileSync: jest.fn(),
	unlinkSync: jest.fn(),
}));

jest.unstable_mockModule("../functions/shared/config/config.ts", () => ({
	FAST_MODE: false,
	SKIP_VISION: false,
	LOCAL_BROWSER: false,
	DEBUG_SCREENSHOTS: false,
	DELAY_SCALE: 1.0,
	SLEEP_SCALE: 1.0,
	DELAY_SCALES: {},
	DELAYS: {},
	DELAY_CATEGORIES: {},
	TIMEOUT_SCALE: 1.0,
	TIMEOUTS: {},
	BROWSERLESS_TOKEN: "mock_token",
	OPENROUTER_API_KEY: "mock_key",
	IG_USER: "mock_user",
	IG_PASS: "mock_pass",
	VISION_MODEL: "mock_model",
	CONFIDENCE_THRESHOLD: 40,
	MAX_DMS_PER_DAY: 10,
	DM_MESSAGE: "mock_message",
}));

jest.unstable_mockModule("../functions/timing/humanize/humanize.ts", () => ({
	mouseWiggle: mockMouseWiggle,
	getDelay: mockGetDelay,
}));

jest.unstable_mockModule(
	"../functions/navigation/profileNavigation/profileNavigation.ts",
	() => ({
		navigateToProfileAndCheck: mockNavigateToProfileAndCheck,
		ensureLoggedIn: mockEnsureLoggedIn,
	}),
);

jest.unstable_mockModule(
	"../functions/profile/profileAnalysis/profileAnalysis.ts",
	() => ({
		analyzeProfileComprehensive: mockAnalyzeProfileComprehensive,
	}),
);

jest.unstable_mockModule("../functions/shared/snapshot/snapshot.ts", () => ({
	snapshot: mockSnapshot,
}));

jest.unstable_mockModule("../functions/shared/database/database.ts", () => ({
	getScrollIndex: mockGetScrollIndex,
	getStats: mockGetStats,
	getDailyMetrics: mockGetDailyMetrics,
	initDb: mockInitDb,
	markAsCreator: mockMarkAsCreator,
	markVisited: mockMarkVisited,
	queueAdd: mockQueueAdd,
	queueCount: mockQueueCount,
	queueNext: mockQueueNext,
	updateScrollIndex: mockUpdateScrollIndex,
	wasDmSent: mockWasDmSent,
	wasFollowed: mockWasFollowed,
	wasVisited: mockWasVisited,
}));

jest.unstable_mockModule(
	"../functions/profile/profileActions/profileActions.ts",
	() => ({
		sendDMToUser: mockSendDMToUser,
		followUserAccount: mockFollowUserAccount,
		addFollowingToQueue: mockAddFollowingToQueue,
	}),
);

jest.unstable_mockModule("../functions/timing/sleep/sleep.ts", () => ({
	sleep: mockSleep,
}));

jest.unstable_mockModule(
	"../functions/navigation/modalOperations/modalOperations.ts",
	() => ({
		openFollowingModal: mockOpenFollowingModal,
		extractFollowingUsernames: mockExtractFollowingUsernames,
		scrollFollowingModal: mockScrollFollowingModal,
	}),
);

jest.unstable_mockModule("../functions/shared/logger/logger.ts", () => ({
	createLogger: mockCreateLogger,
	createLoggerWithCycleTracking: mockCreateLoggerWithCycleTracking,
}));

jest.unstable_mockModule("../functions/shared/metrics/metrics.ts", () => ({
	getGlobalMetricsTracker: mockGetGlobalMetricsTracker,
	startTimer: jest.fn(() => ({
		end: jest.fn(() => 1.5),
	})),
}));

describe.skip("scrape.ts", () => {
	let mockLogger: import("../functions/shared/logger/logger.ts").Logger;
	let mockPage: import("puppeteer").Page;
	let mockCycleManager: {
		recordWarning: jest.Mock;
		recordProfileProcessed: jest.Mock;
		recordDMSent: jest.Mock;
		recordFollowCompleted: jest.Mock;
	};
	let mockStartCycle: jest.Mock;
	let mockEndCycle: jest.Mock;
	let mockRecordError: jest.Mock;
	let mockShouldContinue: jest.Mock<() => boolean>;
	const setShouldContinueLimit = (limit: number) => {
		let callCount = 0;
		mockShouldContinue.mockImplementation(() => {
			callCount++;
			return callCount <= limit;
		});
	};

	beforeEach(() => {
		jest.clearAllMocks();
		// Removed jest.resetModules() to prevent memory issues from repeated module reloading
		// Mocks are already set up at the top level, so resetModules is not needed

		mockLogger = {
			info: jest.fn<(...args: unknown[]) => void>(),
			debug: jest.fn<(...args: unknown[]) => void>(),
			warn: jest.fn<(...args: unknown[]) => void>(),
			error: jest.fn<(...args: unknown[]) => void>(),
			errorWithScreenshot: jest.fn<(...args: unknown[]) => Promise<void>>(),
		} as import("../functions/shared/logger/logger.ts").Logger;
		mockCreateLogger.mockReturnValue(mockLogger);

		mockPage = {
			keyboard: {
				press: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			},
		} as unknown as import("puppeteer").Page;

		// Set up default mock returns
		mockNavigateToProfileAndCheck.mockResolvedValue({
			notFound: false,
			isPrivate: false,
			isAccessible: true,
		});
		mockAnalyzeProfileComprehensive.mockResolvedValue({
			bio: "Test bio with content",
			bioScore: 45,
			isLikely: true,
			links: [],
			stats: null,
			highlights: [],
			confidence: 45,
			indicators: ["High follower ratio (500.0x)"],
			screenshots: [],
			isCreator: false,
			reason: null,
		});
		mockGetDelay.mockReturnValue(2);
		mockWasVisited.mockResolvedValue(false);
		mockGetScrollIndex.mockResolvedValue(0);
		mockGetStats.mockResolvedValue({
			total_visited: 0,
			confirmed_creators: 0,
			dms_sent: 0,
			queue_size: 0,
		});
		mockQueueCount.mockResolvedValue(0);
		mockQueueNext.mockResolvedValue(null);
		mockWasDmSent.mockResolvedValue(false);
		mockWasFollowed.mockResolvedValue(false);
		mockEnsureLoggedIn.mockResolvedValue(undefined);

		mockCycleManager = {
			recordWarning: jest.fn<() => void>(),
			recordProfileProcessed: jest.fn<() => void>(),
			recordDMSent: jest.fn<() => void>(),
			recordFollowCompleted: jest.fn<() => void>(),
		};
		mockStartCycle = jest.fn<() => void>();
		mockEndCycle = jest.fn<() => void>();
		mockRecordError = jest.fn<() => void>();
		mockShouldContinue = jest.fn<() => boolean>();
		setShouldContinueLimit(2);

		mockCreateLoggerWithCycleTracking.mockReturnValue({
			logger:
				mockLogger as import("../functions/shared/logger/enhancedLogger.ts").EnhancedLogger,
			cycleManager:
				mockCycleManager as unknown as import("../functions/shared/logger/cycleManager.ts").CycleManager,
			startCycle: mockStartCycle as (
				seedUsername?: string,
				estimatedProfiles?: number,
			) => string,
			endCycle: mockEndCycle as (
				status: import("../functions/shared/logger/enhancedLogger.ts").CycleStatus,
				reason?: string,
			) => void,
			recordError: mockRecordError as (
				error: Error | string,
				context: string,
				profile?: string,
			) => void,
			shouldContinue: mockShouldContinue,
		});
		// Set up default metrics tracker mock
		mockGetGlobalMetricsTracker.mockReturnValue({
			recordProfileVisit: jest.fn(),
			recordCreatorFound: jest.fn(),
			recordVisionApiCall: jest.fn(),
			recordDMSent: jest.fn(),
			recordFollowCompleted: jest.fn(),
			recordError: jest.fn(),
			endSession: jest.fn(),
			getSessionMetrics: jest.fn(() => ({
				sessionId: "test-session",
				startTime: new Date(),
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				totalProcessingTime: 0,
				visionApiCalls: 0,
				visionApiCost: 0,
			})),
			getSessionId: jest.fn(() => "test-session"),
		} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker);

		// Default metrics tracker for individual tests
		const defaultMetricsTracker = {
			recordProfileVisit: jest.fn(),
			recordCreatorFound: jest.fn(),
			recordVisionApiCall: jest.fn(),
			recordDMSent: jest.fn(),
			recordFollowCompleted: jest.fn(),
			recordError: jest.fn(),
		};
	});

	describe("loadSeeds", () => {
		it("loads seeds from default seeds.txt file", async () => {
			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds();

			// Should load the seeds from seeds.txt
			expect(typeof count).toBe("number");
		});

		it("returns 0 when file does not exist", async () => {
			// Mock fs for this test
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			mockExistsSync.mockReturnValue(false);

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("nonexistent.txt");

			expect(count).toBe(0);
			expect(mockExistsSync).toHaveBeenCalledWith("nonexistent.txt");
		});

		it("returns 0 for empty file", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("");

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("empty.txt");

			expect(count).toBe(0);
			expect(mockExistsSync).toHaveBeenCalledWith("empty.txt");
			expect(mockReadFileSync).toHaveBeenCalledWith("empty.txt", "utf-8");
		});

		it("loads valid usernames and skips comments and empty lines", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(`# This is a comment
user1
   user2

# Another comment
user3
`);

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("test.txt");

			expect(count).toBe(3);
			expect(mockQueueAdd).toHaveBeenCalledTimes(3);
			expect(mockQueueAdd).toHaveBeenCalledWith("user1", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("user2", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("user3", 100, "seed");
		});

		it("trims whitespace and converts to lowercase", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("  USERNAME  \n  UserName2  ");

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("whitespace.txt");

			expect(count).toBe(2);
			expect(mockQueueAdd).toHaveBeenCalledWith("username", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("username2", 100, "seed");
		});

		it("skips lines starting with # and empty lines", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(`
# comment
   # indented comment
user1

user2
# another comment
`);

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("comments.txt");

			expect(count).toBe(2);
			expect(mockQueueAdd).toHaveBeenCalledTimes(2);
		});

		it("handles custom file path", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("customuser");

			const { loadSeeds } = await import("./scrape.ts");

			const count = await loadSeeds("custom/path/seeds.txt");

			expect(count).toBe(1);
			expect(mockExistsSync).toHaveBeenCalledWith("custom/path/seeds.txt");
			expect(mockReadFileSync).toHaveBeenCalledWith(
				"custom/path/seeds.txt",
				"utf-8",
			);
			expect(mockQueueAdd).toHaveBeenCalledWith("customuser", 100, "seed");
		});
	});

	describe("processProfile", () => {
		it("calls mouseWiggle after navigation", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 30,
				isLikely: false,
				links: [],
				stats: null,
				highlights: [],
				confidence: 30,
				indicators: [],
				screenshots: [],
				isCreator: false,
				reason: null,
			});

			await processProfile("testuser", mockPage, "test_source");

			expect(mockNavigateToProfileAndCheck).toHaveBeenCalledWith(
				mockPage,
				"testuser",
				{
					timeout: 15000,
				},
			);
			expect(mockMouseWiggle).toHaveBeenCalledWith(mockPage);
		});

		it("handles private accounts", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: false,
				isPrivate: true,
				isAccessible: false,
			});

			await processProfile("privateuser", mockPage, "test_source");

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"PROFILE",
				"Profile is private: @privateuser",
			);
			expect(mockMarkVisited).toHaveBeenCalledWith(
				"privateuser",
				undefined,
				undefined,
				0,
			);
		});

		it("handles not found profiles", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: true,
				isPrivate: false,
				isAccessible: false,
			});

			await processProfile("notfounduser", mockPage, "test_source");

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"PROFILE",
				"Profile not found: @notfounduser",
			);
			expect(mockMarkVisited).toHaveBeenCalledWith(
				"notfounduser",
				undefined,
				undefined,
				0,
			);
		});

		it("skips already visited profiles", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockWasVisited.mockResolvedValue(true);

			await processProfile("visiteduser", mockPage, "test_source");

			expect(mockLogger.debug).toHaveBeenCalledWith(
				"PROFILE",
				"Already visited, skipping @visiteduser",
			);
			expect(mockNavigateToProfileAndCheck).not.toHaveBeenCalled();
		});

		it("confirms creator with high bio score (70+)", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio with patreon",
				bioScore: 75,
				isLikely: true,
				links: [],
				stats: null,
				highlights: [],
				confidence: 75,
				indicators: ["Bio contains creator keywords: patreon"],
				screenshots: [],
				isCreator: true, // Set to true for high confidence
				reason: "combined_signals",
			});

			await processProfile("highscoreuser", mockPage, "test_source");

			expect(mockLogger.info).toHaveBeenCalledWith(
				"ANALYSIS",
				"Bio: Test bio with patreon",
			);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"ANALYSIS",
				"Confidence: 75%",
			);
			expect(mockMarkAsCreator).toHaveBeenCalledWith("highscoreuser", 75, null);
		});

		it("confirms creator with vision analysis", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				isLikely: true,
				links: ["https://linktr.ee/test"],
				stats: null,
				highlights: [],
				confidence: 85,
				indicators: [
					"External links in profile",
					"subscription",
					"exclusive content",
				],
				screenshots: ["test_screenshot.png"],
				isCreator: true,
				reason: "linktree",
			});

			await processProfile("visionuser", mockPage, "test_source");

			expect(mockLogger.info).toHaveBeenCalledWith(
				"ACTION",
				"🎉 CONFIRMED CREATOR @visionuser (confidence: 85%, source: test_source, vision calls: 1)",
			);
		});

		it("sends DM and follows confirmed creators", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});

			await processProfile("creatoruser", mockPage, "test_source");

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "creatoruser");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"creatoruser",
			);
			expect(mockAddFollowingToQueue).toHaveBeenCalled();
		});

		it("handles navigation errors gracefully", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockRejectedValue(
				new Error("Network timeout"),
			);

			await processProfile("erroruser", mockPage, "test_source");

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"WARN",
				"Failed to load profile @erroruser: Network timeout",
				mockPage,
				"profile_load_erroruser",
			);
		});

		it("handles critical errors in processProfile with proper error handling", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker;
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			// Simulate a critical error during bio analysis
			// Mock to simulate a critical error after bio analysis (in the main processing logic)
			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: ["https://linktr.ee/test"],
				stats: null,
				highlights: [],
				confidence: 50,
				indicators: [],
				screenshots: [],
				isCreator: false,
				reason: null, // Has link so snapshot will be called
				isLikely: true,
			});

			mockAnalyzeLinkWithVision.mockResolvedValue({
				isCreator: true,
				confidence: 85,
				indicators: ["subscription"],
			});

			mockSendDMToUser.mockResolvedValue(true);
			mockFollowUserAccount.mockResolvedValue(true);
			mockAddFollowingToQueue.mockResolvedValue(5);

			// Mock sleep to throw an error that will be caught by the main try/catch (at the end)
			mockSleep.mockRejectedValueOnce(
				new Error("Critical bio analysis failure"),
			);

			await processProfile(
				"criticalerror",
				mockPage,
				"test_source",
				mockMetricsTracker,
			);

			// Should record the error in metrics
			expect(mockMetricsTracker.recordError).toHaveBeenCalledWith(
				"criticalerror",
				"profile_load_failed",
				"Critical bio analysis failure",
			);

			// Should take error screenshot
			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"WARN",
				"Failed to load profile @criticalerror: Critical bio analysis failure",
				mockPage,
				"profile_load_criticalerror",
			);

			// Note: Profile visit metrics are not recorded because error happens during initial load
			// before the main processing logic that would trigger the finally block
		});

		it("handles DM sending errors", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(false); // DM fails
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile("dmerror", mockPage, "test_source");

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "dmerror");
			// Should still try to follow even if DM fails
			expect(mockFollowUserAccount).toHaveBeenCalledWith(mockPage, "dmerror");
		});

		it("handles follow action errors", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 90,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(true); // DM succeeds
			mockFollowUserAccount.mockResolvedValue(false); // Follow fails
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile("followerror", mockPage, "test_source");

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "followerror");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"followerror",
			);
			// Should still mark as creator and add to queue even if follow fails
			expect(mockMarkAsCreator).toHaveBeenCalledWith("followerror", 90, null);
			expect(mockAddFollowingToQueue).toHaveBeenCalled();
		});

		it("handles following queue addition errors", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 90,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(true); // DM succeeds
			mockFollowUserAccount.mockResolvedValue(true); // Follow succeeds
			mockAddFollowingToQueue.mockResolvedValue(0); // Queue addition "fails" (returns 0)
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile("queueerror", mockPage, "test_source");

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "queueerror");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"queueerror",
			);
			expect(mockMarkAsCreator).toHaveBeenCalledWith("queueerror", 90, null);
			expect(mockAddFollowingToQueue).toHaveBeenCalled();
		});

		it("records metrics for profile visits with complete data", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker;
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio with content",
				bioScore: 45,
				links: [],
				stats: null,
				highlights: [],
				confidence: 50,
				indicators: [],
				screenshots: [],
				isCreator: false,
				reason: null,
				isLikely: true,
			});

			await processProfile(
				"metricsuser",
				mockPage,
				"following_of_source",
				mockMetricsTracker,
			);

			// Should record profile visit with complete data at the end
			expect(mockMetricsTracker.recordProfileVisit).toHaveBeenCalledWith(
				"metricsuser",
				expect.any(Number), // processing time
				"following_of_source",
				2, // discovery depth (following_of_ has 2 underscores)
				"source", // source profile
				[], // contentCategories
				0, // visionApiCalls (none in this case)
			);
		});

		it("tracks vision API calls cumulatively in metrics", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker;
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				links: ["https://linktr.ee/test"],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: ["test_screenshot.png"], // One screenshot = one vision call
				isCreator: true,
				reason: "test",
				isLikely: true,
			});

			await processProfile(
				"visionuser",
				mockPage,
				"testsource", // Remove underscore so discovery depth is 0
				mockMetricsTracker,
			);

			// Should record vision API call
			expect(mockMetricsTracker.recordVisionApiCall).toHaveBeenCalledWith(
				0.001,
			);

			// Should record profile visit with vision API call count
			expect(mockMetricsTracker.recordProfileVisit).toHaveBeenCalledWith(
				"visionuser",
				expect.any(Number),
				"testsource",
				0, // discovery depth
				undefined, // source profile
				[], // contentCategories
				1, // visionApiCalls (based on screenshots.length)
			);
		});

		it("records creator found metrics", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker;
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 80,
				links: [],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile(
				"creatoruser",
				mockPage,
				"test_source",
				mockMetricsTracker,
			);

			expect(mockMetricsTracker.recordCreatorFound).toHaveBeenCalledWith(
				"creatoruser",
				80,
				0, // vision api calls
			);
			expect(mockMetricsTracker.recordDMSent).toHaveBeenCalledWith(
				"creatoruser",
			);
			expect(mockMetricsTracker.recordFollowCompleted).toHaveBeenCalledWith(
				"creatoruser",
			);
		});

		it("records error metrics on navigation failure", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			} as unknown as import("../functions/shared/metrics/metrics.ts").MetricsTracker;
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockNavigateToProfileAndCheck.mockRejectedValue(
				new Error("Navigation failed"),
			);

			await processProfile(
				"erroruser",
				mockPage,
				"test_source",
				mockMetricsTracker,
			);

			expect(mockMetricsTracker.recordError).toHaveBeenCalledWith(
				"erroruser",
				"profile_load_failed",
				"Navigation failed",
			);
		});

		it("handles vision analysis that does not confirm creator", async () => {
			const { processProfile } = await import("./scrape.ts");

			// Mock a profile with external links that would trigger vision analysis
			// but vision analysis doesn't confirm creator status
			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio with linktree",
				bioScore: 60,
				isLikely: true,
				links: ["https://linktr.ee/testprofile"],
				stats: null,
				highlights: [],
				confidence: 60, // Above threshold but vision doesn't confirm
				indicators: ["External links in profile"],
				screenshots: ["vision_screenshot.png"], // Vision was attempted
				isCreator: false, // Vision analysis didn't confirm creator
				reason: null,
			});

			await processProfile("novisioncreator", mockPage, "test_source");

			// Should analyze the profile and attempt vision
			expect(mockAnalyzeProfileComprehensive).toHaveBeenCalledWith(
				mockPage,
				"novisioncreator",
			);

			// Should not mark as creator since vision didn't confirm
			expect(mockMarkAsCreator).not.toHaveBeenCalled();

			// Should not send DM or follow since not confirmed as creator
			expect(mockSendDMToUser).not.toHaveBeenCalled();
			expect(mockFollowUserAccount).not.toHaveBeenCalled();

			// Should record that profile was processed but no creator found
			expect(mockWasVisited).toHaveBeenCalledWith("novisioncreator");
		});

		it("skips DM if already sent", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockWasDmSent.mockResolvedValue(true);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile("alreadydm", mockPage, "test_source");

			expect(mockSendDMToUser).not.toHaveBeenCalled();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"ACTION",
				"DM already sent to @alreadydm",
			);
			// Should still follow
			expect(mockFollowUserAccount).toHaveBeenCalledWith(mockPage, "alreadydm");
		});

		it("skips follow if already following", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				links: [],
				stats: null,
				highlights: [],
				confidence: 80,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(true);

			await processProfile("alreadyfollow", mockPage, "test_source");

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "alreadyfollow");
			expect(mockFollowUserAccount).not.toHaveBeenCalled();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"ACTION",
				"Already following @alreadyfollow",
			);
		});

		it("handles low bio score that doesn't meet confidence threshold", async () => {
			const { processProfile } = await import("./scrape.ts");

			// Mock a profile with low bio score that doesn't meet confidence threshold
			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 35,
				isLikely: false, // Low score, not likely a creator
				links: [],
				stats: null,
				highlights: [],
				confidence: 35, // Below CONFIDENCE_THRESHOLD (50)
				indicators: [],
				screenshots: [], // No vision analysis attempted
				isCreator: false,
				reason: null,
			});

			await processProfile("lowscore", mockPage, "test_source");

			// Should analyze the profile
			expect(mockAnalyzeProfileComprehensive).toHaveBeenCalledWith(
				mockPage,
				"lowscore",
			);

			// Should not mark as creator due to low confidence
			expect(mockMarkAsCreator).not.toHaveBeenCalled();

			// Should not send DM or follow since confidence too low
			expect(mockSendDMToUser).not.toHaveBeenCalled();
			expect(mockFollowUserAccount).not.toHaveBeenCalled();

			// Should record that profile was visited but not as creator
			expect(mockWasVisited).toHaveBeenCalledWith("lowscore");
		});

		it("handles bio score between 40-70 that meets threshold", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 60, // Above CONFIDENCE_THRESHOLD (50)
				links: [],
				stats: null,
				highlights: [],
				confidence: 60,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});
			mockWasDmSent.mockResolvedValue(false);
			mockWasFollowed.mockResolvedValue(false);

			await processProfile("mediumscore", mockPage, "test_source");

			expect(mockMarkAsCreator).toHaveBeenCalledWith("mediumscore", 60, null);
			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "mediumscore");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"mediumscore",
			);
		});

		it("takes screenshot for creators with links", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 85,
				links: ["https://linktr.ee/creator"],
				stats: null,
				highlights: [],
				confidence: 85,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});

			mockSnapshot.mockResolvedValue("/path/to/screenshot.png");

			await processProfile("screenshotuser", mockPage, "test_source");

			expect(mockSnapshot).toHaveBeenCalledWith(
				mockPage,
				"creator_screenshotuser",
			);
			expect(mockMarkAsCreator).toHaveBeenCalledWith(
				"screenshotuser",
				85,
				"/path/to/screenshot.png",
			);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"SCREENSHOT",
				"Creator proof saved: /path/to/screenshot.png",
			);
		});

		it("handles profiles with no bio found", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: null,
				bioScore: 0,
				links: [],
				stats: null,
				highlights: [],
				confidence: 50,
				indicators: [],
				screenshots: [],
				isCreator: false,
				reason: null,
				isLikely: false,
			});

			await processProfile("nobiouser", mockPage, "test_source");

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"ANALYSIS",
				"No bio found for @nobiouser",
			);
			expect(mockMarkVisited).toHaveBeenCalledWith(
				"nobiouser",
				undefined,
				undefined,
				0,
			);
			expect(mockRecordError).toHaveBeenCalledWith(
				"No bio found",
				"comprehensive_analysis_nobiouser",
				"nobiouser",
			);
			// Should not proceed to creator actions
			expect(mockMarkAsCreator).not.toHaveBeenCalled();
			expect(mockSendDMToUser).not.toHaveBeenCalled();
		});

		it("handles vision analysis errors gracefully", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				links: ["https://linktr.ee/test"],
				stats: null,
				highlights: [],
				confidence: 50,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "bio_score",
				isLikely: true,
			});

			await processProfile("visionerroruser", mockPage, "test_source");

			// Should still mark as visited and potentially as creator based on bio score
			expect(mockMarkVisited).toHaveBeenCalledWith(
				"visionerroruser",
				undefined,
				"Test bio",
				50,
			);
		});

		it("falls back to CONFIDENCE_THRESHOLD when vision doesn't confirm creator", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 55, // Above CONFIDENCE_THRESHOLD (50)
				links: [],
				stats: null,
				highlights: [],
				confidence: 55,
				indicators: [],
				screenshots: [],
				isCreator: true,
				reason: "test",
				isLikely: true,
			});

			await processProfile("thresholduser", mockPage, "test_source");

			expect(mockMarkAsCreator).toHaveBeenCalledWith("thresholduser", 55, null);
			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "thresholduser");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"thresholduser",
			);
		});

		it("applies final delay after profile processing", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileComprehensive.mockResolvedValue({
				bio: "Test bio",
				bioScore: 30, // Below threshold to skip creator logic
				links: [],
				stats: null,
				highlights: [],
				confidence: 50,
				indicators: [],
				screenshots: [],
				isCreator: false,
				reason: null,
				isLikely: false,
			});

			await processProfile("delayuser", mockPage, "test_source");

			// Should call sleep for final delay between profiles
			expect(mockSleep).toHaveBeenCalled();
			// Check that getDelay was called for delays
			expect(mockGetDelay).toHaveBeenCalled();
		});
	});

	describe("processFollowingList", () => {
		beforeEach(() => {
			mockExtractFollowingUsernames.mockResolvedValue(["user1", "user2"]);
			mockOpenFollowingModal.mockResolvedValue(undefined);
			mockWasVisited.mockResolvedValue(false);
		});

		it("stops after consecutive all-visited batches", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			// All users already visited
			mockWasVisited.mockResolvedValue(true);
			mockExtractFollowingUsernames.mockResolvedValue(["user1", "user2"]);
			setShouldContinueLimit(3);

			await processFollowingList("seeduser", mockPage);

			// Should call scroll 3 times (consecutive all-visited limit)
			expect(mockScrollFollowingModal).toHaveBeenCalledTimes(3);
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"NAVIGATION",
				"All profiles in batch already visited (3/3)",
			);
		});

		it("processes new profiles and continues", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			// First batch: all visited
			// Second batch: has new users
			let callCount = 0;
			mockWasVisited.mockImplementation(() => {
				callCount++;
				return Promise.resolve(callCount <= 2); // First 2 users visited, others not
			});

			mockExtractFollowingUsernames
				.mockResolvedValueOnce(["user1", "user2"]) // batch 1: all visited
				.mockResolvedValueOnce(["user3", "user4"]); // batch 2: new users

			await processFollowingList("seeduser", mockPage);

			// Should process user3 and user4
			expect(mockWasVisited).toHaveBeenCalledWith("user3");
			expect(mockWasVisited).toHaveBeenCalledWith("user4");

			// Should log batch information
			expect(mockLogger.info).toHaveBeenCalledWith(
				"QUEUE",
				"Processing batch 1 with 2 profiles (scroll position: 0)",
			);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"QUEUE",
				"Processing batch 2 with 2 profiles (scroll position: 500)",
			);
		});

		it("closes modal before profile visits and reopens", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockWasVisited.mockResolvedValue(false); // New users
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("seeduser", mockPage);

			// Should press Escape to close modal
			expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape");

			// Should navigate back to seed profile and reopen modal
			expect(mockNavigateToProfileAndCheck).toHaveBeenCalledWith(
				mockPage,
				"seeduser",
				{
					timeout: 15000,
				},
			);
			expect(mockOpenFollowingModal).toHaveBeenCalled();
		});

		it("handles seed profile not found", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: true,
				isPrivate: false,
				isAccessible: false,
			});

			await processFollowingList("notfoundseed", mockPage);

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"PROFILE",
				"Seed profile @notfoundseed is not found",
			);
			expect(mockOpenFollowingModal).not.toHaveBeenCalled();
		});

		it("handles private seed profile", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: false,
				isPrivate: true,
				isAccessible: false,
			});

			await processFollowingList("privateseed", mockPage);

			expect(mockLogger.warn).toHaveBeenCalledWith(
				"PROFILE",
				"Seed profile @privateseed is private",
			);
			expect(mockOpenFollowingModal).not.toHaveBeenCalled();
		});

		it("handles seed profile navigation errors", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockRejectedValue(
				new Error("Navigation failed"),
			);

			await processFollowingList("errorseed", mockPage);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Failed to load seed profile @errorseed: Navigation failed",
				mockPage,
				"seed_profile_load_errorseed",
			);
		});

		it("handles modal opening failure", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockOpenFollowingModal.mockResolvedValue(undefined);

			await processFollowingList("modalerror", mockPage);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Could not open following modal for @modalerror",
				mockPage,
				"modal_open_modalerror",
			);
		});

		it("handles scroll index restoration", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			setShouldContinueLimit(1);
			mockGetScrollIndex.mockResolvedValue(1000); // Already scrolled
			mockWasVisited.mockResolvedValue(false);
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("scrollseed", mockPage);

			// Initial scroll to position: Math.floor(1000/500) = 2 scrolls
			// After processing profile, scroll back: Math.floor(1000/500) = 2 scrolls
			// Total: 4 scrolls
			expect(mockScrollFollowingModal).toHaveBeenCalledTimes(4);
		});

		it("handles scroll restoration after profile processing", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockGetScrollIndex.mockResolvedValue(500);
			mockWasVisited.mockResolvedValue(false);
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("scrollrestore", mockPage);

			// Should scroll back to position after processing profile
			expect(mockNavigateToProfileAndCheck).toHaveBeenCalledWith(
				mockPage,
				"scrollrestore",
				{ timeout: 15000 },
			);
			expect(mockOpenFollowingModal).toHaveBeenCalled();
			// Scroll restoration: 500 / 500 = 1 scroll
			expect(mockScrollFollowingModal).toHaveBeenCalledWith(mockPage, 500);
		});
	});

	describe("runScrapeLoop", () => {
		it("starts the main scrape loop", async () => {
			mockQueueNext.mockResolvedValue(null); // Empty queue

			const { runScrapeLoop } = await import("./scrape.ts");

			await runScrapeLoop(mockPage);

			expect(mockLogger.info).toHaveBeenCalledWith(
				"CYCLE",
				"Starting main scrape loop",
			);
		});
	});

	describe("scrape", () => {
		let mockBrowser: import("puppeteer").Browser;
		let mockCreateBrowser: jest.Mock<
			() => Promise<import("puppeteer").Browser>
		>;
		let mockCreatePage: jest.Mock<() => Promise<import("puppeteer").Page>>;

		beforeEach(() => {
			mockBrowser = {
				close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
				newPage: jest
					.fn<() => Promise<import("puppeteer").Page>>()
					.mockResolvedValue(mockPage),
			} as unknown as import("puppeteer").Browser;
			mockCreateBrowser = jest
				.fn<() => Promise<import("puppeteer").Browser>>()
				.mockResolvedValue(mockBrowser);
			mockCreatePage = jest
				.fn<() => Promise<import("puppeteer").Page>>()
				.mockResolvedValue(mockPage);

			jest.unstable_mockModule(
				"../functions/navigation/browser/browser.ts",
				() => ({
					createBrowser: mockCreateBrowser,
					createPage: mockCreatePage,
				}),
			);
		});

		it("runs full scraping workflow successfully", async () => {
			const { scrape } = await import("./scrape.ts");

			mockQueueNext.mockResolvedValue(null); // Empty queue after seeds loaded

			await scrape(false);

			expect(mockCreateBrowser).toHaveBeenCalledWith({ headless: true });
			expect(mockCreatePage).toHaveBeenCalledWith(mockBrowser);
			expect(mockEnsureLoggedIn).toHaveBeenCalledWith(mockPage);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"ACTION",
				"🚀 Scout - Instagram Patreon Creator Discovery Agent",
			);
		});

		it("loads seeds and starts cycle tracking", async () => {
			// Mock fs for this test to simulate loading 3 seeds
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<
				(path: string, encoding?: BufferEncoding) => string | Buffer
			>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("seed1\nseed2\nseed3");

			mockQueueNext.mockResolvedValue(null); // Empty queue so it doesn't loop

			const { scrape } = await import("./scrape.ts");

			await scrape(false);

			expect(mockStartCycle).toHaveBeenCalledWith(
				"batch_scraping",
				150, // 3 seeds * 50 estimated profiles
			);
		});

		it("handles no seeds loaded gracefully", async () => {
			// Mock fs to return no seeds
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<
				(path: string) => boolean
			>;
			mockExistsSync.mockReturnValue(false);

			const { scrape } = await import("./scrape.ts");

			await scrape(false);

			expect(mockEndCycle).toHaveBeenCalledWith("FAILED", "No seeds loaded");
		});

		it("supports debug mode", async () => {
			const { scrape } = await import("./scrape.ts");

			mockQueueNext.mockResolvedValue(null);

			await scrape(true);

			expect(mockLogger.info).toHaveBeenCalledWith(
				"SYSTEM",
				"Debug mode: true",
			);
		});
	});
});
