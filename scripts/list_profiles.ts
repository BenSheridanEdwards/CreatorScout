/**
 * List Profiles Script
 *
 * Shows all profiles loaded from profiles.config.json
 *
 * Usage:
 *   tsx scripts/list_profiles.ts
 */

import {
	getGlobalSettings,
	listProfiles,
} from "../functions/shared/profiles/profileLoader.ts";

function main() {
	try {
		listProfiles();

		// Show global settings
		const settings = getGlobalSettings();
		console.log("⚙️  Global Settings:\n");
		console.log(`   Warmup: ${settings.warmupMinutes}min`);
		console.log(`   Engagement Ratio: ${settings.engagementRatio}:1`);
		console.log(`   Session Stagger: ${settings.sessionStaggerMinutes}min`);
		console.log(`   DM Strategy: ${settings.dmStrategy}`);
		console.log(
			`   Vision AI: ${settings.enableVisionAI ? "enabled" : "disabled"}`,
		);
		console.log(
			`   Weekly Variance: ${settings.weeklyScheduleVariance ? "yes" : "no"}`,
		);
		console.log("");
	} catch (error) {
		console.error(
			"❌ Error:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

main();
