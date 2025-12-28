/**
 * Setup test runs - delete old test runs and create new complete runs
 */
import { unlink, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import {
	createRun,
	updateRun,
	addScreenshotToRun,
	getAllRuns,
} from "../functions/shared/runs/runs.ts";

const RUNS_DIR = join(process.cwd(), "runs");
const RUNS_INDEX_FILE = join(RUNS_DIR, "index.json");

async function deleteOldTestRuns() {
	console.log("Deleting old test runs...");
	const oldRunIds = [
		"test_script_1766612329281",
		"test_enhanced_1766612494345",
		"test_graceful_shutdown_1766612668570",
	];

	for (const runId of oldRunIds) {
		const runFile = join(RUNS_DIR, `${runId}.json`);
		if (existsSync(runFile)) {
			await unlink(runFile);
			console.log(`Deleted ${runId}.json`);
		}
	}

	// Update index
	const indexData = await readFile(RUNS_INDEX_FILE, "utf-8");
	const runs = JSON.parse(indexData);
	const filteredRuns = runs.filter(
		(r: any) => !oldRunIds.includes(r.id),
	);
	await writeFile(RUNS_INDEX_FILE, JSON.stringify(filteredRuns, null, 2));
	console.log("Updated index.json");
}

async function createTestRuns() {
	console.log("Creating new test runs...");

	// Run 1: Successful discover run
	const run1Id = await createRun("discover", "discover_success_001");
	await updateRun(run1Id, {
		profileId: "burner1",
		status: "completed",
		profilesProcessed: 25,
		creatorsFound: 8,
		errors: 2,
		endTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
		stats: {
			duration: 1800, // 30 minutes
			successRate: 92,
		},
		creatorsFoundList: [
			{
				username: "creator1",
				confidence: 95,
				reason: "direct_patreon_link",
				timestamp: new Date(Date.now() - 3600000).toISOString(),
			},
			{
				username: "creator2",
				confidence: 88,
				reason: "exclusive_content_in_bio",
				timestamp: new Date(Date.now() - 3550000).toISOString(),
			},
		],
		finalScreenshot: "/screenshots/2025-12-28/discover_success.png",
		screenshots: [
			"/screenshots/2025-12-28/discover_success.png",
			"/screenshots/2025-12-28/discover_step1.png",
		],
	});
	console.log(`Created successful run: ${run1Id}`);

	// Run 2: Discover run with issues
	const run2Id = await createRun("discover", "discover_issues_002");
	await updateRun(run2Id, {
		profileId: "burner1",
		status: "completed",
		profilesProcessed: 15,
		creatorsFound: 2,
		errors: 5,
		endTime: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
		stats: {
			duration: 900, // 15 minutes
			successRate: 66.7,
		},
		errorLogs: [
			{
				timestamp: new Date(Date.now() - 1800000).toISOString(),
				username: "rate_limited_user",
				message: "429 Rate limit exceeded: free-models-per-day",
			},
		],
		issues: [
			{
				type: "rate_limit",
				message: "Rate limit exceeded during run",
				severity: "critical",
				detectedAt: new Date(Date.now() - 1800000).toISOString(),
			},
			{
				type: "high_error_rate",
				message: "High error rate: 5 errors out of 15 profiles processed",
				severity: "warning",
				detectedAt: new Date(Date.now() - 1800000).toISOString(),
			},
		],
		finalScreenshot: "/screenshots/2025-12-28/discover_issues.png",
		screenshots: ["/screenshots/2025-12-28/discover_issues.png"],
	});
	console.log(`Created run with issues: ${run2Id}`);

	// Run 3: Currently running discover run
	const run3Id = await createRun("discover", "discover_running_003");
	await updateRun(run3Id, {
		profileId: "burner1",
		status: "running",
		profilesProcessed: 12,
		creatorsFound: 4,
		errors: 1,
		screenshots: ["/screenshots/2025-12-28/discover_running.png"],
	});
	console.log(`Created running run: ${run3Id}`);

	console.log("All test runs created!");
}

async function main() {
	try {
		await deleteOldTestRuns();
		await createTestRuns();
		console.log("\n✅ Setup complete!");
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

main();

