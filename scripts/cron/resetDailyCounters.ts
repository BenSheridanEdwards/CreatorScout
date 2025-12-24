/**
 * Reset Daily Counters
 *
 * Cron job to reset all profile counters at midnight.
 * Run via: 0 0 * * * tsx /path/to/scripts/cron/resetDailyCounters.ts
 */

import { createLogger } from "../../functions/shared/logger/logger.ts";
import {
	getActiveProfiles,
	getProfileStats,
	resetDailyCounters,
	updateProfileLimits,
} from "../../functions/shared/profiles/profileManager.ts";

const logger = createLogger(true);

async function main() {
	logger.info("CRON", "Running daily counter reset...");

	try {
		// Reset all profile counters
		await resetDailyCounters();
		logger.info("CRON", "Daily counters reset successfully");

		// Update profile limits (ramp-up)
		const profiles = await getActiveProfiles();
		for (const profile of profiles) {
			if (profile.type === "burner") {
				await updateProfileLimits(profile.id);
			}
		}
		logger.info(
			"CRON",
			`Updated limits for ${profiles.filter((p) => p.type === "burner").length} burner profiles`,
		);

		// Log stats
		const stats = await getProfileStats();
		logger.info(
			"CRON",
			`Profile stats: ${stats.active} active (${stats.mains} mains, ${stats.burners} burners), ${stats.archived} archived`,
		);
	} catch (error) {
		logger.error("CRON", `Failed to reset counters: ${error}`);
		process.exit(1);
	}
}
main()
	.then(() => {
		logger.info("CRON", "Daily reset completed");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("CRON", `Daily reset failed: ${error}`);
		process.exit(1);
	});
