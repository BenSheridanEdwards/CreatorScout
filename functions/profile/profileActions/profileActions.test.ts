import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";

// Mock dependencies with typed mock functions defined externally
const mockOpenFollowingModal = jest.fn<() => Promise<boolean>>();
const mockExtractFollowingUsernames = jest.fn<() => Promise<string[]>>();
const mockRecordActivity = jest.fn();
const mockMarkDmSent = jest.fn<() => Promise<void>>();
const mockMarkFollowed = jest.fn<() => Promise<void>>();
const mockQueueAdd = jest.fn<() => Promise<void>>();
const mockWasVisited = jest.fn<() => Promise<boolean>>();
const mockSaveScreenshot = jest.fn<() => Promise<string>>();
const mockSnapshot = jest.fn<() => Promise<string>>();
const mockMediumDelay = jest.fn<() => Promise<void>>();
const mockShortDelay = jest.fn<() => Promise<void>>();
const mockSleep = jest.fn<() => Promise<void>>();
const mockFindMessageInput = jest.fn<() => Promise<string | null>>();
const mockTypeMessage = jest.fn<() => Promise<boolean>>();
const mockClickMessageButton = jest.fn<() => Promise<void>>();
const mockFindMessageButton =
	jest.fn<() => Promise<{ selector: string } | null>>();
const mockNavigateToDmThread = jest.fn<() => Promise<void>>();
const mockNavigateToProfile = jest.fn<() => Promise<void>>();
const mockScrollToButtonIfNeeded = jest.fn();
const mockSimulateNaturalBehavior = jest.fn<() => Promise<void>>();
const mockSendMessage = jest.fn<() => Promise<boolean>>();
const mockVerifyDmSent = jest.fn<() => Promise<{ proofPath: string }>>();
const mockClickFollowButton = jest.fn<() => Promise<boolean>>();
const mockDetectFollowState = jest.fn<() => Promise<string>>();
const mockVerifyFollowSucceeded = jest.fn<() => Promise<string>>();
const mockGetCurrentUsername = jest.fn<() => Promise<string | null>>();

jest.unstable_mockModule(
	"../../navigation/modalOperations/modalOperations.ts",
	() => ({
		openFollowingModal: mockOpenFollowingModal,
		extractFollowingUsernames: mockExtractFollowingUsernames,
	}),
);

jest.unstable_mockModule("../../shared/dashboard/dashboard.ts", () => ({
	recordActivity: mockRecordActivity,
}));

jest.unstable_mockModule("../../shared/database/database.ts", () => ({
	markDmSent: mockMarkDmSent,
	markFollowed: mockMarkFollowed,
	queueAdd: mockQueueAdd,
	wasVisited: mockWasVisited,
}));

