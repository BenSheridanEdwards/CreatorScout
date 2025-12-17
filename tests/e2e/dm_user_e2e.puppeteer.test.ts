/**
 * E2E: Send a DM to a specific user.
 *
 * Run with:
 *   DATABASE_URL="postgres://..." \
 *   INSTAGRAM_USERNAME="..." INSTAGRAM_PASSWORD="..." \
 *   E2E_DM_TARGET="target_username" \
 *   npm run test:e2e -- tests/e2e/dm_user_e2e.puppeteer.test.ts
 *
 * Safety:
 * - If `E2E_DM_TARGET` is missing, the suite is skipped.
 * - If the DB already indicates a DM was sent to the target and `E2E_FORCE_DM`
 *   is not set, the test exits early to avoid spamming.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { login } from "../../functions/auth/login/login.ts";
import { sendDMToUser } from "../../functions/profile/profileActions/profileActions.ts";
import {
	closeDb,
	initDb,
	wasDmSent,
} from "../../functions/shared/database/database.ts";
import { DM_MESSAGE } from "../../functions/shared/config/config.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;
const TARGET = process.env.E2E_DM_TARGET;
const FORCE =
	process.env.E2E_FORCE_DM === "true" || process.env.E2E_FORCE_DM === "1";

describe("DM user E2E", () => {
	let browser: Browser | null = null;
	let page: Page | null = null;

	beforeAll(async () => {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL must be set for E2E tests");
		}
		if (!IG_USER || !IG_PASS) {
			throw new Error("INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set");
		}
		if (!TARGET) {
			// Skip by leaving browser uninitialized; tests will return early.
			return;
		}

		const puppeteerWithUse = puppeteer as unknown as {
			use: (plugin: unknown) => void;
		};
		puppeteerWithUse.use(StealthPlugin());

		const puppeteerWithLaunch = puppeteer as unknown as {
			launch: (opts: unknown) => Promise<Browser>;
		};

		browser = await puppeteerWithLaunch.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-dev-shm-usage"],
		});
		page = await browser.newPage();
		page.setDefaultNavigationTimeout(25000);
		page.setDefaultTimeout(15000);

		await initDb();
		await login(page, { username: IG_USER, password: IG_PASS });
	}, 60000);

	afterAll(async () => {
		if (browser) await browser.close();
		await closeDb();
	}, 30000);

	test("sends a DM and verifies it appears in the thread", async () => {
		if (!TARGET) return;
		if (!page) throw new Error("Page not initialized");

		const already = await wasDmSent(TARGET);
		if (already && !FORCE) {
			// Avoid re-sending DMs. Configure a fresh target or set E2E_FORCE_DM=1.
			return;
		}

		const ok = await sendDMToUser(page, TARGET);
		expect(ok).toBe(true);

		// Save a screenshot for manual verification
		mkdirSync("tmp", { recursive: true });
		const proofPath = `tmp/e2e_dm_proof_${TARGET}_${Date.now()}.png.base64`;
		const b = (await page.screenshot({ fullPage: true })) as Buffer;
		writeFileSync(proofPath, b.toString("base64"), "utf8");
		// eslint-disable-next-line no-console
		console.log(`[e2e] dm proof screenshot: ${proofPath}`);

		// Verify it shows up in UI (best-effort; IG DOM shifts frequently).
		const seen = await page.evaluate((msg: string) => {
			const text = document.body?.innerText || "";
			return text.includes(msg);
		}, DM_MESSAGE);
		expect(seen).toBe(true);

		// Verify we recorded it in DB.
		expect(await wasDmSent(TARGET)).toBe(true);
	}, 90000);
});
