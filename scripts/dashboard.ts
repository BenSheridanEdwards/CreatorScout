/**
 * Dashboard script for real-time metrics visualization.
 *
 * Usage: tsx scripts/dashboard.ts [--watch interval_seconds]
 * Example: tsx scripts/dashboard.ts --watch 30
 */

import {
	getDashboardMetrics,
	formatDashboard,
} from "../functions/shared/dashboard/dashboard.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

async function showDashboard(): Promise<void> {
	const args = process.argv.slice(2);
	const watchIndex = args.indexOf("--watch");
	const watchMode = watchIndex !== -1;
	const intervalSeconds =
		watchIndex !== -1 && args[watchIndex + 1]
			? parseInt(args[watchIndex + 1])
			: 30;

	if (watchMode) {
		console.log(`📊 Scout Dashboard (updating every ${intervalSeconds}s)`);
		console.log("Press Ctrl+C to stop\n");
	}

	do {
		try {
			// Clear screen in watch mode
			if (watchMode) {
				console.clear();
			}

			const dashboard = await getDashboardMetrics();
			console.log(formatDashboard(dashboard));

			if (watchMode) {
				console.log(
					`\n⏰ Next update in ${intervalSeconds} seconds... (Ctrl+C to exit)`,
				);
				await sleep(intervalSeconds * 1000);
			}
		} catch (error) {
			console.error("❌ Dashboard error:", error);
			if (!watchMode) break;
			await sleep(5000); // Wait 5 seconds on error
		}
	} while (watchMode);
}

showDashboard().catch(console.error);

