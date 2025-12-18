/**
 * Send DM to a specific Instagram user
 *
 * Usage: tsx scripts/dm_user.ts <username> [--confirm] [--force]
 * Example: tsx scripts/dm_user.ts bensheridanedwards --confirm
 * Example: tsx scripts/dm_user.ts bensheridanedwards --confirm --force  # Bypass database check
 */

import { mkdirSync } from "node:fs";
// (no puppeteer types needed directly)
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { wasDmSent } from "../functions/shared/database/database.ts";

async function dmUser(username: string, force: boolean = false): Promise<void> {
	console.log(`💬 Sending DM to: @${username}`);

	// Default to in-memory DB for this script unless user explicitly opts into Prisma.
	// DMs are the primary goal; DB tracking is best-effort.
	if (!process.env.SCOUT_DB_MODE) {
		process.env.SCOUT_DB_MODE = "memory";
	}

	// Check if already DM'd (best-effort; if DB is unavailable, continue anyway).
	// Skip check if --force flag is used (for testing)
	if (!force) {
		try {
			if (await wasDmSent(username)) {
				console.log("ℹ️  Already sent DM to this user");
				console.log("💡 Use --force flag to bypass this check for testing");
				return;
			}
		} catch (err) {
			console.log(
				"ℹ️  Could not check DM history (DB unavailable); continuing anyway",
			);
			console.error(err);
		}
	} else {
		console.log("⚡ Force mode: Bypassing database check");
	}

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

		// Wait for session to fully establish before navigating
		console.log("⏳ Waiting for session to stabilize...");
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Take a screenshot to see what the page looks like after login
		mkdirSync("tmp", { recursive: true });
		{
			const p = `tmp/login_state_${Date.now()}.png`;
			await page.screenshot({ path: p, fullPage: true });
			console.log(`📸 Login state screenshot saved: ${p}`);
		}

		// Verify we're still logged in before proceeding
		const stillLoggedIn = await page.evaluate(() => {
			return (
				document.querySelector('a[href="/direct/inbox/"]') !== null ||
				document.querySelector('svg[aria-label="Home"]') !== null
			);
		});

		if (!stillLoggedIn) {
			throw new Error(
				"Session lost after login - Instagram may have detected automation",
			);
		}

		console.log(`📨 Sending DM to @${username}...`);
		const success = await sendDMToUser(page, username);

		if (success) {
			console.log("✅ DM sent successfully");

			// Wait for message to be fully visible in the thread
			console.log("⏳ Waiting for message to appear in thread...");
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Verify we're still on the DM thread page
			const currentUrl = page.url();
			const isInDmThread =
				currentUrl.includes("/direct/t/") ||
				currentUrl.includes("/direct/inbox/");

			if (!isInDmThread) {
				console.log("⚠️  Not on DM thread page, navigating back...");
				await page.goto(
					`https://www.instagram.com/direct/t/${username.toLowerCase().trim()}/`,
					{
						waitUntil: "networkidle2",
						timeout: 15000,
					},
				);
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			// Always capture proof for human verification
			const proofPath = `tmp/dm_proof_${username}_${Date.now()}.png`;
			await page.screenshot({ path: proofPath, fullPage: true });
			console.log(`📸 DM proof screenshot saved: ${proofPath}`);
		} else {
			console.log("❌ DM failed to send");
			const failPath = `tmp/dm_failed_${username}_${Date.now()}.png`;
			await page.screenshot({ path: failPath, fullPage: true });
			console.log(`📸 DM failure screenshot saved: ${failPath}`);
		}
	} catch (error) {
		console.error("❌ DM failed:", error);
		try {
			mkdirSync("tmp", { recursive: true });
			const errPath = `tmp/dm_error_${username}_${Date.now()}.png`;
			await page.screenshot({ path: errPath, fullPage: true });
			console.log(`📸 Error screenshot saved: ${errPath}`);
		} catch (screenshotErr) {
			console.error("❌ Could not take error screenshot:", screenshotErr);
		}
	} finally {
		await browser.close();
	}
}

// Script entry point
const args = process.argv.slice(2);
const confirm =
	args.includes("--confirm") || args.includes("--yes") || args.includes("-y");
const force = args.includes("--force") || args.includes("-f");
const username = args.find((a) => !a.startsWith("-"));
if (!username) {
	console.error("❌ Please provide a username");
	console.error(
		"Usage: tsx scripts/dm_user.ts <username> [--confirm] [--force]",
	);
	process.exit(1);
}

if (!confirm) {
	console.log(
		`🛑 Safety stop: not sending any DM. Re-run with --confirm to actually message @${username}.`,
	);
	process.exit(0);
}

dmUser(username, force).catch(console.error);