jest.unstable_mockModule("../../shared/logger/logger.ts", () => ({
	createLogger: jest.fn(() => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

jest.unstable_mockModule("../../shared/snapshot/snapshot.ts", () => ({
	saveScreenshot: mockSaveScreenshot,
	snapshot: mockSnapshot,
}));

jest.unstable_mockModule("../../timing/humanize/humanize.ts", () => ({
	mediumDelay: mockMediumDelay,
	shortDelay: mockShortDelay,
}));

jest.unstable_mockModule("../../shared/config/config.ts", () => ({
	MIN_SECONDS_BETWEEN_DMS: 0,
	MAX_QUEUE_ADDS_PER_CYCLE: 100,
}));

jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: mockSleep,
}));

jest.unstable_mockModule("./dmInput.ts", () => ({
	findMessageInput: mockFindMessageInput,
	typeMessage: mockTypeMessage,
}));

jest.unstable_mockModule("./dmNavigation.ts", () => ({
	clickMessageButton: mockClickMessageButton,
	findMessageButton: mockFindMessageButton,
	navigateToDmThread: mockNavigateToDmThread,
	navigateToProfile: mockNavigateToProfile,
	scrollToButtonIfNeeded: mockScrollToButtonIfNeeded,
	simulateNaturalBehavior: mockSimulateNaturalBehavior,
}));

jest.unstable_mockModule("./dmSending.ts", () => ({
	sendMessage: mockSendMessage,
	verifyDmSent: mockVerifyDmSent,
}));

jest.unstable_mockModule("./follow.ts", () => ({
	clickFollowButton: mockClickFollowButton,
	detectFollowState: mockDetectFollowState,
	verifyFollowSucceeded: mockVerifyFollowSucceeded,
}));

jest.unstable_mockModule("../../shared/username/getCurrentUsername.ts", () => ({
	getCurrentUsername: mockGetCurrentUsername,
}));

// Import after mocks
const {
	sendDMToUser,
	followUserAccount,
	addFollowingToQueue,
	checkDmThreadEmpty,
	resetQueueAddCounter,
	getQueueAddCount,
} = await import("./profileActions.ts");

describe("profileActions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		resetQueueAddCounter();

		// Set default mock implementations
		mockOpenFollowingModal.mockResolvedValue(true);
		mockExtractFollowingUsernames.mockResolvedValue([]);
		mockMarkDmSent.mockResolvedValue(undefined);
		mockMarkFollowed.mockResolvedValue(undefined);
		mockQueueAdd.mockResolvedValue(undefined);
		mockWasVisited.mockResolvedValue(false);
		mockSaveScreenshot.mockResolvedValue("/path/to/screenshot.png");
		mockSnapshot.mockResolvedValue("/path/to/snapshot.png");
		mockMediumDelay.mockResolvedValue(undefined);
		mockShortDelay.mockResolvedValue(undefined);
		mockSleep.mockResolvedValue(undefined);
		mockFindMessageInput.mockResolvedValue("textarea");
		mockTypeMessage.mockResolvedValue(true);
		mockClickMessageButton.mockResolvedValue(undefined);
		mockFindMessageButton.mockResolvedValue({ selector: "button" });
		mockNavigateToDmThread.mockResolvedValue(undefined);
		mockNavigateToProfile.mockResolvedValue(undefined);
		mockScrollToButtonIfNeeded.mockImplementation((_, info) =>
			Promise.resolve(info),
		);
		mockSimulateNaturalBehavior.mockResolvedValue(undefined);
		mockSendMessage.mockResolvedValue(true);
		mockVerifyDmSent.mockResolvedValue({ proofPath: "/proof.png" });
		mockClickFollowButton.mockResolvedValue(true);
		mockDetectFollowState.mockResolvedValue("can_follow");
		mockVerifyFollowSucceeded.mockResolvedValue("following");
		mockGetCurrentUsername.mockResolvedValue("testaccount");
	});

	describe("checkDmThreadEmpty", () => {
		it("returns true when thread has no messages", async () => {
			const page = createPageMock({
				$$: jest.fn(() => Promise.resolve([])),
			});

			const result = await checkDmThreadEmpty(page);
			expect(result).toBe(true);
		});

		it("returns true when thread has only header element", async () => {
			const page = createPageMock({
				$$: jest.fn(() => Promise.resolve([{}])),
			});

			const result = await checkDmThreadEmpty(page);
			expect(result).toBe(true);
		});

		it("returns false when thread has messages", async () => {
			const page = createPageMock({
				$$: jest.fn(() => Promise.resolve([{}, {}, {}])),
			});

			const result = await checkDmThreadEmpty(page);
			expect(result).toBe(false);
		});
	});

	describe("sendDMToUser", () => {
		it("navigates to profile and sends DM successfully", async () => {
			const page = createPageWithElementMock();
			(page.$$ as jest.Mock).mockImplementation(() => Promise.resolve([]));

			const result = await sendDMToUser(page, "targetuser");

			expect(mockNavigateToProfile).toHaveBeenCalledWith(page, "targetuser");
			expect(mockSendMessage).toHaveBeenCalled();
			expect(mockMarkDmSent).toHaveBeenCalledWith(
				"targetuser",
				"/proof.png",
				"testaccount",
			);
			expect(result).toBe(true);
		});

		it("skips navigation when skipNavigation is true", async () => {
			const page = createPageWithElementMock();
			(page.$$ as jest.Mock).mockImplementation(() => Promise.resolve([]));

			await sendDMToUser(page, "targetuser", true);

			expect(mockNavigateToProfile).not.toHaveBeenCalled();
		});

		it("returns false when message input not found", async () => {
			const page = createPageWithElementMock();
			(page.$$ as jest.Mock).mockImplementation(() => Promise.resolve([]));
			mockFindMessageInput.mockImplementation(() => Promise.resolve(null));

			const result = await sendDMToUser(page, "targetuser");

			expect(result).toBe(false);
		});

		it("returns false when DM thread is not empty", async () => {
			const page = createPageMock({
				$$: jest.fn(() => Promise.resolve([{}, {}, {}])),
			});

			const result = await sendDMToUser(page, "targetuser");

			expect(mockSendMessage).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});
	});

	describe("followUserAccount", () => {
		it("follows user successfully when not already following", async () => {
			const page = createPageWithElementMock({
				url: jest.fn(() => "https://instagram.com/targetuser/"),
			});

			const result = await followUserAccount(page, "targetuser");

			expect(mockNavigateToProfile).toHaveBeenCalledWith(page, "targetuser");
			expect(mockDetectFollowState).toHaveBeenCalled();
			expect(mockClickFollowButton).toHaveBeenCalled();
			expect(mockVerifyFollowSucceeded).toHaveBeenCalled();
			expect(mockMarkFollowed).toHaveBeenCalledWith("targetuser");
			expect(result).toBe(true);
		});

		it("returns false when already following", async () => {
			const page = createPageWithElementMock();
			mockDetectFollowState.mockImplementation(() =>
				Promise.resolve("already_following"),
			);

			const result = await followUserAccount(page, "targetuser");

			expect(mockClickFollowButton).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("returns false when follow request already sent", async () => {
			const page = createPageWithElementMock();
			mockDetectFollowState.mockImplementation(() =>
				Promise.resolve("request_sent"),
			);

			const result = await followUserAccount(page, "targetuser");

			expect(mockClickFollowButton).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});

		it("skips navigation when skipNavigation is true", async () => {
			const page = createPageWithElementMock({
				url: jest.fn(() => "https://instagram.com/targetuser/"),
			});

			await followUserAccount(page, "targetuser", true);

			expect(mockNavigateToProfile).not.toHaveBeenCalled();
		});
	});

	describe("addFollowingToQueue", () => {
		it("adds following users to queue", async () => {
			const page = createPageMock();
			mockOpenFollowingModal.mockImplementation(() => Promise.resolve(true));
			mockExtractFollowingUsernames.mockImplementation(() =>
				Promise.resolve(["user1", "user2", "user3"]),
			);

			const result = await addFollowingToQueue(page, "targetuser", "source");

			expect(mockOpenFollowingModal).toHaveBeenCalledWith(page);
			expect(mockExtractFollowingUsernames).toHaveBeenCalledWith(page, 20);
			expect(mockQueueAdd).toHaveBeenCalledTimes(3);
			expect(result).toBe(3);
		});

		it("returns 0 when modal fails to open", async () => {
			const page = createPageMock();
			mockOpenFollowingModal.mockImplementation(() => Promise.resolve(false));

			const result = await addFollowingToQueue(page, "targetuser", "source");

			expect(mockExtractFollowingUsernames).not.toHaveBeenCalled();
			expect(result).toBe(0);
		});

		it("skips already visited users", async () => {
			const page = createPageMock();
			mockOpenFollowingModal.mockImplementation(() => Promise.resolve(true));
			mockExtractFollowingUsernames.mockImplementation(() =>
				Promise.resolve(["user1", "user2"]),
			);
			let wasVisitedCallCount = 0;
			mockWasVisited.mockImplementation(() => {
				wasVisitedCallCount++;
				return Promise.resolve(wasVisitedCallCount === 1);
			});

			const result = await addFollowingToQueue(page, "targetuser", "source");

			expect(mockQueueAdd).toHaveBeenCalledTimes(1);
			expect(result).toBe(1);
		});
	});

	describe("queue counter management", () => {
		it("tracks queue adds across calls", async () => {
			const page = createPageMock();
			mockOpenFollowingModal.mockImplementation(() => Promise.resolve(true));
			mockExtractFollowingUsernames.mockImplementation(() =>
				Promise.resolve(["user1"]),
			);

			expect(getQueueAddCount()).toBe(0);

			await addFollowingToQueue(page, "target", "source");
			expect(getQueueAddCount()).toBe(1);

			await addFollowingToQueue(page, "target", "source");
			expect(getQueueAddCount()).toBe(2);
		});

		it("resets counter properly", async () => {
			const page = createPageMock();
			mockOpenFollowingModal.mockImplementation(() => Promise.resolve(true));
			mockExtractFollowingUsernames.mockImplementation(() =>
				Promise.resolve(["user1"]),
			);

			await addFollowingToQueue(page, "target", "source");
			expect(getQueueAddCount()).toBe(1);

			resetQueueAddCounter();
			expect(getQueueAddCount()).toBe(0);
		});
	});
});
