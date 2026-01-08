/**
 * Production Startup Script
 *
 * Starts the Node scheduler and API server for VPS deployment.
 * This is the main entry point for Docker containers.
 *
 * Environment Variables:
 *   SCHEDULER_ENABLED=true     Enable automatic session scheduling
 *   SCHEDULER_TIMEZONE=...     Timezone for session scheduling
 *   PORT=4000                  API server port
 */

import { createLogger } from "../../functions/shared/logger/logger.ts";

const logger = createLogger();

async function main() {
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
	logger.info("STARTUP", "  Scout Instagram Automation - Production Mode");
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");

	const schedulerEnabled = process.env.SCHEDULER_ENABLED !== "false";
	const timezone = process.env.SCHEDULER_TIMEZONE || "Europe/London";

	logger.info("STARTUP", `Timezone: ${timezone}`);
	logger.info("STARTUP", `Scheduler: ${schedulerEnabled ? "ENABLED" : "DISABLED"}`);

	// Run database migrations
	logger.info("STARTUP", "Running database migrations...");
	try {
		const { execSync } = await import("node:child_process");
		execSync("npx prisma migrate deploy", { stdio: "inherit" });
		logger.info("STARTUP", "✓ Database migrations complete");
	} catch (error) {
		logger.error("STARTUP", `Database migration failed: ${error}`);
		// Continue anyway - migrations might already be applied
	}

	// Start the Node scheduler if enabled
	if (schedulerEnabled) {
		logger.info("STARTUP", "Starting Node scheduler...");
		try {
			const { startScheduler } = await import(
				"../../functions/scheduling/nodeScheduler.ts"
			);
			await startScheduler({
				timezone,
				enabled: true,
				catchUpMissedSessions: true,
				maxRetries: 2,
				retryDelayMinutes: 30,
			});
			logger.info("STARTUP", "✓ Node scheduler started");
		} catch (error) {
			logger.error("STARTUP", `Failed to start scheduler: ${error}`);
		}
	}

	// Import and start the API server
	logger.info("STARTUP", "Starting API server...");
	try {
		// The server.ts file starts itself when imported
		await import("../../server.ts");
		logger.info("STARTUP", "✓ API server started");
	} catch (error) {
		logger.error("STARTUP", `Failed to start server: ${error}`);
		process.exit(1);
	}

	// Set up graceful shutdown
	const shutdown = async (signal: string) => {
		logger.info("STARTUP", `Received ${signal}, shutting down gracefully...`);

		if (schedulerEnabled) {
			try {
				const { getNodeScheduler } = await import(
					"../../functions/scheduling/nodeScheduler.ts"
				);
				await getNodeScheduler().stop();
				logger.info("STARTUP", "✓ Scheduler stopped");
			} catch {
				// Ignore errors during shutdown
			}
		}

		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
	logger.info("STARTUP", "  Scout is running! Press Ctrl+C to stop.");
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
	logger.error("STARTUP", `Fatal error: ${error}`);
	process.exit(1);
});
