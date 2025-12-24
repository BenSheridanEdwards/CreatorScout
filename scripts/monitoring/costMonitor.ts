/**
 * Cost Monitor Script
 *
 * Displays current and projected infrastructure costs.
 * Run: tsx scripts/monitoring/costMonitor.ts
 */
import {
	getCostBreakdown,
	getGlobalCostTracker,
	printCostBreakdown,
} from "../../functions/shared/costs/costTracker.ts";
import { createLogger } from "../../functions/shared/logger/logger.ts";
import { getProfileStats } from "../../functions/shared/profiles/profileManager.ts";

const logger = createLogger(true);

async function main() {
	logger.info("COSTS", "📊 Scout Cost Monitor");
	logger.info(
		"COSTS",
		"═══════════════════════════════════════════════════════════════",
	);

	try {
		// Get current profile stats
		const profileStats = await getProfileStats();

		logger.info(
			"COSTS",
			`Active profiles: ${profileStats.active} (${profileStats.mains} mains, ${profileStats.burners} burners)`,
		);
		logger.info("COSTS", `Archived profiles: ${profileStats.archived}`);

		// Update cost tracker with profile count
		const costTracker = getGlobalCostTracker();
		costTracker.setActiveProfiles(profileStats.active);

		// Get current usage stats
		const usage = costTracker.getUsageStats();
		const bandwidthMB = (usage.proxyBandwidthBytes / (1024 * 1024)).toFixed(2);

		logger.info("COSTS", "");
		logger.info("COSTS", "📈 Current Period Usage:");
		logger.info("COSTS", `   Proxy bandwidth: ${bandwidthMB} MB`);
		logger.info("COSTS", `   Vision API calls: ${usage.visionApiCalls}`);
		logger.info("COSTS", `   Session time: ${usage.sessionMinutes} minutes`);

		// Calculate costs for current scale
		const projection = costTracker.getScalingProjection(
			profileStats.active || 5,
		);

		logger.info("COSTS", "");
		logger.info("COSTS", "💰 Current Monthly Costs:");
		logger.info("COSTS", `   GoLogin:    $${projection.breakdown.gologin}`);
		logger.info("COSTS", `   VPS:        $${projection.breakdown.vps}`);
		logger.info("COSTS", `   Proxy:      $${projection.breakdown.proxy}`);
		logger.info(
			"COSTS",
			`   Vision API: $${projection.breakdown.visionApi.toFixed(2)}`,
		);
		logger.info("COSTS", `   ─────────────────────`);
		logger.info("COSTS", `   TOTAL:      $${projection.currentMonthly}/mo`);

		if (projection.recommendations.length > 0) {
			logger.info("COSTS", "");
			logger.info("COSTS", "💡 Recommendations:");
			for (const rec of projection.recommendations) {
				logger.info("COSTS", `   ${rec}`);
			}
		}

		// Show scaling projections
		logger.info("COSTS", "");
		logger.info("COSTS", "📊 Scaling Projections:");

		const breakdown = getCostBreakdown();
		logger.info(
			"COSTS",
			`   5 profiles:  $${breakdown.small.currentMonthly}/mo`,
		);
		logger.info(
			"COSTS",
			`   15 profiles: $${breakdown.medium.currentMonthly}/mo`,
		);
		logger.info(
			"COSTS",
			`   50 profiles: $${breakdown.large.currentMonthly}/mo`,
		);
	} catch (error) {
		logger.error("COSTS", `Error: ${error}`);

		// Still show cost breakdown even if we can't get profile stats
		logger.info("COSTS", "");
		logger.info("COSTS", "Showing general cost breakdown...");
		printCostBreakdown();
	}

	logger.info("COSTS", "");
	logger.info(
		"COSTS",
		"═══════════════════════════════════════════════════════════════",
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("Cost monitor failed:", error);
		process.exit(1);
	});

