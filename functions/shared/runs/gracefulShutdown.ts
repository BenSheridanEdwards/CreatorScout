/**
 * Graceful Shutdown Handler for Run Tracking
 * Ensures runs are properly marked as completed/error when scripts exit
 */
import { updateRun, getCurrentRunId } from "./runs.js";

let isShuttingDown = false;

/**
 * Mark current run as error on shutdown
 */
async function handleShutdown(signal: string): Promise<void> {
	if (isShuttingDown) {
		return; // Prevent multiple shutdown handlers
	}
	isShuttingDown = true;

	const runId = getCurrentRunId();
	if (runId) {
		console.log(`\n📊 Gracefully closing run (${signal})...`);
		try {
			await updateRun(runId, {
				status: "error",
				errorMessage: `Script terminated by ${signal}`,
			});
			console.log("✅ Run status updated");
		} catch (error) {
			console.error("❌ Failed to update run status:", error);
		}
	}
}

/**
 * Register graceful shutdown handlers for a run
 */
export function setupGracefulShutdown(): void {
	// Handle Ctrl+C
	process.on("SIGINT", async () => {
		await handleShutdown("SIGINT");
		process.exit(130); // Standard exit code for SIGINT
	});

	// Handle kill command
	process.on("SIGTERM", async () => {
		await handleShutdown("SIGTERM");
		process.exit(143); // Standard exit code for SIGTERM
	});

	// Handle uncaught errors
	process.on("uncaughtException", async (error) => {
		console.error("\n❌ Uncaught Exception:", error);
		const runId = getCurrentRunId();
		if (runId && !isShuttingDown) {
			isShuttingDown = true;
			try {
				await updateRun(runId, {
					status: "error",
					errorMessage: `Uncaught exception: ${error.message}`,
				});
			} catch (updateError) {
				console.error("Failed to update run:", updateError);
			}
		}
		process.exit(1);
	});

	// Handle unhandled promise rejections
	process.on("unhandledRejection", async (reason) => {
		console.error("\n❌ Unhandled Rejection:", reason);
		const runId = getCurrentRunId();
		if (runId && !isShuttingDown) {
			isShuttingDown = true;
			try {
				const message =
					reason instanceof Error ? reason.message : String(reason);
				await updateRun(runId, {
					status: "error",
					errorMessage: `Unhandled rejection: ${message}`,
				});
			} catch (updateError) {
				console.error("Failed to update run:", updateError);
			}
		}
		process.exit(1);
	});
}

/**
 * Mark run as successfully completed
 */
export async function markRunComplete(
	stats?: {
		profilesProcessed?: number;
		creatorsFound?: number;
		errors?: number;
	},
): Promise<void> {
	const runId = getCurrentRunId();
	if (runId && !isShuttingDown) {
		await updateRun(runId, {
			status: "completed",
			...stats,
		});
	}
}

