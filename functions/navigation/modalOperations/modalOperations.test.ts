import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import {
	extractFollowingUsernames,
	openFollowingModal,
	scrollFollowingModal,
} from "./modalOperations.ts";

const sleepMock = jest.fn<any>();
jest.mock("../../timing/sleep/sleep.ts", () => ({ sleep: sleepMock }));

describe("modalOperations", () => {
	test("openFollowingModal returns false when no selector", async () => {
		const page = {
			$: jest.fn<any>().mockResolvedValue(null),
			evaluate: jest.fn<any>(),
		} as unknown as Page;
		const ok = await openFollowingModal(page);
		expect(ok).toBe(false);
	});

	test("extractFollowingUsernames returns [] when selector missing", async () => {
		const page = {
			waitForSelector: jest.fn<any>().mockRejectedValue(new Error("nope")),
			$$: jest.fn<any>().mockResolvedValue([]),
		} as unknown as Page;
		const names = await extractFollowingUsernames(page, 2);
		expect(names).toEqual([]);
	});

	test("scrollFollowingModal does not throw", async () => {
		const page = {
			evaluate: jest.fn<any>().mockResolvedValue(undefined),
		} as unknown as Page;
		await expect(scrollFollowingModal(page, 100)).resolves.not.toThrow();
	});
});
