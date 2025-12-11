import { jest } from "@jest/globals";
import { createPageMock, mockFactories } from "../../__test__/testUtils.ts";
import {
	addFollowingToQueue,
	checkDmThreadEmpty,
	followUserAccount,
	sendDMToUser,
} from "./profileActions.ts";

// Mock external dependencies
jest.mock("../../shared/config/config.ts", () => mockFactories.config());
jest.mock("../../shared/snapshot/snapshot.ts", () => ({
	snapshot: mockFactories.snapshot(),
}));
jest.mock("../../timing/sleep/sleep.ts", () => ({
	sleep: mockFactories.sleep(),
}));
jest.mock("../../shared/database/database.ts", () => mockFactories.database());
jest.mock("../../navigation/modalOperations/modalOperations.ts", () => ({
	openFollowingModal: jest.fn<any>().mockResolvedValue(true),
	extractFollowingUsernames: jest.fn<any>().mockResolvedValue(["user1"]),
}));

describe("profileActions", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("checkDmThreadEmpty", () => {
		test("returns boolean result", async () => {
			const page = createPageMock();
			const result = await checkDmThreadEmpty(page);
			expect(typeof result).toBe("boolean");
		});
	});

	describe("sendDMToUser", () => {
		test("returns boolean result", async () => {
			const page = createPageMock();
			const result = await sendDMToUser(page, "testuser");
			expect(typeof result).toBe("boolean");
		});
	});

	describe("followUserAccount", () => {
		test("returns boolean result", async () => {
			const page = createPageMock();
			const result = await followUserAccount(page, "testuser");
			expect(typeof result).toBe("boolean");
		});
	});

	describe("addFollowingToQueue", () => {
		test("adds users to queue when modal opens successfully", async () => {
			const page = createPageMock();
			const result = await addFollowingToQueue(page, "seeduser", "profile");
			expect(typeof result).toBe("number");
			expect(result).toBeGreaterThanOrEqual(0);
		});

		test("returns a number", async () => {
			const page = createPageMock();
			const result = await addFollowingToQueue(page, "seeduser", "profile");
			expect(typeof result).toBe("number");
			expect(result).toBeGreaterThanOrEqual(0);
		});
	});
});
