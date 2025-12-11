import { jest } from "@jest/globals";
import type { ElementHandle, Page } from "puppeteer";

const sleepMock = jest.fn<() => Promise<void>>();
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const { extractFollowingUsernames, openFollowingModal, scrollFollowingModal } =
	await import("./modalOperations.ts");

describe("modalOperations", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("openFollowingModal returns false when no selector", async () => {
		const page = {
			$: jest
				.fn<() => Promise<ElementHandle<Element> | null>>()
				.mockResolvedValue(null),
			evaluate: jest.fn(),
		} as unknown as Page;
		const ok = await openFollowingModal(page);
		expect(ok).toBe(false);
	});

	test("openFollowingModal clicks selector and waits", async () => {
		const clickMock = jest
			.fn<() => Promise<void>>()
			.mockResolvedValue(undefined);
		const page = {
			$: jest
				.fn<() => Promise<{ click: () => Promise<void> } | null>>()
				.mockResolvedValue({ click: clickMock }),
			evaluate: jest.fn(),
		} as unknown as Page;

		const ok = await openFollowingModal(page);

		expect(ok).toBe(true);
		expect(clickMock).toHaveBeenCalled();
		expect(sleepMock).toHaveBeenCalledWith(3000);
	});

	test("openFollowingModal falls back to evaluate when selectors fail", async () => {
		const page = {
			$: jest.fn<() => Promise<null>>().mockResolvedValue(null),
			evaluate: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
		} as unknown as Page;

		const ok = await openFollowingModal(page);

		expect(ok).toBe(true);
		expect(page.evaluate).toHaveBeenCalled();
		expect(sleepMock).toHaveBeenCalledWith(3000);
	});

	test("extractFollowingUsernames returns [] when selector missing", async () => {
		const page = {
			waitForSelector: jest
				.fn<() => Promise<ElementHandle<Element>>>()
				.mockRejectedValue(new Error("nope")),
			$$: jest
				.fn<() => Promise<ElementHandle<Element>[]>>()
				.mockResolvedValue([]),
			evaluate: jest.fn(),
		} as unknown as Page;
		const names = await extractFollowingUsernames(page, 2);
		expect(names).toEqual([]);
	});

	test("extractFollowingUsernames collects usernames respecting batch size", async () => {
		const makeItem = (href: string) =>
			({
				evaluate: jest
					.fn<
						(
							fn: (el: { getAttribute: () => string }) => string,
						) => Promise<string>
					>()
					.mockImplementation(async (fn) => fn({ getAttribute: () => href })),
			}) as unknown as ElementHandle<Element>;

		const items = [
			makeItem("/user1/"),
			makeItem("/user2/"),
			makeItem("/explore/"),
		];

		const page = {
			waitForSelector: jest
				.fn<() => Promise<ElementHandle<Element>>>()
				.mockResolvedValue({} as ElementHandle<Element>),
			$$: jest
				.fn<() => Promise<ElementHandle<Element>[]>>()
				.mockResolvedValueOnce(items)
				.mockResolvedValue([]),
			evaluate: jest.fn(),
		} as unknown as Page;

		const names = await extractFollowingUsernames(page, 2);

		expect(names).toEqual(["user1", "user2"]);
	});

	test("scrollFollowingModal scrolls modal and waits", async () => {
		const evaluateMock = jest
			.fn<(fn: (amount: number) => void, amount: number) => Promise<void>>()
			.mockImplementation(async (_fn, _amount) => undefined);
		const page = {
			evaluate: evaluateMock,
		} as unknown as Page;
		await scrollFollowingModal(page, 123);
		expect(evaluateMock).toHaveBeenCalled();
		expect(sleepMock).toHaveBeenCalledWith(400);
	});
});
