#!/usr/bin/env tsx
/**
 * Test Graceful Shutdown
 * This script tests that runs are properly closed when interrupted
 */
import {
	createRun,
	setCurrentRunId,
	updateRun,
	addCreatorToRun,
	addErrorToRun,
} from "../functions/shared/runs/runs.js";
import { setupGracefulShutdown } from "../functions/shared/runs/gracefulShutdown.js";

async function testGracefulShutdown() {
	console.log("🧪 Testing Graceful Shutdown Handling\n");

	// Create a run
	const runId = await createRun("test_graceful_shutdown");
	setCurrentRunId(runId);
	setupGracefulShutdown();

	console.log("✅ Run created:", runId);
	console.log("📊 Graceful shutdown handlers registered\n");

	console.log("━".repeat(60));
	console.log("🎯 Simulating long-running script...");
	console.log("━".repeat(60));
	console.log("\n💡 TIP: Press Ctrl+C to interrupt this script");
	console.log("   The run should be marked as 'error' with proper message\n");

	// Simulate processing
	let processed = 0;
	const total = 100;

	for (let i = 0; i < total; i++) {
		processed++;

		// Update progress every 10 profiles
		if (processed % 10 === 0) {
			await updateRun(runId, {
				profilesProcessed: processed,
				creatorsFound: Math.floor(processed / 10),
				errors: Math.floor(processed / 20),
			});
			console.log(`📊 Progress: ${processed}/${total} profiles`);
		}

		// Randomly add a creator or error
		if (Math.random() < 0.1) {
			await addCreatorToRun(runId, {
				username: `creator_${processed}`,
				confidence: 80 + Math.floor(Math.random() * 20),
				reason: "test_detection",
				timestamp: new Date().toISOString(),
			});
			console.log(`   ✨ Found creator_${processed}`);
		} else if (Math.random() < 0.05) {
			await addErrorToRun(runId, {
				timestamp: new Date().toISOString(),
				username: `profile_${processed}`,
				message: "Simulated error for testing",
			});
			console.log(`   ❌ Error on profile_${processed}`);
		}

		// Wait a bit to simulate real processing
		await new Promise((r) => setTimeout(r, 500));
	}

	// If we get here (not interrupted), mark as completed
	await updateRun(runId, {
		status: "completed",
		profilesProcessed: processed,
	});

	console.log("\n✅ Script completed successfully");
	console.log("📊 Run marked as 'completed'");
	console.log("\nCheck Scout Studio to see the final run status!");
}

testGracefulShutdown().catch((error) => {
	console.error("\n❌ Script failed:", error);
	process.exit(1);
});

