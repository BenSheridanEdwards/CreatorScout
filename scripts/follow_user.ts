/**
 * Follow a specific Instagram user
 *
 * Usage: tsx scripts/follow_user.ts <username>
 * Example: tsx scripts/follow_user.ts patreon_creator
 */

import type { Browser, Page } from "puppeteer";
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { followUserAccount } from "../functions/profile/profileActions/profileActions.ts";
import { wasFollowed } from "../functions/shared/database/database.ts";

async function followUser(username: string): Promise<void> {
	console.log(`👥 Following user: @${username}`);

	// Check if already followed
	if (await wasFollowed(username)) {
		console.log("ℹ️  Already following this user");
		return;
	}

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

		console.log(`📍 Following @${username}...`);
		const success = await followUserAccount(page, username);

		if (success) {
			console.log("✅ Successfully followed user");
		} else {
			console.log("ℹ️  User already followed or button not found");
		}
	} catch (error) {
		console.error("❌ Follow failed:", error);
	} finally {
		await browser.close();
	}
}

// Script entry point
const username = process.argv[2];
if (!username) {
	console.error("❌ Please provide a username");
	console.error("Usage: tsx scripts/follow_user.ts <username>");
	process.exit(1);
}

followUser(username).catch(console.error);

