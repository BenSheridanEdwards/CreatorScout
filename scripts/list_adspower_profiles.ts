/**
 * List AdsPower Profiles
 *
 * Lists all profiles available in AdsPower via the Local API.
 *
 * Usage:
 *   npx tsx scripts/list_adspower_profiles.ts
 *
 * Requirements:
 *   - AdsPower app must be running
 *   - Local API must be enabled (shows "Connection: Success" in AdsPower API settings)
 */

import { listAdsPowerProfiles } from "../functions/navigation/browser/adsPowerConnector.ts";

async function main(): Promise<void> {
	console.log("\n📋 Fetching AdsPower profiles...\n");

	// Directly list profiles (this also validates the API is working)
	let profiles: Awaited<ReturnType<typeof listAdsPowerProfiles>>;

	try {
		profiles = await listAdsPowerProfiles();
	} catch (error) {
		console.error("❌ Cannot connect to AdsPower API");
		console.error("");
		console.error("Make sure:");
		console.error("  1. AdsPower app is running");
		console.error("  2. Local API is enabled in AdsPower settings");
		console.error('  3. API shows "Connection: Success"');
		console.error("");
		console.error("Default API URL: http://127.0.0.1:50325");
		console.error(
			"You can override with ADSPOWER_API_BASE environment variable",
		);
		console.error("");
		console.error("Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	}

	if (profiles.length === 0) {
		console.log("No profiles found in AdsPower.");
		console.log("");
		console.log("Create profiles in AdsPower app first, then run this script.");
		return;
	}

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log("                     ADSPOWER PROFILES");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	for (const profile of profiles) {
		console.log(`📦 ${profile.name || "Unnamed"}`);
		console.log(`   ID: ${profile.user_id}`);
		console.log(`   Serial: ${profile.serial_number}`);
		console.log(`   Group: ${profile.group_name || "None"}`);

		if (profile.username) {
			console.log(`   Username: ${profile.username}`);
		}

		if (profile.ip) {
			console.log(`   IP: ${profile.ip} (${profile.ip_country || "unknown"})`);
		}

		if (profile.last_open_time) {
			console.log(`   Last opened: ${profile.last_open_time}`);
		}

		if (profile.remark) {
			console.log(`   Notes: ${profile.remark}`);
		}

		console.log("");
	}

	console.log(
		"═══════════════════════════════════════════════════════════════",
	);
	console.log(`Total: ${profiles.length} profile(s)`);
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	// Show example config
	console.log("📝 Example profiles.config.json entry:\n");
	const example = profiles[0];
	console.log(`{
  "id": "my-profile",
  "username": "instagram_username",
  "password": "instagram_password",
  "type": "burner",
  "adsPowerProfileId": "${example.user_id}",
  ...
}`);
	console.log("");
}

main().catch((error) => {
	console.error("Error:", error.message);
	process.exit(1);
});
