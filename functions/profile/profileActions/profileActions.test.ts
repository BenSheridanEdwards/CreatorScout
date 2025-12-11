import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import { createPageMock } from "../../__test__/testUtils.ts";

const configMock = { DM_MESSAGE: "Hello!" };
const snapshotMock = jest
	.fn<(page: Page, label: string) => Promise<string>>()
	.mockResolvedValue("shot");
const sleepMock = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const markDmSentMock = jest.fn<(username: string, path: string) => void>();
const markFollowedMock = jest.fn<(username: string) => void>();
const queueAddMock =
	jest.fn<(username: string, priority: number, source: string) => void>();
const wasVisitedMock = jest
	.fn<(username: string) => boolean>()
	.mockReturnValue(false);
const openFollowingModalMock = jest
	.fn<() => Promise<boolean>>()
	.mockResolvedValue(true);
const extractFollowingUsernamesMock = jest
	.fn<() => Promise<string[]>>()
	.mockResolvedValue(["user1", "user2"]);

jest.unstable_mockModule("../../shared/config/config.ts", () => configMock);
jest.unstable_mockModule("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: snapshotMock,
}));
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));
jest.unstable_mockModule("../../shared/database/database.ts", () => ({
	markDmSent: markDmSentMock,
	markFollowed: markFollowedMock,
	queueAdd: queueAddMock,
	wasVisited: wasVisitedMock,
}));
jest.unstable_mockModule(
	"../../navigation/modalOperations/modalOperations.ts",
	() => ({
		openFollowingModal: openFollowingModalMock,
		extractFollowingUsernames: extractFollowingUsernamesMock,
	}),
);

const {
	checkDmThreadEmpty,
	sendDMToUser,
	followUserAccount,
	addFollowingToQueue,
} = await import("./profileActions.ts");

describe("profileActions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		openFollowingModalMock.mockResolvedValue(true);
		extractFollowingUsernamesMock.mockResolvedValue(["user1", "user2"]);
		wasVisitedMock.mockReturnValue(false);
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
	});

	describe("sendDMToUser", () => {
		test("sends when conversation empty and records snapshot", async () => {
			const searchInput = {
				type: jest
					.fn<(text: string, opts?: unknown) => Promise<void>>()
					.mockResolvedValue(undefined),
			};
			const firstResult = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			};
			const messageInput = {
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			};
			const page = {
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				$: jest
					.fn<
						(
							selector: string,
						) => Promise<{
							type?: (text: string, opts?: unknown) => Promise<void>;
							click?: () => Promise<void>;
						} | null>
					>()
					.mockResolvedValueOnce(searchInput)
					.mockResolvedValueOnce(firstResult)
					.mockResolvedValueOnce(messageInput),
				$$: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]), // messages empty
				keyboard: {
					type: jest
						.fn<(text: string, opts?: object) => Promise<void>>()
						.mockResolvedValue(undefined),
					press: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
				},
			} as unknown as Page;

			const ok = await sendDMToUser(page, "user123");

			expect(ok).toBe(true);
			expect(snapshotMock).toHaveBeenCalledWith(page, "dm_user123");
			expect(markDmSentMock).toHaveBeenCalledWith("user123", "shot");
		});

		test("skips when conversation already exists", async () => {
			const page = {
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
				$$: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{}]), // messages present
			} as unknown as Page;

			const ok = await sendDMToUser(page, "user123");

			expect(ok).toBe(false);
			expect(markDmSentMock).not.toHaveBeenCalled();
		});
	});

	describe("followUserAccount", () => {
		test("marks followed when button detected", async () => {
			const page = {
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
				click: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			} as unknown as Page;

			const ok = await followUserAccount(page, "user123");

			expect(ok).toBe(true);
			expect(markFollowedMock).toHaveBeenCalledWith("user123");
		});

		test("returns false when no follow button", async () => {
			const page = {
				goto: jest
					.fn<(url: string, opts?: object) => Promise<void>>()
					.mockResolvedValue(undefined),
				evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
				click: jest.fn<() => Promise<void>>(),
			} as unknown as Page;

			const ok = await followUserAccount(page, "user123");

			expect(ok).toBe(false);
			expect(markFollowedMock).not.toHaveBeenCalled();
		});
	});

	describe("addFollowingToQueue", () => {
		test("adds new users and skips visited", async () => {
			wasVisitedMock.mockImplementation((u) => u === "user1"); // skip first
			const page = createPageMock({
				keyboard: {
					press: jest
						.fn<(key: string) => Promise<void>>()
						.mockResolvedValue(undefined),
				},
			});

			const added = await addFollowingToQueue(
				page as unknown as Page,
				"seeduser",
				"source-tag",
				5,
			);

			expect(openFollowingModalMock).toHaveBeenCalled();
			expect(extractFollowingUsernamesMock).toHaveBeenCalledWith(page, 5);
			expect(queueAddMock).toHaveBeenCalledWith("user2", 50, "source-tag");
			expect(added).toBe(1);
		});

		test("returns 0 when modal fails", async () => {
			openFollowingModalMock.mockResolvedValue(false);
			const page = createPageMock();

			const added = await addFollowingToQueue(
				page as unknown as Page,
				"seed",
				"source",
			);

			expect(added).toBe(0);
			expect(extractFollowingUsernamesMock).not.toHaveBeenCalled();
		});
	});
});
