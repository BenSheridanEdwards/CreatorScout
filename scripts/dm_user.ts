/**
 * Send DM to a specific Instagram user
 *
 * Usage: tsx scripts/dm_user.ts <username>
 * Example: tsx scripts/dm_user.ts patreon_creator
 */

import type { Browser, Page } from "puppeteer";
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { wasDmSent } from "../functions/shared/database/database.ts";

async function dmUser(username: string): Promise<void> {
	console.log(`💬 Sending DM to: @${username}`);

	// Check if already DM'd
	if (wasDmSent(username)) {
		console.log("ℹ️  Already sent DM to this user");
		return;
	}

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

		console.log(`📨 Sending DM to @${username}...`);
		const success = await sendDMToUser(page, username);

		if (success) {
			console.log("✅ DM sent successfully");
		} else {
			console.log("❌ DM failed to send");
		}
	} catch (error) {
		console.error("❌ DM failed:", error);
	} finally {
		await browser.close();
	}
}

// Script entry point
const username = process.argv[2];
if (!username) {
	console.error("❌ Please provide a username");
	console.error("Usage: tsx scripts/dm_user.ts <username>");
	process.exit(1);
}

dmUser(username).catch(console.error);
