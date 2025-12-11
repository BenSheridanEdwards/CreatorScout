/**
 * Unit tests for scrape.ts functions
 */
import { jest } from "@jest/globals";

// Mock all the dependencies
const mockMouseWiggle = jest.fn<any>().mockResolvedValue(undefined);
const mockNavigateToProfileAndCheck = jest.fn();
const mockAnalyzeProfileBasic = jest.fn();
const mockAnalyzeLinkWithVision = jest.fn();
const mockSnapshot = jest.fn();
const mockMarkAsCreator = jest.fn();
const mockSendDMToUser = jest.fn();
const mockFollowUserAccount = jest.fn();
const mockAddFollowingToQueue = jest.fn();
const mockGetDelay = jest.fn();
const mockSleep = jest.fn();
const mockEnsureLoggedIn = jest.fn();
const mockOpenFollowingModal = jest.fn();
const mockExtractFollowingUsernames = jest.fn();
const mockScrollFollowingModal = jest.fn();
const mockWasVisited = jest.fn();
const mockMarkVisited = jest.fn();
const mockGetScrollIndex = jest.fn();
const mockUpdateScrollIndex = jest.fn();
const mockGetStats = jest.fn();
const mockInitDb = jest.fn();
const mockQueueAdd = jest.fn();
const mockQueueCount = jest.fn();
const mockQueueNext = jest.fn();
const mockWasDmSent = jest.fn();
const mockWasFollowed = jest.fn();
const mockGetDailyMetrics = jest.fn();
const mockCreateLogger = jest.fn();
const mockGetGlobalMetricsTracker = jest.fn();

// Mock the modules
jest.unstable_mockModule("node:fs", () => ({
	existsSync: jest.fn(),
	readFileSync: jest.fn(),
	mkdirSync: jest.fn(),
	writeFileSync: jest.fn(),
	unlinkSync: jest.fn(),
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
		analyzeProfileBasic: mockAnalyzeProfileBasic,
		analyzeLinkWithVision: mockAnalyzeLinkWithVision,
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
}));

jest.unstable_mockModule("../functions/shared/metrics/metrics.ts", () => ({
	getGlobalMetricsTracker: mockGetGlobalMetricsTracker,
	startTimer: jest.fn(() => ({
		end: jest.fn(() => 1.5),
	})),
}));

