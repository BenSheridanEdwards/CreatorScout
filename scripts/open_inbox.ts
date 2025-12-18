/**
 * Open Instagram DM inbox in a real browser session.
 *
 * Usage:
 *   tsx scripts/open_inbox.ts
 */

import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { clickAny } from "../functions/navigation/clickAny/clickAny.ts";

/**
 * Handle common inbox popups and error states.
 */
async function handleInboxPopupsAndErrors(page: import("puppeteer").Page) {
	// Dismiss "Turn on Notifications" / similar modals
	const dismissedNotifications = await clickAny(page, [
		"Not Now",
		"Not now",
		"Cancel",
		"Close",
	]);
	if (dismissedNotifications) {
		console.log("ℹ️ Dismissed notifications popup");
	}

	// Detect "Something went wrong" page and try to recover
	const somethingWentWrong = await page.evaluate(() => {
		const bodyText = document.body?.innerText || "";
		return bodyText.toLowerCase().includes("something went wrong");
	});

	if (somethingWentWrong) {
		console.log("⚠️ Detected 'Something went wrong' error state on inbox page");

		// Try clicking "Reload page" button if present
		const reloaded = await clickAny(page, ["Reload page", "Reload"]);
		if (reloaded) {
			console.log("🔄 Clicked 'Reload page', waiting for reload...");
			await page
				.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 })
				.catch(() => undefined);
			console.log("ℹ️ Reload complete (or timed out)");
		} else {
			console.log("ℹ️ Could not find 'Reload page' button to recover");
		}
	}
}

async function openInbox(): Promise<void> {
	// Always use a headed browser so you can see what's happening.
	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("🔐 Logging in (or restoring session)...");
		await ensureLoggedIn(page);
		console.log("✅ Logged in");

		// Give the session a moment to stabilize
		console.log("⏳ Waiting for session to stabilize...");
		await new Promise((resolve) => setTimeout(resolve, 3000));

		console.log("📥 Navigating to DM inbox...");
		await page.goto("https://www.instagram.com/direct/inbox/", {
			waitUntil: "networkidle2",
			timeout: 20000,
		});

		// Handle notification popup and "Something went wrong" if they appear
		await handleInboxPopupsAndErrors(page);

		console.log("💬 Sending DM to @bensheridanedwards...");
		const dmSuccess = await sendDMToUser(page, "bensheridanedwards");
		if (dmSuccess) {
			console.log("✅ DM to @bensheridanedwards sent successfully.");
		} else {
			console.log("⚠️ DM to @bensheridanedwards may not have been sent.");
		}

		// Let you observe the inbox/DM state for a bit
		console.log("✅ DM flow complete. Leaving browser open for inspection.");
		// Keep the browser open until you close it manually
	} catch (error) {
		console.error("❌ Failed to open inbox:", error);
		await browser.close();
		process.exit(1);
	}
}

openInbox().catch((err) => {
	console.error(err);
	process.exit(1);
});
