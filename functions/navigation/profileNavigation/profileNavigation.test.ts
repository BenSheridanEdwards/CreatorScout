import { jest } from "@jest/globals";
import type { Page } from "puppeteer";

const loginMock =
	jest.fn<
		(
			page: Page,
			creds: { username: string; password: string },
			options?: { skipIfLoggedIn?: boolean },
		) => Promise<void>
	>();
const parseProfileStatusMock = jest
	.fn<(text: string) => { isPrivate: boolean; notFound: boolean }>()
	.mockReturnValue({ isPrivate: false, notFound: false });
const sleepMock = jest.fn<() => Promise<void>>();
const configMock = { IG_USER: "u", IG_PASS: "p" };

jest.unstable_mockModule("../../auth/login/login.ts", () => ({
	login: loginMock,
}));
jest.unstable_mockModule(
	"../../profile/profileStatus/profileStatus.ts",
	() => ({ parseProfileStatus: parseProfileStatusMock }),
);
jest.unstable_mockModule("../../shared/config/config.ts", () => configMock);
jest.unstable_mockModule("../../timing/sleep/sleep.ts", () => ({
	sleep: sleepMock,
}));

const {
	navigateToProfile,
	checkProfileStatus,
	verifyLoggedIn,
	ensureLoggedIn,
	navigateToProfileAndCheck,
} = await import("./profileNavigation.ts");

const pageMock = () =>
	({
		goto: jest
			.fn<(url: string, opts?: object) => Promise<void>>()
			.mockResolvedValue(undefined),
		waitForSelector: jest
			.fn<
				(
					selector: string,
					options?: import("puppeteer").WaitForSelectorOptions,
				) => Promise<import("puppeteer").ElementHandle<Element>>
			>()
			.mockResolvedValue({} as import("puppeteer").ElementHandle<Element>),
		evaluate: jest
			.fn<
				<T>(
					pageFunction: (...args: unknown[]) => T,
					...args: unknown[]
				) => Promise<T>
			>()
			.mockResolvedValue(undefined as unknown as never),
		$: jest
			.fn<
				(
					selector: string,
				) => Promise<import("puppeteer").ElementHandle<Element> | null>
			>()
			.mockResolvedValue(null),
	}) as unknown as Page;

describe("profileNavigation", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		configMock.IG_USER = "u";
		configMock.IG_PASS = "p";
		parseProfileStatusMock.mockReturnValue({
			isPrivate: false,
			notFound: false,
		});
	});

	test("navigateToProfile calls goto with url and waits", async () => {
		const page = pageMock();
		await navigateToProfile(page, "user123");
		expect(page.goto).toHaveBeenCalledWith(
			"https://www.instagram.com/user123/",
			expect.objectContaining({ waitUntil: "networkidle2", timeout: 20000 }),
		);
		expect(sleepMock).toHaveBeenCalledWith(3000);
	});

	test("navigateToProfile waits for header when requested", async () => {
		const page = pageMock();
		page.waitForSelector = jest
			.fn<
				(
					selector: string,
					options?: import("puppeteer").WaitForSelectorOptions,
				) => Promise<import("puppeteer").ElementHandle<Element>>
			>()
			.mockResolvedValue(
				{} as import("puppeteer").ElementHandle<Element>,
			) as Page["waitForSelector"];

		await navigateToProfile(page, "user123", { waitForHeader: true });

		expect(page.waitForSelector).toHaveBeenCalledWith("header", {
			timeout: 5000,
		});
	});

	test("checkProfileStatus delegates to parser", async () => {
		const page = pageMock();
		page.evaluate = jest
			.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<string>>()
			.mockResolvedValue("page text") as Page["evaluate"];
		parseProfileStatusMock.mockReturnValue({
			isPrivate: true,
			notFound: false,
		});

		const status = await checkProfileStatus(page);

		expect(parseProfileStatusMock).toHaveBeenCalledWith("page text");
		expect(status).toEqual({
			isPrivate: true,
			notFound: false,
			isAccessible: false,
		});
	});

	test("verifyLoggedIn returns evaluation result", async () => {
		const page = pageMock();
		page.evaluate = jest
			.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<boolean>>()
			.mockResolvedValue(true) as Page["evaluate"];

		const ok = await verifyLoggedIn(page);

		expect(ok).toBe(true);
	});

	test("ensureLoggedIn returns early when inbox link exists", async () => {
		const page = pageMock();
		page.$ = jest
			.fn<
				(
					selector: string,
				) => Promise<import("puppeteer").ElementHandle<Element> | null>
			>()
			.mockResolvedValue(
				{} as import("puppeteer").ElementHandle<Element>,
			) as Page["$"];

		await ensureLoggedIn(page);

		expect(loginMock).not.toHaveBeenCalled();
	});

	test("ensureLoggedIn throws when credentials missing", async () => {
		configMock.IG_USER = "";
		configMock.IG_PASS = "";
		const page = pageMock();
		page.$ = jest
			.fn<
				(
					selector: string,
				) => Promise<import("puppeteer").ElementHandle<Element> | null>
			>()
			.mockResolvedValue(null) as Page["$"];

		jest.resetModules();
		const { ensureLoggedIn: freshEnsureLoggedIn } = await import(
			"./profileNavigation.ts"
		);

		await expect(freshEnsureLoggedIn(page)).rejects.toThrow(
			"Instagram credentials not configured",
		);
		expect(loginMock).not.toHaveBeenCalled();
	});

	test("ensureLoggedIn triggers login with credentials", async () => {
		const page = pageMock();
		page.$ = jest.fn<() => Promise<null>>().mockResolvedValue(null);
		loginMock.mockResolvedValue(undefined);

		await ensureLoggedIn(page);

		expect(loginMock).toHaveBeenCalledWith(
			page,
			{ username: "u", password: "p" },
			{ skipIfLoggedIn: false },
		);
	});

	test("navigateToProfileAndCheck chains navigate and status", async () => {
		const page = pageMock();
		page.evaluate = jest
			.fn<(pageFunction: unknown, ...args: unknown[]) => Promise<string>>()
			.mockResolvedValue("text") as Page["evaluate"];
		parseProfileStatusMock.mockReturnValue({
			isPrivate: false,
			notFound: true,
		});

		const status = await navigateToProfileAndCheck(page, "abc", {
			timeout: 111,
			waitForHeader: true,
		});

		expect(page.goto).toHaveBeenCalledWith(
			"https://www.instagram.com/abc/",
			expect.objectContaining({ timeout: 111 }),
		);
		expect(status).toEqual({
			isPrivate: false,
			notFound: true,
			isAccessible: false,
		});
	});
});
