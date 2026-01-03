#!/usr/bin/env tsx
import { createRun, updateRun } from "../functions/shared/runs/runs.js";

async function testRun() {
	console.log("🧪 Creating test run...");
	const runId = await createRun("test_script");
	console.log("✅ Run ID:", runId);

	// Simulate progress
	await new Promise((r) => setTimeout(r, 1000));

	await updateRun(runId, {
		profilesProcessed: 10,
		creatorsFound: 2,
		errors: 0,
	});
	console.log("✅ Updated run with progress");

	// Simulate more progress
	await new Promise((r) => setTimeout(r, 1000));

	await updateRun(runId, {
		profilesProcessed: 25,
		creatorsFound: 5,
		errors: 1,
	});
	console.log("✅ Updated run again");

	// Mark complete
	await updateRun(runId, {
		status: "completed",
		profilesProcessed: 25,
		creatorsFound: 5,
		errors: 1,
	});
	console.log("✅ Marked run as completed");
	console.log("\n🎉 Test complete! Refresh Scout Studio and click 'Load runs'");
}

testRun().catch(console.error);
