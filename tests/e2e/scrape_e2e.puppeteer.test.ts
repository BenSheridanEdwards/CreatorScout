/**
 * Puppeteer-based E2E tests for the Instagram flows.
 * Run with: npm run test:e2e
 *
 * Test structure mirrors the Scout application flow:
 * 1. Seed Loading → Load usernames from seeds.txt
 * 2. Profile Visit → Navigate to seed profile
 * 3. Follow Actions → Potentially follow the profile
 * 4. Following Modal → Click "Following" → Extract usernames in batches
 * 5. Pagination → Scroll modal when batch exhausted
 * 6. Bio Analysis → Visit profiles, analyze bio, detect influencer
 * 7. Queue Management → Add creators to database and queue
 */

// (no filesystem helpers needed for Postgres-backed E2E)
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";
import { login } from "../../functions/auth/login/login.ts";
import { getBioFromPage } from "../../functions/extraction/getBioFromPage/getBioFromPage.ts";
import { getLinkFromBio } from "../../functions/extraction/getLinkFromBio/getLinkFromBio.ts";
import {
	buildUniqueLinks,
	hasDirectCreatorLink,
} from "../../functions/extraction/linkExtraction/linkExtraction.ts";
import {
	extractFollowingUsernames,
	openFollowingModal,
	scrollFollowingModal,
} from "../../functions/navigation/modalOperations/modalOperations.ts";
import { verifyLoggedIn } from "../../functions/navigation/profileNavigation/profileNavigation.ts";
import { checkDmThreadEmpty } from "../../functions/profile/profileActions/profileActions.ts";
import { parseProfileStatus } from "../../functions/profile/profileStatus/profileStatus.ts";
// Import TypeScript functions
import {
	closeDb,
	getScrollIndex,
	initDb,
	markAsCreator,
	markVisited,
	queueAdd,
	queueCount,
	queueNext,
	updateScrollIndex,
	wasVisited,
} from "../../functions/shared/database/database.ts";
import { snapshot } from "../../functions/shared/snapshot/snapshot.ts";
import { sleep } from "../../functions/timing/sleep/sleep.ts";
import { loadSeeds } from "../../scripts/scrape.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;
const TEST_PROFILE = process.env.TEST_PROFILE || "cristiano";

if (!IG_USER || !IG_PASS) {
	throw new Error(
		"INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env",
	);
}

// Helper function for test-specific scrolling (wraps scrollFollowingModal)
async function scrollModal(page: Page, times: number = 2): Promise<void> {
	for (let i = 0; i < times; i++) {
		await scrollFollowingModal(page, 600);
	}
}

// E2E tests use Postgres via Prisma. Ensure DATABASE_URL is set.

