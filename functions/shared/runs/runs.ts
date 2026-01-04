/**
 * Run Tracking System
 * Tracks each script execution with screenshots, logs, and metrics
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ErrorLog {
	timestamp: string;
	username?: string;
	message: string;
	stack?: string;
}

export interface RunIssue {
	type:
		| "rate_limit"
		| "high_error_rate"
		| "early_termination"
		| "low_discovery"
		| "oom"
		| "stack_trace"
		| "error_429";
	message: string;
	severity: "warning" | "critical";
	detectedAt: string;
	logLine?: number;
}

export interface CreatorFound {
	username: string;
	confidence: number;
	reason: string;
	timestamp: string;
	screenshotPath?: string;
}

export interface RunMetadata {
	id: string;
	scriptName: string;
	startTime: string;
	endTime?: string;
	status: "scheduled" | "running" | "completed" | "error";
	profilesProcessed: number;
	creatorsFound: number;
	errors: number;
	screenshots: string[];
	finalScreenshot?: string;
	errorMessage?: string;
	scheduledTime?: string;
	issues?: RunIssue[];
	profileId?: string;
	sessionType?: "morning" | "afternoon" | "evening";
	stats?: {
		duration?: number;
		avgProcessingTime?: number;
		successRate?: number;
	};
	errorLogs?: ErrorLog[];
	creatorsFoundList?: CreatorFound[];
}

const RUNS_DIR = join(process.cwd(), "runs");
const RUNS_INDEX_FILE = join(RUNS_DIR, "index.json");

/**
 * Ensure runs directory exists
 */
async function ensureRunsDir() {
	if (!existsSync(RUNS_DIR)) {
		await mkdir(RUNS_DIR, { recursive: true });
	}
}

/**
 * Generate a unique run ID
 */
export function generateRunId(scriptName: string): string {
	const timestamp = Date.now();
	return `${scriptName}_${timestamp}`;
}

/**
 * Create a new run
 */
export async function createRun(
	scriptName: string,
	runId?: string,
): Promise<string> {
	await ensureRunsDir();

	const id = runId || generateRunId(scriptName);
	const run: RunMetadata = {
		id,
		scriptName,
		startTime: new Date().toISOString(),
		status: "running",
		profilesProcessed: 0,
		creatorsFound: 0,
		errors: 0,
		screenshots: [],
	};

	// Save run metadata
	await writeFile(join(RUNS_DIR, `${id}.json`), JSON.stringify(run, null, 2));

	// Update index
	await updateRunsIndex(run);

	return id;
}

/**
 * Update an existing run
 */
export async function updateRun(
	runId: string,
	updates: Partial<RunMetadata>,
): Promise<void> {
	await ensureRunsDir();

	const runFile = join(RUNS_DIR, `${runId}.json`);
	if (!existsSync(runFile)) {
		console.error(`Run ${runId} not found`);
		return;
	}

	const runData = await readFile(runFile, "utf-8");
	const run: RunMetadata = JSON.parse(runData);

	const updatedRun = { ...run, ...updates };

	// Calculate stats if ending
	if (updates.status === "completed" || updates.status === "error") {
		updatedRun.endTime = new Date().toISOString();
		const duration =
			new Date(updatedRun.endTime).getTime() -
			new Date(updatedRun.startTime).getTime();
		updatedRun.stats = {
			...updatedRun.stats,
			duration: Math.round(duration / 1000), // seconds
			successRate: updatedRun.profilesProcessed
				? ((updatedRun.profilesProcessed - updatedRun.errors) /
						updatedRun.profilesProcessed) *
					100
				: 0,
		};

		// Detect issues when run completes
		const issues = await detectIssues(updatedRun);
		if (issues.length > 0) {
			updatedRun.issues = issues;
		}
	}

	await writeFile(runFile, JSON.stringify(updatedRun, null, 2));
	await updateRunsIndex(updatedRun);
}

/**
 * Add a screenshot to a run
 */
export async function addScreenshotToRun(
	runId: string,
	screenshotPath: string,
	isFinal = false,
): Promise<void> {
	await ensureRunsDir();

	const runFile = join(RUNS_DIR, `${runId}.json`);
	if (!existsSync(runFile)) {
		return;
	}

	const runData = await readFile(runFile, "utf-8");
	const run: RunMetadata = JSON.parse(runData);

	if (!run.screenshots.includes(screenshotPath)) {
		run.screenshots.push(screenshotPath);
	}

	if (isFinal) {
		run.finalScreenshot = screenshotPath;
	}

	await writeFile(runFile, JSON.stringify(run, null, 2));
}

/**
 * Get a run by ID
 */
export async function getRun(runId: string): Promise<RunMetadata | null> {
	await ensureRunsDir();

	const runFile = join(RUNS_DIR, `${runId}.json`);
	if (!existsSync(runFile)) {
		return null;
	}

	const runData = await readFile(runFile, "utf-8");
	return JSON.parse(runData);
}

/**
 * Get all runs
 */
