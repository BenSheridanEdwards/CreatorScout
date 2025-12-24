/**
 * Test AdsPower Connection
 *
 * Tests connecting to an AdsPower profile via Puppeteer.
 *
 * Usage:
 *   npx tsx scripts/test_adspower_connection.ts [profile_id]
 */

import {
	connectToAdsPowerProfile,
	stopAdsPowerProfile,
	listAdsPowerProfiles,
} from "../functions/navigation/browser/adsPowerConnector.ts";

async function main(): Promise<void> {
	// Get profile ID from command line or use first available
	let profileId = process.argv[2];

	if (!profileId) {
		console.log("No profile ID provided, fetching first available profile...");
		const profiles = await listAdsPowerProfiles();
		if (profiles.length === 0) {
			console.error("No AdsPower profiles found! Create one first.");
			process.exit(1);
		}
		profileId = profiles[0].user_id;
		console.log(`Using profile: ${profiles[0].name} (${profileId})\n`);
	}

	console.log("═══════════════════════════════════════════════════════════════");
	console.log("          ADSPOWER CONNECTION TEST");
	console.log("═══════════════════════════════════════════════════════════════\n");

	console.log(`🔗 Connecting to AdsPower profile: ${profileId}...\n`);

	let browser: Awaited<ReturnType<typeof connectToAdsPowerProfile>> | undefined;

	try {
		browser = await connectToAdsPowerProfile(profileId);
		console.log("✅ Connected to AdsPower browser successfully!\n");

		// Get browser info
		const version = await browser.version();
		console.log(`📌 Browser version: ${version}`);

		// Get pages
		const pages = await browser.pages();
		console.log(`📄 Open pages: ${pages.length}`);

		if (pages.length > 0) {
			const page = pages[0];
			const currentUrl = page.url();
			console.log(`🌐 Current URL: ${currentUrl}`);

			// Navigate to Instagram as a test
			console.log("\n🔄 Navigating to Instagram...");
			await page.goto("https://www.instagram.com", {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});

			const newUrl = page.url();
			console.log(`✅ Navigated to: ${newUrl}`);

			// Take a screenshot
			const screenshotPath = `screenshots/adspower_test_${Date.now()}.png`;
			await page.screenshot({ path: screenshotPath });
			console.log(`📸 Screenshot saved: ${screenshotPath}`);
		}

		console.log("\n═══════════════════════════════════════════════════════════════");
		console.log("                    TEST PASSED ✅");
		console.log("═══════════════════════════════════════════════════════════════\n");
	} catch (error) {
		console.error("❌ Connection failed:", error);
		process.exit(1);
	} finally {
		// Close the browser connection (but keep profile running)
		if (browser) {
			console.log("🔌 Disconnecting from browser...");
			browser.disconnect();
		}

		// Stop the AdsPower profile
		console.log(`🛑 Stopping AdsPower profile: ${profileId}...`);
		await stopAdsPowerProfile(profileId);
		console.log("✅ Profile stopped\n");
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});

