#!/usr/bin/env tsx
import {
	createRun,
	updateRun,
	addCreatorToRun,
	addErrorToRun,
	addScreenshotToRun,
} from "../functions/shared/runs/runs.js";

async function testEnhancedRun() {
	console.log("🧪 Creating enhanced test run with creators and errors...");
	const runId = await createRun("test_enhanced");
	console.log("✅ Run ID:", runId);

	// Simulate processing profiles
	await new Promise((r) => setTimeout(r, 500));

	// Add some creators
	console.log("✨ Adding creator #1...");
	await addCreatorToRun(runId, {
		username: "test_creator_1",
		confidence: 95,
		reason: "direct_patreon_link",
		timestamp: new Date().toISOString(),
		screenshotPath: "/screenshots/2025-12-24/profile_test_creator_1.png",
	});

	await updateRun(runId, {
		profilesProcessed: 5,
		creatorsFound: 1,
		errors: 0,
	});

	await new Promise((r) => setTimeout(r, 500));

	// Add an error
	console.log("❌ Adding error log #1...");
	await addErrorToRun(runId, {
		timestamp: new Date().toISOString(),
		username: "broken_profile",
		message: "Target closed: Session was terminated while processing",
		stack: `Error: Target closed
    at navigateToProfile (/functions/navigation/profileNavigation.ts:45:10)
    at analyzeProfileComprehensive (/functions/profile/profileAnalysis.ts:120:5)`,
	});

	await updateRun(runId, {
		profilesProcessed: 8,
		creatorsFound: 1,
		errors: 1,
	});

	await new Promise((r) => setTimeout(r, 500));

	// Add another creator
	console.log("✨ Adding creator #2...");
	await addCreatorToRun(runId, {
		username: "test_creator_2",
		confidence: 85,
		reason: "exclusive_content_in_bio",
		timestamp: new Date().toISOString(),
		screenshotPath: "/screenshots/2025-12-24/profile_test_creator_2.png",
	});

	await new Promise((r) => setTimeout(r, 500));

	// Add another error
	console.log("❌ Adding error log #2...");
	await addErrorToRun(runId, {
		timestamp: new Date().toISOString(),
		username: "rate_limited_profile",
		message: "429 Rate limit exceeded: free-models-per-day",
		stack: `APIError: 429 Rate limit exceeded
    at analyzeProfile (/functions/profile/vision/vision.ts:449:22)
    at analyzeProfileComprehensive (/functions/profile/profileAnalysis.ts:354:25)`,
	});

	await new Promise((r) => setTimeout(r, 500));

	// Add third creator
	console.log("✨ Adding creator #3...");
	await addCreatorToRun(runId, {
		username: "test_creator_3",
		confidence: 100,
		reason: "patreon_link_found",
		timestamp: new Date().toISOString(),
	});

	// Add some screenshots
	console.log("📸 Adding screenshots...");
	await addScreenshotToRun(
		runId,
		"/screenshots/2025-12-24/profile_test1.png",
	);
	await addScreenshotToRun(
		runId,
		"/screenshots/2025-12-24/profile_test2.png",
	);
	await addScreenshotToRun(
		runId,
		"/screenshots/2025-12-24/profile_test3.png",
		true, // Mark as final
	);

	// Mark complete
	await updateRun(runId, {
		status: "completed",
		profilesProcessed: 15,
		creatorsFound: 3,
		errors: 2,
	});

	console.log("✅ Enhanced test run created!");
	console.log("\n🎉 Go to Scout Studio and click 'Load runs' to see:");
	console.log("   ✨ 3 Creators with clickable Instagram links");
	console.log("   ❌ 2 Detailed error logs with stack traces");
	console.log("   📸 3 Screenshots");
	console.log("\nClick the run to open the modal!");
}

testEnhancedRun().catch(console.error);

