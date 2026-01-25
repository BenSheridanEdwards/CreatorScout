/**
 * Production Startup Script
 *
 * Entry point for VPS/Docker deployment. Handles:
 * - Database migrations
 * - Profile validation
 * - Scheduler startup with graceful shutdown
 * - Crash recovery (running jobs reset to pending)
 * - Signal handling (SIGTERM, SIGINT, SIGHUP)
 *
 * Environment Variables:
 *   SCHEDULER_ENABLED=true     Enable automatic session scheduling
 *   SCHEDULER_TIMEZONE=...     Timezone for session scheduling
 *   PORT=4000                  API server port
 */

import { createLogger } from "../../functions/shared/logger/logger.ts";

const logger = createLogger();

// Track if we're shutting down to prevent double-shutdown
let isShuttingDown = false;

async function main() {
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
	logger.info("STARTUP", "  Scout Instagram Automation - Production Mode");
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");

	const schedulerEnabled = process.env.SCHEDULER_ENABLED !== "false";
	const timezone = process.env.SCHEDULER_TIMEZONE || "Europe/London";

	logger.info("STARTUP", `Timezone: ${timezone}`);
	logger.info("STARTUP", `Scheduler: ${schedulerEnabled ? "ENABLED" : "DISABLED"}`);
	logger.info("STARTUP", `PID: ${process.pid}`);

	// ─────────────────────────────────────────────────────────────────────────
	// 1. Database migrations
	// ─────────────────────────────────────────────────────────────────────────
	logger.info("STARTUP", "Running database migrations...");
	try {
		const { execSync } = await import("node:child_process");
		execSync("npx prisma migrate deploy", { stdio: "pipe" });
		logger.info("STARTUP", "✓ Database migrations complete");
	} catch (error) {
		// Not fatal—might already be migrated, or using SQLite without migrations
		logger.warn("STARTUP", `Migration skipped: ${error instanceof Error ? error.message : error}`);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 2. Validate profiles exist
	// ─────────────────────────────────────────────────────────────────────────
	logger.info("STARTUP", "Checking profiles...");
	try {
		const { getActiveProfiles } = await import(
			"../../functions/shared/profiles/profileManager.ts"
		);
		const profiles = await getActiveProfiles();

		if (profiles.length === 0) {
			logger.warn("STARTUP", "⚠ No active profiles found!");
			logger.warn("STARTUP", "  Add profiles to profiles.config.json or database");
			logger.warn("STARTUP", "  Scheduler will wait for profiles to be added");
		} else {
			logger.info("STARTUP", `✓ Found ${profiles.length} active profile(s):`);
			for (const p of profiles) {
				logger.info("STARTUP", `   - ${p.id} (@${p.username}) [${p.type}]`);
			}
		}
	} catch (error) {
		logger.warn("STARTUP", `Could not load profiles: ${error}`);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 3. Start scheduler (handles crash recovery internally)
	// ─────────────────────────────────────────────────────────────────────────
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
				retryJitterMinutes: 5,
				checkIntervalMinutes: 5,
			});
			logger.info("STARTUP", "✓ Node scheduler started");

			// Log next scheduled job
			const { getNodeScheduler } = await import(
				"../../functions/scheduling/nodeScheduler.ts"
			);
			const status = await getNodeScheduler().getStatus();
			if (status.nextJob) {
				logger.info(
					"STARTUP",
					`   Next job: ${status.nextJob.profileId} ${status.nextJob.sessionType} at ${status.nextJob.scheduledTime.toISOString()}`
				);
			}
		} catch (error) {
			logger.error("STARTUP", `Failed to start scheduler: ${error}`);
			// Don't exit—API server can still run for manual operations
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 4. Start API server
	// ─────────────────────────────────────────────────────────────────────────
	logger.info("STARTUP", "Starting API server...");
	try {
		await import("../../server.ts");
		logger.info("STARTUP", "✓ API server started");
	} catch (error) {
		logger.error("STARTUP", `Failed to start server: ${error}`);
		process.exit(1);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// 5. Graceful shutdown handler
	// ─────────────────────────────────────────────────────────────────────────
	const shutdown = async (signal: string) => {
		if (isShuttingDown) {
			logger.warn("STARTUP", "Shutdown already in progress, forcing exit...");
			process.exit(1);
		}
		isShuttingDown = true;

		logger.info("STARTUP", `Received ${signal}, shutting down gracefully...`);

		// Give running jobs max 2 minutes to finish
		const SHUTDOWN_TIMEOUT_MS = 2 * 60 * 1000;
		const shutdownTimer = setTimeout(() => {
			logger.error("STARTUP", "Shutdown timeout exceeded, forcing exit");
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		if (schedulerEnabled) {
			try {
				const { getNodeScheduler } = await import(
					"../../functions/scheduling/nodeScheduler.ts"
				);
				const scheduler = getNodeScheduler();
				const status = await scheduler.getStatus();

				if (status.runningJobs > 0) {
					logger.info("STARTUP", `Waiting for ${status.runningJobs} running job(s)...`);
				}

				await scheduler.stop();
				logger.info("STARTUP", "✓ Scheduler stopped");
			} catch (error) {
				logger.warn("STARTUP", `Scheduler stop error: ${error}`);
			}
		}

		clearTimeout(shutdownTimer);
		logger.info("STARTUP", "Goodbye!");
		process.exit(0);
	};

	// Handle termination signals
	process.on("SIGTERM", () => void shutdown("SIGTERM")); // Docker/systemd stop
	process.on("SIGINT", () => void shutdown("SIGINT"));   // Ctrl+C
	// SIGHUP: Logger writes to stdout—PM2/Docker handle file rotation. Nothing to do.

	// ─────────────────────────────────────────────────────────────────────────
	// 6. Uncaught exception handlers (bail clean, let Docker restart)
	// ─────────────────────────────────────────────────────────────────────────
	process.on("uncaughtException", (error) => {
		logger.error("STARTUP", `Uncaught exception: ${error.message}`);
		logger.error("STARTUP", error.stack || "No stack trace");
		// Poisoned process—shut down clean, let Docker/PM2 restart fresh
		void shutdown("uncaughtException");
	});

	process.on("unhandledRejection", (reason) => {
		logger.error("STARTUP", `Unhandled rejection: ${reason}`);
		// Poisoned process—shut down clean, let Docker/PM2 restart fresh
		void shutdown("unhandledRejection");
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Ready
	// ─────────────────────────────────────────────────────────────────────────
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
	logger.info("STARTUP", "  Scout is running! Press Ctrl+C to stop.");
	logger.info("STARTUP", "═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
	logger.error("STARTUP", `Fatal startup error: ${error}`);
	process.exit(1);
});
