/**
 * Unit tests for scrape.ts functions
 */
import { jest } from "@jest/globals";

// Mock all the dependencies
const mockMouseWiggle = jest.fn().mockResolvedValue(undefined);
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
const mockCreateLogger = jest.fn();

// Mock the modules
jest.unstable_mockModule("../functions/timing/humanize/humanize.ts", () => ({
	mouseWiggle: mockMouseWiggle,
	getDelay: mockGetDelay,
}));

jest.unstable_mockModule("../functions/navigation/profileNavigation/profileNavigation.ts", () => ({
	navigateToProfileAndCheck: mockNavigateToProfileAndCheck,
	ensureLoggedIn: mockEnsureLoggedIn,
}));

jest.unstable_mockModule("../functions/profile/profileAnalysis/profileAnalysis.ts", () => ({
	analyzeProfileBasic: mockAnalyzeProfileBasic,
	analyzeLinkWithVision: mockAnalyzeLinkWithVision,
}));

jest.unstable_mockModule("../functions/shared/snapshot/snapshot.ts", () => ({
	snapshot: mockSnapshot,
}));

jest.unstable_mockModule("../functions/shared/database/database.ts", () => ({
	markAsCreator: mockMarkAsCreator,
	markVisited: mockMarkVisited,
	wasVisited: mockWasVisited,
}));

jest.unstable_mockModule("../functions/profile/profileActions/profileActions.ts", () => ({
	sendDMToUser: mockSendDMToUser,
	followUserAccount: mockFollowUserAccount,
	addFollowingToQueue: mockAddFollowingToQueue,
}));

jest.unstable_mockModule("../functions/timing/sleep/sleep.ts", () => ({
	sleep: mockSleep,
}));

jest.unstable_mockModule("../functions/navigation/modalOperations/modalOperations.ts", () => ({
	openFollowingModal: mockOpenFollowingModal,
	extractFollowingUsernames: mockExtractFollowingUsernames,
	scrollFollowingModal: mockScrollFollowingModal,
}));

jest.unstable_mockModule("../functions/shared/logger/logger.ts", () => ({
	createLogger: mockCreateLogger,
}));

describe("scrape.ts", () => {
	let mockLogger: any;
	let mockPage: any;

	beforeEach(() => {
		jest.clearAllMocks();

		mockLogger = {
			info: jest.fn(),
			debug: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		};
		mockCreateLogger.mockReturnValue(mockLogger);

		mockPage = {
			keyboard: {
				press: jest.fn().mockResolvedValue(undefined),
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

			expect(mockNavigateToProfileAndCheck).toHaveBeenCalledWith(mockPage, "testuser", {
				timeout: 15000,
			});
			expect(mockMouseWiggle).toHaveBeenCalledWith(mockPage);
		});

		it("handles private accounts", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: false,
				isPrivate: true,
			});

			await processProfile("privateuser", mockPage, "test_source", mockLogger);

			expect(mockLogger.warn).toHaveBeenCalledWith("PROFILE", "Profile is private: @privateuser");
			expect(mockMarkVisited).toHaveBeenCalledWith("privateuser", undefined, undefined, 0);
		});

		it("handles not found profiles", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockNavigateToProfileAndCheck.mockResolvedValue({
				notFound: true,
				isPrivate: false,
			});

			await processProfile("notfounduser", mockPage, "test_source", mockLogger);

			expect(mockLogger.warn).toHaveBeenCalledWith("PROFILE", "Profile not found: @notfounduser");
			expect(mockMarkVisited).toHaveBeenCalledWith("notfounduser", undefined, undefined, 0);
		});

		it("skips already visited profiles", async () => {
			const { processProfile } = await import("./scrape.ts");

			mockWasVisited.mockReturnValue(true);

			await processProfile("visiteduser", mockPage, "test_source", mockLogger);

			expect(mockLogger.debug).toHaveBeenCalledWith("PROFILE", "Already visited, skipping @visiteduser");
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

			await processProfile("highscoreuser", mockPage, "test_source", mockLogger);

			expect(mockLogger.info).toHaveBeenCalledWith("ANALYSIS", "High bio score (75) - likely creator without linktree");
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
				"linktree"
			);
			expect(mockLogger.info).toHaveBeenCalledWith(
				"ANALYSIS",
				"Vision confirmed creator (confidence: 85%) - Indicators: subscription, exclusive content"
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
			expect(mockFollowUserAccount).toHaveBeenCalledWith(mockPage, "creatoruser");
			expect(mockAddFollowingToQueue).toHaveBeenCalled();
		});
	});

	describe("processFollowingList", () => {
		beforeEach(() => {
			mockExtractFollowingUsernames.mockResolvedValue(["user1", "user2"]);
			mockOpenFollowingModal.mockResolvedValue(true);
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
				"All profiles in batch already visited (3/3)"
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
			expect(mockNavigateToProfileAndCheck).toHaveBeenCalledWith(mockPage, "seeduser", {
				timeout: 15000,
			});
			expect(mockOpenFollowingModal).toHaveBeenCalled();
		});

		it("stops after processing 50 profiles", async () => {
			const { processFollowingList } = await import("./scrape.ts");

			// Simulate processing 50 profiles
			mockWasVisited.mockReturnValue(false);
			mockExtractFollowingUsernames.mockResolvedValue(Array(10).fill("user"));

			await processFollowingList("seeduser", mockPage, mockLogger);

			expect(mockLogger.warn).toHaveBeenCalledWith("PROFILE", "Processed 50 profiles, pausing...");
		});
	});

	describe("loadSeeds", () => {
		it("loads seeds from file", async () => {
			const { loadSeeds } = await import("./scrape.ts");

			const count = loadSeeds();

			// Should load the seeds from seeds.txt
			expect(typeof count).toBe("number");
		});
	});
});