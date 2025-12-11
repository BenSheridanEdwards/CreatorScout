import { jest } from "@jest/globals";
import type { Page } from "puppeteer";
import {
	checkProfileStatus,
	navigateToProfile,
	verifyLoggedIn,
} from "./profileNavigation.ts";

jest.mock("../../auth/login/login.ts", () => ({ login: jest.fn<any>() }));
jest.mock("../../shared/config/config.ts", () => ({
	IG_USER: "u",
	IG_PASS: "p",
}));
jest.mock("../../timing/sleep/sleep.ts", () => ({ sleep: jest.fn<any>() }));

const pageMock = () => ({
	goto: jest.fn<any>().mockResolvedValue(undefined),
	waitForSelector: jest.fn<any>().mockResolvedValue(undefined),
	evaluate: jest.fn<any>().mockResolvedValue(undefined),
	$: jest.fn<any>().mockResolvedValue(null),
});

describe("profileNavigation", () => {
	test("navigateToProfile calls goto", async () => {
		const page = pageMock() as unknown as Page;
		await navigateToProfile(page, "user");
		expect(page.goto).toHaveBeenCalled();
	});

	test("checkProfileStatus parses body text", async () => {
		const page = pageMock() as unknown as Page;
		page.evaluate = jest.fn<any>().mockResolvedValue("This account is private");
		const status = await checkProfileStatus(page);
		expect(status.isPrivate).toBe(true);
	});

	test("verifyLoggedIn returns true when inbox link is present", async () => {
		const page = pageMock() as unknown as Page;
		page.evaluate = jest.fn<any>().mockResolvedValue(true);
		const ok = await verifyLoggedIn(page);
		expect(ok).toBe(true);
	});
});