export async function getAllRuns(): Promise<RunMetadata[]> {
	await ensureRunsDir();

	if (!existsSync(RUNS_INDEX_FILE)) {
		return [];
	}

	const indexData = await readFile(RUNS_INDEX_FILE, "utf-8");
	const runs: RunMetadata[] = JSON.parse(indexData);

	// Sort by start time, newest first
	return runs.sort(
		(a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
	);
}

/**
 * Detect issues in completed run by grepping log file
 */
export async function detectIssues(run: RunMetadata): Promise<RunIssue[]> {
	const issues: RunIssue[] = [];

	if (run.status !== "completed" && run.status !== "error") {
		return issues;
	}

	// Try to read the log file for this run
	const logsDir = join(process.cwd(), "logs");
	try {
		const logFiles = await readdir(logsDir);
		// Find the most recent log file
		const logFile = logFiles
			.filter((f) => f.startsWith("scout-") && f.endsWith(".log"))
			.sort()
			.reverse()[0];

		if (logFile) {
			const logPath = join(logsDir, logFile);
			const logContent = await readFile(logPath, "utf-8");
			const logLines = logContent.split("\n");

			// Grep for error patterns
			logLines.forEach((line, index) => {
				const lineNum = index + 1;
				const lowerLine = line.toLowerCase();

				// 429 Rate limits
				if (
					lowerLine.includes("429") ||
					lowerLine.includes("rate limit") ||
					lowerLine.includes("rate_limit")
				) {
					issues.push({
						type: "error_429",
						message: `Rate limit detected: ${line.substring(0, 100)}`,
						severity: "critical",
						detectedAt: new Date().toISOString(),
						logLine: lineNum,
					});
				}

				// Stack traces
				if (
					lowerLine.includes("error:") ||
					(lowerLine.includes("at ") && lowerLine.includes(":"))
				) {
					issues.push({
						type: "stack_trace",
						message: `Stack trace found: ${line.substring(0, 100)}`,
						severity: "warning",
						detectedAt: new Date().toISOString(),
						logLine: lineNum,
					});
				}

				// OOM errors
				if (
					lowerLine.includes("out of memory") ||
					lowerLine.includes("oom") ||
					lowerLine.includes("heap limit")
				) {
					issues.push({
						type: "oom",
						message: `Out of memory error: ${line.substring(0, 100)}`,
						severity: "critical",
						detectedAt: new Date().toISOString(),
						logLine: lineNum,
					});
				}

				// Early termination
				if (
					lowerLine.includes("sigint") ||
					lowerLine.includes("terminated") ||
					lowerLine.includes("killed")
				) {
					issues.push({
						type: "early_termination",
						message: `Early termination detected: ${line.substring(0, 100)}`,
						severity: "warning",
						detectedAt: new Date().toISOString(),
						logLine: lineNum,
					});
				}
			});
		}
	} catch (error) {
		// If we can't read logs, continue without log-based detection
		console.error("Failed to read logs for issue detection:", error);
	}

	// Calculate metrics-based issues
	if (run.profilesProcessed > 0) {
		// High error rate
		const errorRate = run.errors / run.profilesProcessed;
		if (errorRate > 0.1) {
			issues.push({
				type: "high_error_rate",
				message: `High error rate: ${(errorRate * 100).toFixed(1)}% (${run.errors}/${run.profilesProcessed})`,
				severity: "warning",
				detectedAt: new Date().toISOString(),
			});
		}

		// Low discovery rate
		const discoveryRate = run.creatorsFound / run.profilesProcessed;
		if (discoveryRate < 0.05) {
			issues.push({
				type: "low_discovery",
				message: `Low discovery rate: ${(discoveryRate * 100).toFixed(1)}% (${run.creatorsFound}/${run.profilesProcessed})`,
				severity: "warning",
				detectedAt: new Date().toISOString(),
			});
		}
	}

	return issues;
}

/**
 * Update the runs index
 */
async function updateRunsIndex(run: RunMetadata): Promise<void> {
	let runs: RunMetadata[] = [];

	if (existsSync(RUNS_INDEX_FILE)) {
		const indexData = await readFile(RUNS_INDEX_FILE, "utf-8");
		runs = JSON.parse(indexData);
	}

	// Update or add run
	const existingIndex = runs.findIndex((r) => r.id === run.id);
	if (existingIndex >= 0) {
		runs[existingIndex] = run;
	} else {
		runs.push(run);
	}

	// Keep only last 100 runs in index
	runs = runs.slice(-100);

	await writeFile(RUNS_INDEX_FILE, JSON.stringify(runs, null, 2));
}

/**
 * Get current run ID from environment
 */
export function getCurrentRunId(): string | null {
	return process.env.SCOUT_RUN_ID || null;
}

/**
 * Set current run ID in environment
 */
export function setCurrentRunId(runId: string): void {
	process.env.SCOUT_RUN_ID = runId;
}

/**
 * Add an error log to a run
 */
export async function addErrorToRun(
	runId: string,
	error: ErrorLog,
): Promise<void> {
	await ensureRunsDir();

	const runFile = join(RUNS_DIR, `${runId}.json`);
	if (!existsSync(runFile)) {
		return;
	}

	const runData = await readFile(runFile, "utf-8");
	const run: RunMetadata = JSON.parse(runData);

	if (!run.errorLogs) {
		run.errorLogs = [];
	}

	run.errorLogs.push(error);
	run.errors = run.errorLogs.length;

	await writeFile(runFile, JSON.stringify(run, null, 2));
	await updateRunsIndex(run);
}

/**
 * Add a creator found to a run
 */
export async function addCreatorToRun(
	runId: string,
	creator: CreatorFound,
): Promise<void> {
	await ensureRunsDir();

	const runFile = join(RUNS_DIR, `${runId}.json`);
	if (!existsSync(runFile)) {
		return;
	}

	const runData = await readFile(runFile, "utf-8");
	const run: RunMetadata = JSON.parse(runData);

	if (!run.creatorsFoundList) {
		run.creatorsFoundList = [];
	}

	run.creatorsFoundList.push(creator);
	run.creatorsFound = run.creatorsFoundList.length;

	await writeFile(runFile, JSON.stringify(run, null, 2));
	await updateRunsIndex(run);
}
