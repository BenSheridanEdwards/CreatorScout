/**
 * Ramp-Up Limits
 *
 * Cron job to update burner DM limits based on account age.
 * Run via: 0 1 *\/3 * * tsx /path/to/scripts/cron/rampUpLimits.ts
 */

import { createLogger } from "../../functions/shared/logger/logger.ts";
import {
	getActiveProfiles,
	updateProfileLimits,
} from "../../functions/shared/profiles/profileManager.ts";

const logger = createLogger(true);

async function main() {
	logger.info("CRON", "Running ramp-up limits update...");

	const profiles = await getActiveProfiles();
	const burners = profiles.filter((p) => p.type === "burner");

	for (const profile of burners) {
		await updateProfileLimits(profile.id);
	}

	logger.info("CRON", `Updated limits for ${burners.length} burner profile(s)`);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		logger.error("CRON", `Ramp-up update failed: ${error}`);
		process.exit(1);
	});