describe("scrape.ts", () => {
	let mockLogger: any;
	let mockPage: any;

	beforeEach(() => {
		jest.clearAllMocks();

		mockLogger = {
			info: jest.fn<any>(),
			debug: jest.fn<any>(),
			warn: jest.fn<any>(),
			error: jest.fn<any>(),
			errorWithScreenshot: jest.fn<any>(),
		};
		mockCreateLogger.mockReturnValue(mockLogger);

		mockPage = {
			keyboard: {
				press: jest.fn<any>().mockResolvedValue(undefined),
			},
		};

		// Set up default mock returns
		mockNavigateToProfileAndCheck.mockResolvedValue({
			notFound: false,
			isPrivate: false,
		});
		mockAnalyzeProfileBasic.mockResolvedValue({
			bio: "Test bio with content",
			bioScore: 45,
			linkFromBio: null,
			isLikely: true,
		});
		mockGetDelay.mockReturnValue([1, 3]);
		mockWasVisited.mockReturnValue(false);
		mockGetScrollIndex.mockReturnValue(0);
		mockGetStats.mockReturnValue({
			total_visited: 0,
			confirmed_creators: 0,
			dms_sent: 0,
			queue_size: 0,
		});
		mockQueueCount.mockReturnValue(0);
		mockQueueNext.mockReturnValue(null);
		mockWasDmSent.mockReturnValue(false);
		mockWasFollowed.mockReturnValue(false);

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
		});
	});

	describe("loadSeeds", () => {
		it("loads seeds from file", async () => {
			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds();

			// Should load the seeds from seeds.txt
			expect(typeof count).toBe("number");
		});

		it("returns 0 when file does not exist", async () => {
			// Mock fs for this test
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(false);

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("nonexistent.txt");

			expect(count).toBe(0);
			expect(mockExistsSync).toHaveBeenCalledWith("nonexistent.txt");
		});

		it("returns 0 for empty file", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("");

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("empty.txt");

			expect(count).toBe(0);
			expect(mockExistsSync).toHaveBeenCalledWith("empty.txt");
			expect(mockReadFileSync).toHaveBeenCalledWith("empty.txt", "utf-8");
		});

		it("loads valid usernames and skips comments and empty lines", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(`# This is a comment
user1
   user2

# Another comment
user3
`);

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("test.txt");

			expect(count).toBe(3);
			expect(mockQueueAdd).toHaveBeenCalledTimes(3);
			expect(mockQueueAdd).toHaveBeenCalledWith("user1", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("user2", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("user3", 100, "seed");
		});

		it("trims whitespace and converts to lowercase", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("  USERNAME  \n  UserName2  ");

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("whitespace.txt");

			expect(count).toBe(2);
			expect(mockQueueAdd).toHaveBeenCalledWith("username", 100, "seed");
			expect(mockQueueAdd).toHaveBeenCalledWith("username2", 100, "seed");
		});

		it("skips lines starting with # and empty lines", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(`
# comment
   # indented comment
user1

user2
# another comment
`);

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("comments.txt");

			expect(count).toBe(2);
			expect(mockQueueAdd).toHaveBeenCalledTimes(2);
		});

		it("handles custom file path", async () => {
			const fs = await import("node:fs");
			const mockExistsSync = fs.existsSync as jest.MockedFunction<any>;
			const mockReadFileSync = fs.readFileSync as jest.MockedFunction<any>;
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("customuser");

			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds("custom/path/seeds.txt");

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

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 30, // Below threshold to skip creator logic
				linkFromBio: null,
				isLikely: false,
			});

			await processProfile("testuser", mockPage, "test_source", mockLogger);

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
			});

			await processProfile("privateuser", mockPage, "test_source", mockLogger);

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
			});

			await processProfile("notfounduser", mockPage, "test_source", mockLogger);

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

			mockWasVisited.mockReturnValue(true);

			await processProfile("visiteduser", mockPage, "test_source", mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith(
				"PROFILE",
				"Already visited, skipping @visiteduser",
			);
			expect(mockNavigateToProfileAndCheck).not.toHaveBeenCalled();
		});

		it("confirms creator with high bio score (70+)", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio with patreon",
				bioScore: 75,
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile(
				"highscoreuser",
				mockPage,
				"test_source",
				mockLogger,
			);

			expect(mockLogger.info).toHaveBeenCalledWith(
				"ANALYSIS",
				"High bio score (75) - likely creator without linktree",
			);
			expect(mockMarkAsCreator).toHaveBeenCalledWith("highscoreuser", 75, null);
		});

		it("confirms creator with vision analysis", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				linkFromBio: "https://linktr.ee/test",
				isLikely: true,
			});

			mockAnalyzeLinkWithVision.mockResolvedValue({
				isCreator: true,
				confidence: 85,
				indicators: ["subscription", "exclusive content"],
			});

			await processProfile("visionuser", mockPage, "test_source", mockLogger);

			expect(mockAnalyzeLinkWithVision).toHaveBeenCalledWith(
				mockPage,
				"https://linktr.ee/test",
				"visionuser",
				"linktree",
			);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"ANALYSIS",
				"Vision confirmed creator (confidence: 85%) - Indicators: subscription, exclusive content",
			);
		});

		it("sends DM and follows confirmed creators", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile("creatoruser", mockPage, "test_source", mockLogger);

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

			await processProfile("erroruser", mockPage, "test_source", mockLogger);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Failed to load profile @erroruser: Network timeout",
				mockPage,
				"profile_load_erroruser",
			);
		});

		it("handles DM sending errors", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(false); // DM fails
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(false);

			await processProfile("dmerror", mockPage, "test_source", mockLogger);

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "dmerror");
			// Should still try to follow even if DM fails
			expect(mockFollowUserAccount).toHaveBeenCalledWith(mockPage, "dmerror");
		});

		it("handles follow action errors", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(true); // DM succeeds
			mockFollowUserAccount.mockResolvedValue(false); // Follow fails
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(false);

			await processProfile("followerror", mockPage, "test_source", mockLogger);

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

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});
			mockSendDMToUser.mockResolvedValue(true); // DM succeeds
			mockFollowUserAccount.mockResolvedValue(true); // Follow succeeds
			mockAddFollowingToQueue.mockResolvedValue(0); // Queue addition "fails" (returns 0)
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(false);

			await processProfile("queueerror", mockPage, "test_source", mockLogger);

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "queueerror");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"queueerror",
			);
			expect(mockMarkAsCreator).toHaveBeenCalledWith("queueerror", 90, null);
			expect(mockAddFollowingToQueue).toHaveBeenCalled();
		});

		it("records metrics for profile visits", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
				recordCreatorFound: jest.fn(),
				recordVisionApiCall: jest.fn(),
				recordDMSent: jest.fn(),
				recordFollowCompleted: jest.fn(),
				recordError: jest.fn(),
			};
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio with content",
				bioScore: 45,
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile(
				"metricsuser",
				mockPage,
				"following_of_source",
				mockLogger,
				mockMetricsTracker,
			);

			expect(mockMetricsTracker.recordProfileVisit).toHaveBeenCalledWith(
				"metricsuser",
				expect.any(Number), // processing time
				"following_of_source",
				2, // discovery depth (following_of_ has 2 underscores)
				"source", // source profile
				[], // contentCategories will be filled later if creator found
				0, // visionApiCalls will be updated later
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
			};
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 80,
				linkFromBio: null,
				isLikely: true,
			});
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(false);

			await processProfile(
				"creatoruser",
				mockPage,
				"test_source",
				mockLogger,
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
			};
			mockGetGlobalMetricsTracker.mockReturnValue(mockMetricsTracker);

			mockNavigateToProfileAndCheck.mockRejectedValue(
				new Error("Navigation failed"),
			);

			await processProfile(
				"erroruser",
				mockPage,
				"test_source",
				mockLogger,
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

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				linkFromBio: "https://linktr.ee/test",
				isLikely: true,
			});

			mockAnalyzeLinkWithVision.mockResolvedValue({
				isCreator: false,
				confidence: 30,
				indicators: [],
			});

			await processProfile(
				"novisioncreator",
				mockPage,
				"test_source",
				mockLogger,
			);

			expect(mockAnalyzeLinkWithVision).toHaveBeenCalledWith(
				mockPage,
				"https://linktr.ee/test",
				"novisioncreator",
				"linktree",
			);
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"ANALYSIS",
				"Vision did not confirm creator for @novisioncreator - Confidence: 30%",
			);
			expect(mockMarkAsCreator).not.toHaveBeenCalled();
			expect(mockSendDMToUser).not.toHaveBeenCalled();
		});

		it("skips DM if already sent", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});
			mockWasDmSent.mockReturnValue(true);
			mockWasFollowed.mockReturnValue(false);

			await processProfile("alreadydm", mockPage, "test_source", mockLogger);

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

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 90,
				linkFromBio: null,
				isLikely: true,
			});
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(true);

			await processProfile(
				"alreadyfollow",
				mockPage,
				"test_source",
				mockLogger,
			);

			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "alreadyfollow");
			expect(mockFollowUserAccount).not.toHaveBeenCalled();
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"ACTION",
				"Already following @alreadyfollow",
			);
		});

		it("handles low bio score that doesn't meet confidence threshold", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 35, // Below CONFIDENCE_THRESHOLD (50)
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile("lowscore", mockPage, "test_source", mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith(
				"ANALYSIS",
				"Not confirmed (confidence: 35% < 50%)",
			);
			expect(mockMarkAsCreator).not.toHaveBeenCalled();
			expect(mockSendDMToUser).not.toHaveBeenCalled();
			expect(mockFollowUserAccount).not.toHaveBeenCalled();
		});

		it("handles bio score between 40-70 that meets threshold", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 60, // Above CONFIDENCE_THRESHOLD (40) but below 70
				linkFromBio: null,
				isLikely: true,
			});
			mockWasDmSent.mockReturnValue(false);
			mockWasFollowed.mockReturnValue(false);

			await processProfile("mediumscore", mockPage, "test_source", mockLogger);

			expect(mockMarkAsCreator).toHaveBeenCalledWith("mediumscore", 60, null);
			expect(mockSendDMToUser).toHaveBeenCalledWith(mockPage, "mediumscore");
			expect(mockFollowUserAccount).toHaveBeenCalledWith(
				mockPage,
				"mediumscore",
			);
		});

		it("takes screenshot for creators with links", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 50,
				linkFromBio: "https://linktr.ee/creator",
				isLikely: true,
			});

			mockAnalyzeLinkWithVision.mockResolvedValue({
				isCreator: true,
				confidence: 85,
				indicators: ["subscription"],
			});

			mockSnapshot.mockResolvedValue("/path/to/screenshot.png");

			await processProfile(
				"screenshotuser",
				mockPage,
				"test_source",
				mockLogger,
			);

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

		it("parses discovery depth correctly from source", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
			};

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 45,
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile(
				"depthuser",
				mockPage,
				"following_of_following_of_seeduser", // 3 underscores = depth 4
				mockLogger,
				mockMetricsTracker,
			);

			expect(mockMetricsTracker.recordProfileVisit).toHaveBeenCalledWith(
				"depthuser",
				expect.any(Number),
				"following_of_following_of_seeduser",
				4, // depth
				"seeduser", // source profile
				[],
				0,
			);
		});

		it("handles empty source for discovery depth", async () => {
			const { processProfile } = await import("./scrape.ts");

			const mockMetricsTracker = {
				recordProfileVisit: jest.fn(),
			};

			mockAnalyzeProfileBasic.mockResolvedValue({
				bio: "Test bio",
				bioScore: 45,
				linkFromBio: null,
				isLikely: true,
			});

			await processProfile(
				"nosourceuser",
				mockPage,
				"seed", // no underscores
				mockLogger,
				mockMetricsTracker,
			);

			expect(mockMetricsTracker.recordProfileVisit).toHaveBeenCalledWith(
				"nosourceuser",
				expect.any(Number),
				"seed",
				0, // depth (0 underscores in "seed")
				undefined, // no source profile
				[],
				0,
			);
		});
	});

	describe("processFollowingList", () => {
		beforeEach(() => {
			mockExtractFollowingUsernames.mockResolvedValue(["user1", "user2"]);
			mockOpenFollowingModal.mockResolvedValue(true);
			mockWasVisited.mockReturnValue(false);
		});

		it("stops after consecutive all-visited batches", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			// All users already visited
			mockWasVisited.mockReturnValue(true);
			mockExtractFollowingUsernames.mockResolvedValue(["user1", "user2"]);

			await processFollowingList("seeduser", mockPage, mockLogger);

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
				return callCount <= 2; // First 2 users visited, others not
			});

			mockExtractFollowingUsernames
				.mockResolvedValueOnce(["user1", "user2"]) // batch 1: all visited
				.mockResolvedValueOnce(["user3", "user4"]); // batch 2: new users

			await processFollowingList("seeduser", mockPage, mockLogger);

			// Should process user3 and user4
			expect(mockWasVisited).toHaveBeenCalledWith("user3");
			expect(mockWasVisited).toHaveBeenCalledWith("user4");
		});

		it("closes modal before profile visits and reopens", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockWasVisited.mockReturnValue(false); // New users
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("seeduser", mockPage, mockLogger);

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
			});

			await processFollowingList("notfoundseed", mockPage, mockLogger);

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
			});

			await processFollowingList("privateseed", mockPage, mockLogger);

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

			await processFollowingList("errorseed", mockPage, mockLogger);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Failed to load seed profile @errorseed: Navigation failed",
				mockPage,
				"seed_profile_load_errorseed",
			);
		});

		it("handles modal opening failure", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockOpenFollowingModal.mockResolvedValue(false);

			await processFollowingList("modalerror", mockPage, mockLogger);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Could not open following modal for @modalerror",
				mockPage,
				"modal_open_modalerror",
			);
		});

		it("handles scroll index restoration", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockGetScrollIndex.mockReturnValue(1000); // Already scrolled
			mockWasVisited.mockReturnValue(false);
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("scrollseed", mockPage, mockLogger);

			// Initial scroll to position: Math.floor(1000/500) = 2 scrolls
			// After processing profile, scroll back: Math.floor(1000/500) = 2 scrolls
			// Total: 4 scrolls
			expect(mockScrollFollowingModal).toHaveBeenCalledTimes(4);
		});

		it("handles scroll restoration after profile processing", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockGetScrollIndex.mockReturnValue(500);
			mockWasVisited.mockReturnValue(false);
			mockExtractFollowingUsernames.mockResolvedValue(["user1"]);

			await processFollowingList("scrollrestore", mockPage, mockLogger);

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

		it("handles ensureLoggedIn errors", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			mockEnsureLoggedIn.mockRejectedValue(new Error("Login failed"));

			await processFollowingList("loginerror", mockPage, mockLogger);

			expect(mockLogger.errorWithScreenshot).toHaveBeenCalledWith(
				"ERROR",
				"Failed to load seed profile @loginerror: Login failed",
				mockPage,
				"seed_profile_load_loginerror",
			);
		});
	});
});
