/**
 * Health check script for Scout system monitoring.
 *
 * Usage: tsx scripts/health_check.ts [--json]
 * Example: tsx scripts/health_check.ts --json
 */

import {
	getSystemHealth,
	formatHealthStatus,
} from "../functions/shared/health/health.ts";

async function healthCheck(): Promise<void> {
	const args = process.argv.slice(2);
	const jsonOutput = args.includes("--json");

	try {
		const health = await getSystemHealth();

		if (jsonOutput) {
			console.log(JSON.stringify(health, null, 2));
		} else {
			console.log(formatHealthStatus(health));
		}

		// Exit with appropriate code
		const exitCode =
			health.status === "pass" ? 0 : health.status === "warn" ? 1 : 2;
		process.exit(exitCode);
	} catch (error) {
		console.error("❌ Health check failed:", error);
		process.exit(2);
	}
}

healthCheck().catch(console.error);



