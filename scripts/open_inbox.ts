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

		// Let you observe the inbox for a bit
		console.log("✅ DM inbox opened. Leaving browser open for inspection.");
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



