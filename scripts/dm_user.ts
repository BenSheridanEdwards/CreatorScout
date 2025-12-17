/**
 * Send DM to a specific Instagram user
 *
 * Usage: tsx scripts/dm_user.ts <username> [--confirm]
 * Example: tsx scripts/dm_user.ts bensheridanedwards --confirm
 */

import { mkdirSync, writeFileSync } from "node:fs";
// (no puppeteer types needed directly)
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { wasDmSent } from "../functions/shared/database/database.ts";

async function dmUser(username: string): Promise<void> {
	console.log(`💬 Sending DM to: @${username}`);

	// Default to in-memory DB for this script unless user explicitly opts into Prisma.
	// DMs are the primary goal; DB tracking is best-effort.
	if (!process.env.SCOUT_DB_MODE) {
		process.env.SCOUT_DB_MODE = "memory";
	}

	// Check if already DM'd (best-effort; if DB is unavailable, continue anyway).
	try {
		if (await wasDmSent(username)) {
			console.log("ℹ️  Already sent DM to this user");
			return;
		}
	} catch (err) {
		console.log(
			"ℹ️  Could not check DM history (DB unavailable); continuing anyway",
		);
		console.error(err);
	}

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

		// Take a screenshot to see what the page looks like after login
		mkdirSync("tmp", { recursive: true });
		{
			const b = (await page.screenshot({ fullPage: true })) as Buffer;
			const p = `tmp/login_state_${Date.now()}.png.base64`;
			writeFileSync(p, b.toString("base64"), "utf8");
			console.log(`📸 Login state screenshot saved: ${p}`);
		}

		console.log(`📨 Sending DM to @${username}...`);
		const success = await sendDMToUser(page, username);

		if (success) {
			console.log("✅ DM sent successfully");
			// Always capture proof for human verification
			const proofPath = `tmp/dm_proof_${username}_${Date.now()}.png.base64`;
			const b = (await page.screenshot({ fullPage: true })) as Buffer;
			writeFileSync(proofPath, b.toString("base64"), "utf8");
			console.log(`📸 DM proof screenshot saved: ${proofPath}`);
		} else {
			console.log("❌ DM failed to send");
			const failPath = `tmp/dm_failed_${username}_${Date.now()}.png.base64`;
			const b = (await page.screenshot({ fullPage: true })) as Buffer;
			writeFileSync(failPath, b.toString("base64"), "utf8");
			console.log(`📸 DM failure screenshot saved: ${failPath}`);
		}
	} catch (error) {
		console.error("❌ DM failed:", error);
		try {
			mkdirSync("tmp", { recursive: true });
			const errPath = `tmp/dm_error_${username}_${Date.now()}.png.base64`;
			const b = (await page.screenshot({ fullPage: true })) as Buffer;
			writeFileSync(errPath, b.toString("base64"), "utf8");
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
const username = args.find((a) => !a.startsWith("-"));
if (!username) {
	console.error("❌ Please provide a username");
	console.error("Usage: tsx scripts/dm_user.ts <username> [--confirm]");
	process.exit(1);
}

if (!confirm) {
	console.log(
		`🛑 Safety stop: not sending any DM. Re-run with --confirm to actually message @${username}.`,
	);
	process.exit(0);
}

dmUser(username).catch(console.error);
