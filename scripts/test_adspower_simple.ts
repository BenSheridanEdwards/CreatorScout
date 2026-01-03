/**
 * Simple AdsPower Instagram Test
 *
 * Just connects, navigates to Instagram, and takes a screenshot.
 * Used for diagnosing connection issues.
 */

import {
	connectToAdsPowerProfile,
	listAdsPowerProfiles,
	stopAdsPowerProfile,
} from "../functions/navigation/browser/adsPowerConnector.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";

async function main(): Promise<void> {
	let profileId = process.argv[2];

	if (!profileId) {
		const profiles = await listAdsPowerProfiles();
		if (profiles.length === 0) {
			console.error("No AdsPower profiles found!");
			process.exit(1);
		}
		profileId = profiles[0].user_id;
		console.log(`Using profile: ${profiles[0].name} (${profileId})\n`);
	}

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("          SIMPLE ADSPOWER DIAGNOSTIC TEST");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	let browser;

	try {
		console.log(`🔗 Connecting to AdsPower profile: ${profileId}...`);
		browser = await connectToAdsPowerProfile(profileId);
		console.log("✅ Connected!\n");

		const pages = await browser.pages();
		const page = pages[0] || (await browser.newPage());

		// Set viewport
		await page.setViewport({ width: 1440, height: 900 });

		console.log("📱 Navigating to Instagram...");
		await page.goto("https://www.instagram.com/", {
			waitUntil: "domcontentloaded",
			timeout: 60000,
		});

		const currentUrl = page.url();
		console.log(`✅ Navigated to: ${currentUrl}\n`);

		// Wait a bit for page to render
		console.log("⏳ Waiting 5 seconds for page to fully render...");
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Take screenshot
		const screenshotPath = await snapshot(
			page,
			`adspower_diagnostic_${Date.now()}`,
		);
		console.log(`📸 Screenshot saved: ${screenshotPath}\n`);

		// Get page title and some info
		const title = await page.title();
		console.log(`📄 Page title: ${title}`);

		// Check what's on the page
		const pageInfo = await page.evaluate(() => {
			const body = document.body;
			const hasLoginForm = !!document.querySelector('input[name="username"]');
			const hasInbox = !!document.querySelector('a[href="/direct/inbox/"]');
			const hasNav = !!document.querySelector("nav");
			const bodyText = body?.innerText?.substring(0, 500) || "No body text";

			return {
				hasLoginForm,
				hasInbox,
				hasNav,
				bodyPreview: bodyText.replace(/\n/g, " ").substring(0, 200),
			};
		});

		console.log("\n📊 Page Analysis:");
		console.log(
			`   Login form present: ${pageInfo.hasLoginForm ? "✅ Yes" : "❌ No"}`,
		);
		console.log(
			`   Inbox link present: ${pageInfo.hasInbox ? "✅ Yes (logged in)" : "❌ No"}`,
		);
		console.log(
			`   Navigation present: ${pageInfo.hasNav ? "✅ Yes" : "❌ No"}`,
		);
		console.log(`\n📝 Body preview: ${pageInfo.bodyPreview}...`);

		console.log(
			"\n═══════════════════════════════════════════════════════════════",
		);
		console.log("                    TEST COMPLETE ✅");
		console.log(
			"═══════════════════════════════════════════════════════════════\n",
		);

		// Keep browser open for inspection
		console.log(
			"⏳ Keeping browser open for 15 seconds for manual inspection...",
		);
		await new Promise((resolve) => setTimeout(resolve, 15000));
	} catch (error) {
		console.error("\n❌ Error:", error);
		process.exit(1);
	} finally {
		if (browser) {
			console.log("🔌 Disconnecting browser...");
			browser.disconnect();
		}

		console.log(`🛑 Stopping AdsPower profile: ${profileId}...`);
		try {
			await stopAdsPowerProfile(profileId);
			console.log("✅ Profile stopped\n");
		} catch (e) {
			console.log(`⚠️  Could not stop profile: ${e}`);
		}
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