describe("Scout E2E Test Suite", () => {
	let browser: Browser;
	let page: Page;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set for E2E tests");
		}
		await initDb();

		// Timing data available via performance.now() if needed
		// const t0 = performance.now();

		// Use persistent user data directory for e2e tests to reuse sessions
		const { getUserDataDir } = await import(
			"../../functions/auth/sessionManager/sessionManager.ts"
		);
		const userDataDir = getUserDataDir();

		browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-dev-shm-usage"],
			userDataDir,
		});
		page = await browser.newPage();
		page.setDefaultNavigationTimeout(20000);
		page.setDefaultTimeout(12000);

		// Try to use saved session first, only login if needed
		const username = IG_USER;
		const password = IG_PASS;
		if (!username || !password) {
			throw new Error("Missing credentials");
		}
		await login(page, { username, password });
	}, 60000);

	afterEach(async () => {
		// Screenshot on failure handled in try-catch blocks
	});

	afterAll(async () => {
		// Timing data available but not logged (tests should be silent)
		// const total = performance.now() - t0;
		// const loginMs = tLogin - t0;

		if (browser) {
			await browser.close();
		}
		await closeDb();
		// No local DB file cleanup needed for Postgres.
	});

	describe("1. Seed Loading", () => {
		test("queue operations with seed usernames", async () => {
			const seeds = ["seed_user_1", "seed_user_2", "seed_user_3"];
			for (const s of seeds) {
				await queueAdd(s, 100, "seed");
			}

			expect(await queueCount()).toBeGreaterThanOrEqual(3);

			// Verify we can retrieve them
			const retrieved: string[] = [];
			let next = await queueNext();
			while (next && retrieved.length < 3) {
				retrieved.push(next);
				next = await queueNext();
			}

			expect(retrieved.length).toBe(3);
			seeds.forEach((seed) => {
				expect(retrieved).toContain(seed.toLowerCase());
			});
		});

		test("loadSeeds function loads from file", async () => {
			// This test assumes seeds.txt might exist
			// If it doesn't, the function should return 0
			const count = await loadSeeds();
			expect(typeof count).toBe("number");
			expect(count).toBeGreaterThanOrEqual(0);
		});
	});

	describe("2. Profile Visit", () => {
		test("navigate to public profile", async () => {
			try {
				await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
					waitUntil: "domcontentloaded",
				});

				const url = page.url();
				expect(url).toContain(TEST_PROFILE);
			} catch (error) {
				if (process.env.CI !== "true" && process.env.CI !== "1") {
					await snapshot(page, "error_navigate_public_profile");
				}
				throw error;
			}
		}, 30000);

		test("detect private or unavailable accounts", async () => {
			try {
				const testProfile = "test_private_account_12345";
				await page.goto(`https://www.instagram.com/${testProfile}/`, {
					waitUntil: "networkidle2",
					timeout: 15000,
				});
				await sleep(1500);

				const bodyText = await page.evaluate(
					() => document.body.innerText || "",
				);
				const status = parseProfileStatus(bodyText);

				expect(status.isPrivate || status.notFound).toBe(true);
			} catch (error) {
				if (process.env.CI !== "true" && process.env.CI !== "1") {
					await snapshot(page, "error_detect_private_account");
				}
				throw error;
			}
		}, 30000);
	});

	describe("3. Follow Actions", () => {
		test("detect follow button on profile", async () => {
			try {
				await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
					waitUntil: "networkidle2",
				});
				await sleep(1500);

				const followButton = await page.evaluate(() => {
					const buttons = Array.from(document.querySelectorAll("button"));

					for (const btn of buttons) {
						const text = btn.textContent?.trim().toLowerCase() || "";
						const ariaLabel =
							btn.getAttribute("aria-label")?.toLowerCase() || "";

						if (
							text === "follow" ||
							text === "following" ||
							ariaLabel.includes("follow")
						) {
							return {
								found: true,
								text: btn.textContent?.trim(),
								ariaLabel: btn.getAttribute("aria-label"),
								isFollowing: text === "following",
							};
						}
					}

					return { found: false };
				});

				expect(followButton.found).toBe(true);
			} catch (error) {
				if (process.env.CI !== "true" && process.env.CI !== "1") {
					await snapshot(page, "error_detect_follow_button");
				}
				throw error;
			}
		}, 30000);
	});

	describe("4. Following Modal", () => {
		test("open following modal", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "networkidle0",
			});
			await sleep(2000);

			const isLoggedIn = await verifyLoggedIn(page);
			if (!isLoggedIn) {
				const shot = await snapshot(page, "not_logged_in_modal");
				throw new Error(`Not logged in. Screenshot: ${shot}`);
			}

			const opened = await openFollowingModal(page);
			expect(opened).toBe(true);
			await page.keyboard.press("Escape");
		}, 30000);

		test("extract usernames in batch of 5", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "networkidle0",
			});
			await sleep(2000);

			const isLoggedIn = await verifyLoggedIn(page);
			if (!isLoggedIn) {
				const shot = await snapshot(page, "not_logged_in_usernames");
				throw new Error(`Not logged in. Screenshot: ${shot}`);
			}

			const opened = await openFollowingModal(page);
			if (!opened) {
				const shot = await snapshot(page, "modal_usernames_fail");
				throw new Error(`Could not open following modal. Screenshot: ${shot}`);
			}

			const usernames = await extractFollowingUsernames(page, 5);

			try {
				expect(Array.isArray(usernames)).toBe(true);
				expect(usernames.length).toBeGreaterThan(0);
				expect(usernames.length).toBeLessThanOrEqual(5);

				usernames.forEach((u) => {
					expect(typeof u).toBe("string");
					expect(u.includes("/")).toBe(false);
				});
			} catch (error) {
				if (process.env.CI !== "true" && process.env.CI !== "1") {
					await snapshot(page, "error_extract_usernames");
				}
				await page.keyboard.press("Escape");
				throw error;
			}

			await page.keyboard.press("Escape");
		}, 30000);
	});

	describe("5. Pagination", () => {
		test("scroll modal to load more profiles", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "networkidle0",
			});
			await sleep(2000);

			const isLoggedIn = await verifyLoggedIn(page);
			if (!isLoggedIn) {
				const shot = await snapshot(page, "not_logged_in_scroll");
				throw new Error(`Not logged in. Screenshot: ${shot}`);
			}

			const opened = await openFollowingModal(page);
			if (!opened) {
				const shot = await snapshot(page, "modal_scroll_fail");
				throw new Error(`Could not open following modal. Screenshot: ${shot}`);
			}

			const initialCount = await page.$$eval(
				'div[role="dialog"] a[href^="/"]',
				(els) => els.length,
			);

			await scrollModal(page, 3);
			await sleep(1000);

			const afterScrollCount = await page.$$eval(
				'div[role="dialog"] a[href^="/"]',
				(els) => els.length,
			);

			try {
				expect(afterScrollCount).toBeGreaterThanOrEqual(initialCount);
			} catch (error) {
				if (process.env.CI !== "true" && process.env.CI !== "1") {
					await snapshot(page, "error_scroll_modal");
				}
				await page.keyboard.press("Escape");
				throw error;
			}

			await page.keyboard.press("Escape");
		}, 30000);

		test("scroll index persistence (queue resume)", async () => {
			const username = "test_seed_user";

			const initial = await getScrollIndex(username);
			expect(initial).toBe(0);

			await updateScrollIndex(username, 10);
			const idx1 = await getScrollIndex(username);
			expect(idx1).toBe(10);

			await updateScrollIndex(username, 20);
			const idx2 = await getScrollIndex(username);
			expect(idx2).toBe(20);
		});
	});

	describe("6. Bio Analysis", () => {
		test("extract bio text from profile", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "domcontentloaded",
			});

			const bio = await getBioFromPage(page);

			expect(bio === null || typeof bio === "string").toBe(true);
		}, 30000);

		test("extract external link from bio", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "domcontentloaded",
			});

			const link = await getLinkFromBio(page);

			expect(link === null || typeof link === "string").toBe(true);
		}, 30000);

		test("detect creator link (svagtillstark profile)", async () => {
			const target = "svagtillstark";
			await page.goto(`https://www.instagram.com/${target}/`, {
				waitUntil: "domcontentloaded",
				timeout: 20000,
			});

			const primary = await getLinkFromBio(page);
			const headerHrefs = await page.$$eval("header a", (els) =>
				els.map((e) => e.getAttribute("href")).filter(Boolean),
			);
			const html = await page.content();
			const uniqueLinks = buildUniqueLinks(html, headerHrefs, primary);

			expect(uniqueLinks.length).toBeGreaterThan(0);

			const hasPatreon = hasDirectCreatorLink(uniqueLinks);
			expect(typeof hasPatreon).toBe("boolean");
		}, 30000);

		test("traverse following and extract bios", async () => {
			await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
				waitUntil: "networkidle0",
			});
			await sleep(2000);

			const isLoggedIn = await verifyLoggedIn(page);
			if (!isLoggedIn) {
				const shot = await snapshot(page, "not_logged_in_traversal");
				throw new Error(`Not logged in. Screenshot: ${shot}`);
			}

			const opened = await openFollowingModal(page);
			if (!opened) {
				const shot = await snapshot(page, "modal_traversal_fail");
				throw new Error(`Could not open following modal. Screenshot: ${shot}`);
			}

			const usernames = await extractFollowingUsernames(page, 5);
			if (usernames.length === 0) {
				const shot = await snapshot(page, "modal_no_usernames");
				await page.keyboard.press("Escape");
				throw new Error(`No usernames extracted. Screenshot: ${shot}`);
			}
			await page.keyboard.press("Escape");

			const sample = usernames.slice(0, 2);
			for (const u of sample) {
				await page.goto(`https://www.instagram.com/${u}/`, {
					waitUntil: "domcontentloaded",
					timeout: 20000,
				});
				const bio = await getBioFromPage(page);
				expect(bio === null || typeof bio === "string").toBe(true);
			}
		}, 60000);
	});

	describe("7. Queue Management", () => {
		test("full queue processing loop", async () => {
			const seeds = ["seed_user_1", "seed_user_2", "seed_user_3"];
			for (const s of seeds) {
				await queueAdd(s, 100, "seed");
			}

			const processed: string[] = [];
			const creatorsFound: string[] = [];

			while ((await queueCount()) > 0 && processed.length < 10) {
				const target = await queueNext();
				if (!target) {
					break;
				}

				if (await wasVisited(target)) {
					continue;
				}

				processed.push(target);

				const isCreator = target === "seed_user_1";
				const bioScore = isCreator ? 75 : 20;
				const confidence = isCreator ? 85 : 20;
				await markVisited(
					target,
					undefined,
					undefined,
					bioScore,
					undefined,
					confidence,
				);

				if (isCreator) {
					await markAsCreator(target, 85);
					creatorsFound.push(target);

					await queueAdd(
						"discovered_from_creator_1",
						50,
						`following_of_${target}`,
					);
					await queueAdd(
						"discovered_from_creator_2",
						50,
						`following_of_${target}`,
					);
				}
			}

			expect(processed.length).toBeGreaterThanOrEqual(3);
			expect(creatorsFound.length).toBe(1);
			expect(await wasVisited("seed_user_1")).toBe(true);
		});

		test("DM thread empty check", async () => {
			await page.goto("https://www.instagram.com/direct/inbox/", {
				waitUntil: "domcontentloaded",
			});
			const empty = await checkDmThreadEmpty(page);
			expect(typeof empty).toBe("boolean");
		}, 30000);
	});
});
