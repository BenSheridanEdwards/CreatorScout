/**
 * Get following list from a specific Instagram profile
 *
 * Usage: tsx scripts/get_following.ts <username> [count]
 * Example: tsx scripts/get_following.ts patreon_creator 50
 */

import type { Browser, Page } from "puppeteer";
import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import {
	ensureLoggedIn,
	navigateToProfileAndCheck,
} from "../functions/navigation/profileNavigation/profileNavigation.ts";
import {
	extractFollowingUsernames,
	openFollowingModal,
} from "../functions/navigation/modalOperations/modalOperations.ts";

async function getFollowing(
	username: string,
	count: number = 20,
): Promise<void> {
	console.log(`📋 Getting following list for: @${username} (max ${count})`);

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in successfully");

		console.log(`📍 Navigating to @${username}...`);
		const status = await navigateToProfileAndCheck(page, username, {
			timeout: 15000,
		});

		if (status.notFound) {
			console.log("❌ Profile not found");
			return;
		}

		if (status.isPrivate) {
			console.log("🔒 Profile is private");
			return;
		}

		console.log("📂 Opening following modal...");
		const modalOpened = await openFollowingModal(page);
		if (!modalOpened) {
			console.log("❌ Could not open following modal");
			return;
		}

		console.log(`🔍 Extracting up to ${count} usernames...`);
		const usernames = await extractFollowingUsernames(page, count);

		console.log(`\n📊 Found ${usernames.length} users in following list:`);
		usernames.forEach((user, index) => {
			console.log(`${(index + 1).toString().padStart(2)}. @${user}`);
		});

		if (usernames.length === 0) {
			console.log("ℹ️  No users found in following list");
		}
	} catch (error) {
		console.error("❌ Failed to get following list:", error);
	} finally {
		await browser.close();
	}
}

// Script entry point
const username = process.argv[2];
const count = parseInt(process.argv[3]) || 20;

if (!username) {
	console.error("❌ Please provide a username");
	console.error("Usage: tsx scripts/get_following.ts <username> [count]");
	console.error("Example: tsx scripts/get_following.ts patreon_creator 50");
	process.exit(1);
}

getFollowing(username, count).catch(console.error);

