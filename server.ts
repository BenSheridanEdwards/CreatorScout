import { spawn } from "node:child_process";
import { createReadStream, existsSync, writeFile } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import { extname, join } from "node:path";
import { WebSocketServer } from "ws";
import {
	ADSPOWER_API_KEY,
	BROWSERLESS_TOKEN,
	LOCAL_BROWSER,
} from "./functions/shared/config/config.ts";
import { getPrismaClient } from "./functions/shared/database/database.ts";
import {
	createRun,
	getAllRuns,
	getRun,
	updateRun,
} from "./functions/shared/runs/runs.ts";

const PORT = Number(process.env.PORT) || 4000;

type ScriptName =
	| "discover"
	| "analyze"
	| "follow"
	| "dm"
	| "inbox"
	| "process"
	| "health"
	| "dashboard";

const validScripts: Record<ScriptName, string> = {
	discover: "scripts/discover.ts",
	analyze: "scripts/analyze_profile.ts",
	follow: "scripts/follow_user.ts",
	dm: "scripts/dm_user.ts",
	inbox: "scripts/open_inbox.ts",
	process: "scripts/process_profiles.ts",
	health: "scripts/health_check.ts",
	dashboard: "scripts/dashboard.ts",
};

interface RecordingState {
	enabled: boolean;
}

const recordingState: RecordingState = {
	enabled: false,
};

interface Screenshot {
	username: string;
	type: "profile" | "link" | "dm" | "error" | "debug" | "unknown";
	date: string;
	path: string;
	filename: string;
}

/**
 * Parse screenshot filename to extract metadata
 * Format: profile_username-timestamp.png
 *         link_analysis_username-timestamp.png
 *         dm_username-timestamp.png
 *         error_*_*-timestamp.png (error screenshots)
 */
function parseScreenshotFilename(filename: string): Partial<Screenshot> | null {
	// Match debug screenshots: dm_profile_debug_username-timestamp.png
	// These are debug screenshots taken during DM navigation, categorize as debug
	const debugMatch = filename.match(/^dm_profile_debug_([^-]+)-(\d+)\.png$/);
	if (debugMatch) {
		const [, username, timestamp] = debugMatch;
		const date = new Date(parseInt(timestamp, 10));

		return {
			username,
			type: "debug",
			date: date.toISOString(),
		};
	}

	// Match DM proof screenshots (only two cases):
	// 1. dm_username-timestamp.png - proof when a new DM has been sent
	// 2. dm_skipped_existing_username-timestamp.png - proof when thread already has messages
	const dmProofMatch = filename.match(
		/^dm_(skipped_existing_)?([^-]+)-(\d+)\.png$/,
	);
	if (dmProofMatch) {
		const [, , username, timestamp] = dmProofMatch;
		const date = new Date(parseInt(timestamp, 10));

		return {
			username,
			type: "dm",
			date: date.toISOString(),
		};
	}

	// Match discovery-related screenshots (profile, link_analysis)
	const discoveryMatch = filename.match(
		/(profile|link_analysis)_([^-]+)-(\d+)\.png$/,
	);
	if (discoveryMatch) {
		const [, type, username, timestamp] = discoveryMatch;
		const date = new Date(parseInt(timestamp, 10));

		return {
			username,
			type: type === "link_analysis" ? "link" : "profile",
			date: date.toISOString(),
		};
	}

	// Match error screenshots: error_*_*-timestamp.png
	const errorMatch = filename.match(/^error_(.+?)_(.+?)-(\d+)\.png$/);
	if (errorMatch) {
		const [, , reason, timestamp] = errorMatch;
		const date = new Date(parseInt(timestamp, 10));
		// Extract username from reason if possible
		const usernameMatch = reason.match(/([a-zA-Z0-9._]+)/);
		const username = usernameMatch ? usernameMatch[1] : "unknown";

		return {
			username,
			type: "error",
			date: date.toISOString(),
		};
	}

	// Return null for other screenshot types (follow, bio_validation, etc.)
	return null;
}

/**
 * Recursively scan screenshots directory
 */
async function scanScreenshots(): Promise<Screenshot[]> {
	const screenshots: Screenshot[] = [];
	const screenshotsDir = join(process.cwd(), "screenshots");

	async function scan(dir: string, relativePath = "") {
		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);
				const relPath = join(relativePath, entry.name);

				if (entry.isDirectory()) {
					await scan(fullPath, relPath);
				} else if (entry.name.endsWith(".png")) {
					const metadata = parseScreenshotFilename(entry.name);
					// Include discovery-related screenshots (profile, link_analysis, dm) and error screenshots
					// Filter out other types (follow, bio_validation, etc.)
					if (!metadata) {
						continue;
					}
					const stats = await stat(fullPath);

					screenshots.push({
						...metadata,
						date: metadata.date || stats.mtime.toISOString(),
						path: `/screenshots/${relPath.replace(/\\/g, "/")}`,
						filename: entry.name,
					} as Screenshot);
				}
			}
		} catch {
			// Silently skip directories we can't read
		}
	}

	await scan(screenshotsDir);
	return screenshots;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
	const body = JSON.stringify(data);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(body),
	});
	res.end(body);
}

async function handleApi(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

	// Debug logging for PATCH requests to /api/creators
	if (req.method === "PATCH" && url.pathname.startsWith("/api/creators/")) {
		// eslint-disable-next-line no-console
		console.log(
			`[API DEBUG] PATCH ${url.pathname}, endsWith /hide: ${url.pathname.endsWith("/hide")}, endsWith /dm: ${url.pathname.endsWith("/dm")}`,
		);
		// eslint-disable-next-line no-console
		console.log(`[API DEBUG] Full URL: ${req.url}, pathname: ${url.pathname}`);
	}

	if (req.method === "GET" && url.pathname === "/api/health") {
		sendJson(res, 200, { ok: true, ts: Date.now() });
		return;
	}

	// Detailed health check endpoint
	if (req.method === "GET" && url.pathname === "/api/health/detailed") {
		try {
			const { checkHealth, getRecentAlerts } = await import(
				"./functions/shared/health/healthMonitor.ts"
			);
			const health = await checkHealth();
			const alerts = getRecentAlerts(10);
			sendJson(res, health.healthy ? 200 : 503, {
				...health,
				recentAlerts: alerts,
			});
		} catch (error) {
			sendJson(res, 503, { healthy: false, error: String(error) });
		}
		return;
	}

	// Scheduler status endpoint
	if (req.method === "GET" && url.pathname === "/api/scheduler/status") {
		try {
			const { getNodeScheduler } = await import(
				"./functions/scheduling/nodeScheduler.ts"
			);
			const scheduler = getNodeScheduler();
			const status = await scheduler.getStatus();
			const todayJobs = scheduler.getTodayJobs();
			sendJson(res, 200, { ...status, todayJobs });
		} catch (error) {
			sendJson(res, 500, {
				error: "Scheduler not initialized",
				details: String(error),
			});
		}
		return;
	}

	// Trigger manual schedule generation endpoint
	if (req.method === "POST" && url.pathname === "/api/scheduler/generate") {
		try {
			const { getNodeScheduler } = await import(
				"./functions/scheduling/nodeScheduler.ts"
			);
			const scheduler = getNodeScheduler();
			await scheduler.generateDailySchedule();
			const status = await scheduler.getStatus();
			const todayJobs = scheduler.getTodayJobs();
			sendJson(res, 200, {
				success: true,
				message: `Generated schedule: ${todayJobs.length} jobs for today`,
				jobs: todayJobs.length,
				nextJob: status.nextJob,
			});
		} catch (error) {
			sendJson(res, 500, {
				error: "Failed to generate schedule",
				details: String(error),
			});
		}
		return;
	}

	// Trigger manual session endpoint
	if (req.method === "POST" && url.pathname === "/api/scheduler/run") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}") as {
					profileId?: string;
					sessionType?: string;
					sendDMs?: boolean; // If true, send DMs (default: false = discovery only)
				};

				if (!parsed.profileId) {
					sendJson(res, 400, { error: "profileId required" });
					return;
				}

				const sessionType = (parsed.sessionType || "morning") as
					| "morning"
					| "afternoon"
					| "evening";
				const sendDMs = parsed.sendDMs ?? false; // Default: discovery only (no DMs)

				const { getNodeScheduler } = await import(
					"./functions/scheduling/nodeScheduler.ts"
				);
				const scheduler = getNodeScheduler();

				// Fire and forget - don't wait for session to complete
				void scheduler.forceRunJob(parsed.profileId, sessionType, sendDMs);

				const mode = sendDMs ? "with DMs" : "discovery-only";
				sendJson(res, 200, {
					success: true,
					message: `Started ${sessionType} session for ${parsed.profileId} [${mode}]`,
				});
			} catch (error) {
				sendJson(res, 500, {
					error: "Failed to trigger session",
					details: String(error),
				});
			}
		});
		return;
	}

	// Proxy usage endpoint
	if (req.method === "GET" && url.pathname === "/api/proxy/usage") {
		try {
			const { getTodayProxyUsage, estimateMonthlyProxyCost } = await import(
				"./functions/shared/proxy/proxyOptimizer.ts"
			);
			const today = await getTodayProxyUsage();
			const monthly = await estimateMonthlyProxyCost();
			sendJson(res, 200, { today, monthly });
		} catch (error) {
			sendJson(res, 500, {
				error: "Failed to get proxy usage",
				details: String(error),
			});
		}
		return;
	}

	// Data quality monitoring endpoint
	if (req.method === "GET" && url.pathname === "/api/data-quality") {
		try {
			const { checkDataQuality } = await import(
				"./functions/shared/database/dataQualityMonitor.ts"
			);
			const report = await checkDataQuality();
			sendJson(res, 200, report);
		} catch (error) {
			sendJson(res, 500, {
				error: "Failed to check data quality",
				details: String(error),
			});
		}
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/stats") {
		try {
			const prisma = getPrismaClient();

			// Get total visible creators (excluding hidden) - matches CreatorsTable
			const creatorsFound = await prisma.profile.count({
				where: { isCreator: true, hidden: false },
			});

			// Get total DMs sent to creators (only count DMs sent to visible creators)
			const dmsSent = await prisma.profile.count({
				where: {
					dmSent: true,
					isCreator: true,
					hidden: false, // Only count DMs to visible creators
				},
			});

			sendJson(res, 200, {
				creatorsFound,
				dmsSent,
			});
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error("Failed to load stats:", error);
			sendJson(res, 500, { error: "Failed to load stats" });
		}
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/env/connection") {
		const usingLocal = Boolean(LOCAL_BROWSER);
		const hasBrowserless = Boolean(BROWSERLESS_TOKEN);
		const hasAdsPower = Boolean(ADSPOWER_API_KEY);
		const provider = usingLocal
			? "local"
			: hasAdsPower
				? "adspower"
				: hasBrowserless
					? "browserless"
					: "unknown";

		sendJson(res, 200, {
			provider,
			localBrowser: usingLocal,
			adsPowerConfigured: hasAdsPower,
			browserlessConfigured: hasBrowserless,
		});
		return;
	}

	if (req.method === "POST" && url.pathname.startsWith("/api/scripts/")) {
		const [, , , scriptName, action] = url.pathname.split("/");
		if (action !== "start") {
			sendJson(res, 400, { error: "Unsupported action" });
			return;
		}

		if (!scriptName || !(scriptName in validScripts)) {
			sendJson(res, 404, { error: "Unknown script" });
			return;
		}

		// Create a run for this script execution
		const runId = await createRun(scriptName);

		const tsCommand = process.env.TSX_PATH || "tsx";
		const scriptPath = validScripts[scriptName as ScriptName];

		const child = spawn(tsCommand, [scriptPath], {
			stdio: "inherit",
			env: {
				...process.env,
				SCOUT_RUN_ID: runId, // Pass run ID to script
			},
		});

		child.on("error", (err) => {
			// eslint-disable-next-line no-console
			console.error("Failed to start script", scriptName, err);
			// Mark run as error
			void updateRun(runId, {
				status: "error",
				errorMessage: err.message,
			});
		});

		child.on("exit", (code) => {
			// Update run status on exit
			void updateRun(runId, {
				status: code === 0 ? "completed" : "error",
				errorMessage: code !== 0 ? `Exited with code ${code}` : undefined,
			});
		});

		const startedAt = new Date().toISOString();
		sendJson(res, 200, { script: scriptName, startedAt, runId });
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/session/screenshot") {
		try {
			// Serve most recent snapshot from tmp using existing snapshot utility convention
			const tmpDir = join(process.cwd(), "tmp");
			const files = await readDirSortedByMtime(tmpDir);
			const latestPng = files.find((f) => extname(f.name) === ".png");
			if (!latestPng) {
				res.writeHead(204);
				res.end();
				return;
			}
			const filePath = join(tmpDir, latestPng.name);
			const fileStat = await stat(filePath);
			res.writeHead(200, {
				"Content-Type": "image/png",
				"Content-Length": fileStat.size,
			});
			createReadStream(filePath).pipe(res);
		} catch {
			res.writeHead(204);
			res.end();
		}
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/session/live-url") {
		try {
			const file = await readFile(
				join(process.cwd(), "tmp", "live-session-url.json"),
				"utf8",
			);
			const parsed = JSON.parse(file) as { liveURL?: string; ts?: number };
			if (!parsed.liveURL) {
				sendJson(res, 204, {});
				return;
			}
			sendJson(res, 200, { liveURL: parsed.liveURL, ts: parsed.ts });
		} catch {
			sendJson(res, 204, {});
		}
		return;
	}

	if (req.method === "GET" && url.pathname === "/api/logs") {
		const limitParam = url.searchParams.get("limit");
		const limit = limitParam ? Number.parseInt(limitParam, 10) || 200 : 200;
		const cycleIdParam = url.searchParams.get("cycleId");
		const startTimeParam = url.searchParams.get("startTime");
		const endTimeParam = url.searchParams.get("endTime");
		try {
			const logsDir = join(process.cwd(), "logs");
			const file = await getLatestLogFile(logsDir);
			if (!file) {
				sendJson(res, 200, { entries: [] });
				return;
			}
			const content = await readFile(join(logsDir, file), "utf8");
			const lines = content
				.split("\n")
				.map((l) => l.trim())
				.filter((l) => l.length > 0);

			// Parse all log entries
			const allEntries = lines.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return { raw: line };
				}
			});

			// Filter by cycleId if provided
			let filteredEntries = allEntries;
			if (cycleIdParam) {
				filteredEntries = allEntries.filter((entry) => {
					// Check if cycleId matches in entry.cycleId or entry.data?.cycleId
					return (
						entry.cycleId === cycleIdParam ||
						entry.data?.cycleId === cycleIdParam
					);
				});
			}

			// Filter by time window if provided (for run-scoped logs)
			if (startTimeParam || endTimeParam) {
				const startTime = startTimeParam
					? new Date(startTimeParam).getTime()
					: 0;
				const endTime = endTimeParam
					? new Date(endTimeParam).getTime()
					: Date.now();

				filteredEntries = filteredEntries.filter((entry) => {
					if (!entry.timestamp) return false;
					const entryTime = new Date(entry.timestamp).getTime();
					return entryTime >= startTime && entryTime <= endTime;
				});
			}

			// Apply limit (take last N entries)
			const entries = filteredEntries.slice(-limit);
			sendJson(res, 200, { file, entries });
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error("Failed to read logs for /api/logs:", err);
			sendJson(res, 500, { error: "Failed to read logs" });
		}
		return;
	}

	if (url.pathname === "/api/session/recording" && req.method === "POST") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			try {
				const parsed = JSON.parse(body || "{}") as { enable?: boolean };
				if (typeof parsed.enable === "boolean") {
					recordingState.enabled = parsed.enable;
				}
				sendJson(res, 200, { recording: recordingState.enabled });
			} catch {
				sendJson(res, 400, { error: "Invalid JSON" });
			}
		});
		return;
	}

	if (url.pathname === "/api/session/recording" && req.method === "GET") {
		sendJson(res, 200, { recording: recordingState.enabled });
		return;
	}

	if (url.pathname === "/api/screenshots" && req.method === "GET") {
		try {
			const screenshots = await scanScreenshots();
			sendJson(res, 200, screenshots);
		} catch {
			sendJson(res, 500, { error: "Failed to load screenshots" });
		}
		return;
	}

	if (url.pathname === "/api/runs" && req.method === "GET") {
		try {
			const runs = await getAllRuns();
			
			// Enrich runs with database metrics if stats are missing
			const prisma = getPrismaClient();
			const enrichedRuns = await Promise.all(
				runs.map(async (run) => {
					// If run already has complete stats, return as-is
					if (
						run.profilesProcessed > 0 ||
						(run.dmsSent !== undefined && run.profilesChecked !== undefined)
					) {
						return run;
					}

					// Try to find metrics for this run by sessionId (run.id)
					try {
						// @ts-expect-error - Metric table exists
						const metrics = await prisma.metric.findMany({
							where: {
								sessionId: run.id,
							},
							orderBy: {
								createdAt: "desc",
							},
							take: 1,
						});

						if (metrics.length > 0) {
							const metric = metrics[0];
							return {
								...run,
								profilesProcessed: metric.profilesVisited || run.profilesProcessed || 0,
								creatorsFound: metric.creatorsFound || run.creatorsFound || 0,
								dmsSent: metric.dmsSent || run.dmsSent || 0,
								profilesChecked: metric.profilesVisited || run.profilesChecked || 0,
							};
						}
					} catch {
						// If metrics lookup fails, return run as-is
					}

					return run;
				}),
			);

			sendJson(res, 200, enrichedRuns);
		} catch {
			sendJson(res, 500, { error: "Failed to load runs" });
		}
		return;
	}

	if (url.pathname.startsWith("/api/runs/") && req.method === "GET") {
		const runId = url.pathname.split("/")[3];
		if (!runId) {
			sendJson(res, 400, { error: "Run ID required" });
			return;
		}

		try {
			const run = await getRun(runId);
			if (!run) {
				sendJson(res, 404, { error: "Run not found" });
				return;
			}
			sendJson(res, 200, run);
		} catch {
			sendJson(res, 500, { error: "Failed to load run" });
		}
		return;
	}

	// GET /api/creators - Fetch confirmed creators with pagination/filtering
	if (url.pathname === "/api/creators" && req.method === "GET") {
		const page = parseInt(url.searchParams.get("page") || "1", 10);
		const limit = parseInt(url.searchParams.get("limit") || "50", 10);
		const dmFilter = url.searchParams.get("dmFilter") || "all";
		const maxFollowers = url.searchParams.get("maxFollowers");

		try {
			const prisma = getPrismaClient();

			// Build where clause
			const where: {
				isCreator: boolean;
				dmSent?: boolean;
				hidden?: boolean;
				followers?: { lte: number } | null;
				OR?: Array<{ followers: { lte: number } } | { followers: null }>;
			} = {
				isCreator: true,
				hidden: false, // Exclude hidden creators by default
			};
			if (dmFilter === "pending") {
				where.dmSent = false;
			} else if (dmFilter === "sent") {
				where.dmSent = true;
			}
			if (maxFollowers) {
				// Include creators with null followers OR followers <= maxFollowers
				where.OR = [
					{ followers: { lte: parseInt(maxFollowers, 10) } },
					{ followers: null },
				];
			}

			// Get total count for current filter
			const total = await prisma.profile.count({ where });

			// Get pending DM count (always useful to show, excluding hidden)
			const pendingCount = await prisma.profile.count({
				where: { isCreator: true, dmSent: false, hidden: false },
			});

			// Get paginated creators
			const creators = await prisma.profile.findMany({
				where,
				select: {
					username: true,
					bioText: true,
					confidence: true,
					manualOverride: true,
					dmSent: true,
					dmSentAt: true,
					dmSentBy: true,
					visitedAt: true,
					followers: true,
					hidden: true,
					hiddenAt: true,
				},
				orderBy: { visitedAt: "desc" },
				skip: (page - 1) * limit,
				take: limit,
			});

			const totalPages = Math.ceil(total / limit);

			sendJson(res, 200, {
				creators,
				total,
				pendingCount,
				page,
				totalPages,
			});
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error("Failed to load creators:", error);
			sendJson(res, 500, { error: "Failed to load creators" });
		}
		return;
	}

	// PATCH /api/creators/:username/hide - Toggle hidden status (strike off)
	// Check this BEFORE the /dm route to avoid conflicts
	if (
		req.method === "PATCH" &&
		url.pathname.startsWith("/api/creators/") &&
		url.pathname.endsWith("/hide")
	) {
		const pathParts = url.pathname.split("/");
		const username = pathParts[3];

		// eslint-disable-next-line no-console
		console.log(
			`[API] Hide request for: ${username}, pathname: ${url.pathname}`,
		);

		if (!username) {
			sendJson(res, 400, { error: "Username required" });
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}") as { hidden?: boolean };
				if (typeof parsed.hidden !== "boolean") {
					sendJson(res, 400, { error: "hidden boolean required" });
					return;
				}

				const prisma = getPrismaClient();
				const updated = await prisma.profile.update({
					where: { username },
					data: {
						hidden: parsed.hidden,
						hiddenAt: parsed.hidden ? new Date() : null,
					},
					select: {
						username: true,
						hidden: true,
						hiddenAt: true,
					},
				});

				// eslint-disable-next-line no-console
				console.log(
					`[API] Successfully updated hidden status for ${username}:`,
					updated,
				);
				sendJson(res, 200, updated);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error("Failed to update hidden status:", error);
				sendJson(res, 500, { error: "Failed to update hidden status" });
			}
		});
		return;
	}

	// PATCH /api/creators/:username/dm-sent-by - Update DM sent by username
	if (
		url.pathname.startsWith("/api/creators/") &&
		url.pathname.endsWith("/dm-sent-by") &&
		req.method === "PATCH"
	) {
		const pathParts = url.pathname.split("/");
		const username = pathParts[3];

		if (!username) {
			sendJson(res, 400, { error: "Username required" });
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}") as { dmSentBy?: string | null };
				// Allow null, undefined, or string values
				if (
					parsed.dmSentBy !== null &&
					parsed.dmSentBy !== undefined &&
					typeof parsed.dmSentBy !== "string"
				) {
					sendJson(res, 400, { error: "dmSentBy must be a string or null" });
					return;
				}

				const prisma = getPrismaClient();
				const updated = await prisma.profile.update({
					where: { username },
					data: {
						dmSentBy: parsed.dmSentBy || null,
					},
					select: {
						username: true,
						dmSentBy: true,
					},
				});

				sendJson(res, 200, updated);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error("Failed to update dmSentBy:", error);
				sendJson(res, 500, { error: "Failed to update dmSentBy" });
			}
		});
		return;
	}

	// PATCH /api/creators/:username/dm - Update DM sent status
	if (
		url.pathname.startsWith("/api/creators/") &&
		url.pathname.endsWith("/dm") &&
		req.method === "PATCH"
	) {
		const pathParts = url.pathname.split("/");
		const username = pathParts[3];

		if (!username) {
			sendJson(res, 400, { error: "Username required" });
			return;
		}

		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}") as { dmSent?: boolean };
				if (typeof parsed.dmSent !== "boolean") {
					sendJson(res, 400, { error: "dmSent boolean required" });
					return;
				}

				const prisma = getPrismaClient();
				const updated = await prisma.profile.update({
					where: { username },
					data: {
						dmSent: parsed.dmSent,
						dmSentAt: parsed.dmSent ? new Date() : null,
					},
					select: {
						username: true,
						dmSent: true,
						dmSentAt: true,
					},
				});

				sendJson(res, 200, updated);
			} catch (error) {
				// eslint-disable-next-line no-console
				console.error("Failed to update DM status:", error);
				sendJson(res, 500, { error: "Failed to update DM status" });
			}
		});
		return;
	}

	// GET /api/schedule/cron - Parse crontab and return scheduled runs
	if (url.pathname === "/api/schedule/cron" && req.method === "GET") {
		try {
			const { parseCrontab } = await import(
				"./functions/shared/runs/crontabParser.ts"
			);
			const scheduledRuns = await parseCrontab();
			sendJson(res, 200, scheduledRuns);
		} catch (error) {
			console.error("Failed to parse crontab:", error);
			sendJson(res, 500, { error: "Failed to parse crontab" });
		}
		return;
	}

	// GET /api/schedule/config - Get schedule config (timezone, etc.)
	if (url.pathname === "/api/schedule/config" && req.method === "GET") {
		try {
			const configPath = join(process.cwd(), "schedule.config.json");
			if (existsSync(configPath)) {
				const configData = await readFile(configPath, "utf-8");
				const config = JSON.parse(configData);
				sendJson(res, 200, {
					timezone: config.timezone || "UTC",
				});
			} else {
				sendJson(res, 200, { timezone: "UTC" });
			}
		} catch (error) {
			console.error("Failed to load schedule config:", error);
			sendJson(res, 200, { timezone: "UTC" }); // Default to UTC on error
		}
		return;
	}

	// GET /api/schedule - Return combined scheduled runs (cron + config)
	if (url.pathname === "/api/schedule" && req.method === "GET") {
		try {
			const { parseCrontab } = await import(
				"./functions/shared/runs/crontabParser.ts"
			);
			const cronRuns = await parseCrontab();

			// Try to load from config.json as fallback
			let configRuns: any[] = [];
			try {
				const configPath = join(process.cwd(), "schedule.config.json");
				if (existsSync(configPath)) {
					const configData = await readFile(configPath, "utf-8");
					const config = JSON.parse(configData);
					configRuns = config.oneOff || [];
				}
			} catch {
				// Config file doesn't exist or is invalid, use cron only
			}

			// Combine cron and config runs
			const allScheduled = [...cronRuns, ...configRuns];
			sendJson(res, 200, allScheduled);
		} catch (error) {
			console.error("Failed to load schedule:", error);
			sendJson(res, 500, { error: "Failed to load schedule" });
		}
		return;
	}

	// POST /api/schedule - Add a one-off scheduled run
	if (url.pathname === "/api/schedule" && req.method === "POST") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const parsed = JSON.parse(body || "{}") as {
					name?: string;
					profileId?: string;
					scriptName?: string;
					scheduledTime?: string;
					accountName?: string;
				};

				if (!parsed.profileId || !parsed.scriptName || !parsed.scheduledTime) {
					sendJson(res, 400, {
						error: "profileId, scriptName, and scheduledTime required",
					});
					return;
				}

				// Validate scheduledTime is in the future
				const scheduledDate = new Date(parsed.scheduledTime);
				if (isNaN(scheduledDate.getTime())) {
					sendJson(res, 400, { error: "Invalid scheduledTime format" });
					return;
				}
				if (scheduledDate.getTime() <= Date.now()) {
					sendJson(res, 400, { error: "scheduledTime must be in the future" });
					return;
				}

				// Read config file
				const configPath = join(process.cwd(), "schedule.config.json");
				let config: any = { oneOff: [], timezone: "UTC" };
				if (existsSync(configPath)) {
					const configData = await readFile(configPath, "utf-8");
					config = JSON.parse(configData);
				}

				// Add new scheduled run
				config.oneOff = config.oneOff || [];
				const newSchedule = {
					id: `oneoff_${Date.now()}`,
					...(parsed.name && { name: parsed.name }),
					profileId: parsed.profileId,
					scriptName: parsed.scriptName,
					scheduledTime: parsed.scheduledTime,
					accountName: parsed.accountName || parsed.profileId,
				};
				config.oneOff.push(newSchedule);

				// Save config
				const { writeFile: writeFileAsync } = await import("node:fs/promises");
				await writeFileAsync(configPath, JSON.stringify(config, null, 2));
				sendJson(res, 200, { success: true, schedule: newSchedule });
			} catch (error) {
				console.error("Failed to add scheduled run:", error);
				sendJson(res, 500, { error: "Failed to add scheduled run" });
			}
		});
		return;
	}

	// GET /api/schedule/:id - Get a specific scheduled run
	if (
		url.pathname.startsWith("/api/schedule/") &&
		req.method === "GET" &&
		url.pathname !== "/api/schedule" &&
		url.pathname !== "/api/schedule/cron"
	) {
		try {
			const scheduleId = url.pathname.split("/").pop();
			if (!scheduleId) {
				sendJson(res, 400, { error: "Schedule ID required" });
				return;
			}

			// Try to find in config file
			const configPath = join(process.cwd(), "schedule.config.json");
			if (existsSync(configPath)) {
				const configData = await readFile(configPath, "utf-8");
				const config = JSON.parse(configData);
				const schedule = config.oneOff?.find((s: any) => s.id === scheduleId);
				if (schedule) {
					sendJson(res, 200, schedule);
					return;
				}
			}

			// Not found in config, try cron (but cron schedules don't have IDs we can look up)
			sendJson(res, 404, { error: "Schedule not found" });
		} catch (error) {
			console.error("Failed to get schedule:", error);
			sendJson(res, 500, { error: "Failed to get schedule" });
		}
		return;
	}

	// DELETE /api/schedule/:id - Delete a one-off scheduled run
	if (
		url.pathname.startsWith("/api/schedule/") &&
		req.method === "DELETE" &&
		url.pathname !== "/api/schedule" &&
		url.pathname !== "/api/schedule/cron"
	) {
		try {
			const scheduleId = url.pathname.split("/").pop();
			if (!scheduleId) {
				sendJson(res, 400, { error: "Schedule ID required" });
				return;
			}

			// Check if it's a cron schedule (can't delete those via API)
			if (scheduleId.startsWith("scheduled_")) {
				sendJson(res, 400, {
					error: "Cannot delete cron schedules via API. Edit crontab instead.",
				});
				return;
			}

			// Read config file
			const configPath = join(process.cwd(), "schedule.config.json");
			if (!existsSync(configPath)) {
				sendJson(res, 404, { error: "Schedule config not found" });
				return;
			}

			const configData = await readFile(configPath, "utf-8");
			const config = JSON.parse(configData);

			// Find and remove the schedule
			const initialLength = config.oneOff?.length || 0;
			config.oneOff = (config.oneOff || []).filter(
				(s: any) => s.id !== scheduleId,
			);

			if (config.oneOff.length === initialLength) {
				sendJson(res, 404, { error: "Schedule not found" });
				return;
			}

			// Save config
			const { writeFile: writeFileAsync } = await import("node:fs/promises");
			await writeFileAsync(configPath, JSON.stringify(config, null, 2));
			sendJson(res, 200, { success: true });
		} catch (error) {
			console.error("Failed to delete schedule:", error);
			sendJson(res, 500, { error: "Failed to delete schedule" });
		}
		return;
	}

	// PATCH /api/schedule/:id - Update a one-off scheduled run
	if (
		url.pathname.startsWith("/api/schedule/") &&
		req.method === "PATCH" &&
		url.pathname !== "/api/schedule" &&
		url.pathname !== "/api/schedule/cron"
	) {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			try {
				const scheduleId = url.pathname.split("/").pop();
				if (!scheduleId) {
					sendJson(res, 400, { error: "Schedule ID required" });
					return;
				}

				// Check if it's a cron schedule (can't update those via API)
				if (scheduleId.startsWith("scheduled_")) {
					sendJson(res, 400, {
						error:
							"Cannot update cron schedules via API. Edit crontab instead.",
					});
					return;
				}

				const parsed = JSON.parse(body || "{}") as {
					name?: string;
					profileId?: string;
					scriptName?: string;
					scheduledTime?: string;
					accountName?: string;
				};

				// Validate scheduledTime if provided
				if (parsed.scheduledTime) {
					const scheduledDate = new Date(parsed.scheduledTime);
					if (isNaN(scheduledDate.getTime())) {
						sendJson(res, 400, { error: "Invalid scheduledTime format" });
						return;
					}
					if (scheduledDate.getTime() <= Date.now()) {
						sendJson(res, 400, {
							error: "scheduledTime must be in the future",
						});
						return;
					}
				}

				// Read config file
				const configPath = join(process.cwd(), "schedule.config.json");
				if (!existsSync(configPath)) {
					sendJson(res, 404, { error: "Schedule config not found" });
					return;
				}

				const configData = await readFile(configPath, "utf-8");
				const config = JSON.parse(configData);

				// Find the schedule
				const scheduleIndex = config.oneOff?.findIndex(
					(s: any) => s.id === scheduleId,
				);
				if (scheduleIndex === -1 || scheduleIndex === undefined) {
					sendJson(res, 404, { error: "Schedule not found" });
					return;
				}

				// Update the schedule
				const schedule = config.oneOff[scheduleIndex];
				if (parsed.name !== undefined) schedule.name = parsed.name;
				if (parsed.profileId) schedule.profileId = parsed.profileId;
				if (parsed.scriptName) schedule.scriptName = parsed.scriptName;
				if (parsed.scheduledTime) schedule.scheduledTime = parsed.scheduledTime;
				if (parsed.accountName !== undefined)
					schedule.accountName = parsed.accountName;

				// Save config
				const { writeFile: writeFileAsync } = await import("node:fs/promises");
				await writeFileAsync(configPath, JSON.stringify(config, null, 2));
				sendJson(res, 200, { success: true, schedule });
			} catch (error) {
				console.error("Failed to update schedule:", error);
				sendJson(res, 500, { error: "Failed to update schedule" });
			}
		});
		return;
	}

	// GET /api/runs/:id/thumbnail - Get latest screenshot thumbnail for a run
	if (
		url.pathname.startsWith("/api/runs/") &&
		url.pathname.endsWith("/thumbnail") &&
		req.method === "GET"
	) {
		const runId = url.pathname.split("/")[3];
		if (!runId) {
			sendJson(res, 400, { error: "Run ID required" });
			return;
		}

		try {
			const run = await getRun(runId);
			if (!run) {
				res.writeHead(204);
				res.end();
				return;
			}

			// Return latest screenshot or final screenshot
			const thumbnailPath =
				run.finalScreenshot ||
				run.screenshots[run.screenshots.length - 1] ||
				null;

			if (!thumbnailPath) {
				res.writeHead(204);
				res.end();
				return;
			}

			sendJson(res, 200, { thumbnail: thumbnailPath });
		} catch {
			res.writeHead(204);
			res.end();
		}
		return;
	}

	res.writeHead(404);
	res.end("Not found");
}

async function readDirSortedByMtime(dir: string) {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const files = await Promise.all(
			entries
				.filter((e) => e.isFile())
				.map(async (entry) => {
					const fullPath = join(dir, entry.name);
					const s = await stat(fullPath);
					return { name: entry.name, mtimeMs: s.mtimeMs };
				}),
		);
		return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
	} catch {
		return [];
	}
}

async function getLatestLogFile(logsDir: string): Promise<string | null> {
	try {
		const entries = await readdir(logsDir, { withFileTypes: true });
		const files = await Promise.all(
			entries
				.filter(
					(e) =>
						e.isFile() &&
						e.name.startsWith("scout-") &&
						e.name.endsWith(".log"),
				)
				.map(async (entry) => {
					const fullPath = join(logsDir, entry.name);
					const s = await stat(fullPath);
					return { name: entry.name, mtimeMs: s.mtimeMs };
				}),
		);
		if (files.length === 0) return null;
		files.sort((a, b) => b.mtimeMs - a.mtimeMs);
		return files[0]?.name ?? null;
	} catch {
		return null;
	}
}

const server = http.createServer((req, res) => {
	const url = req.url ?? "";

	if (url.startsWith("/api/")) {
		void handleApi(req, res);
		return;
	}

	// Serve screenshot images
	if (url.startsWith("/screenshots/")) {
		const filePath = join(process.cwd(), url);
		const ext = extname(filePath);
		const contentType =
			ext === ".png" ? "image/png" : "application/octet-stream";

		const stream = createReadStream(filePath);
		stream.on("open", () => {
			res.writeHead(200, { "Content-Type": contentType });
			stream.pipe(res);
		});
		stream.on("error", () => {
			res.writeHead(404);
			res.end("Screenshot not found");
		});
		return;
	}

	res.writeHead(404);
	res.end("Not found");
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ noServer: true });

// Track active connections per run
const activeConnections = new Map<string, Set<any>>();

wss.on("connection", (ws, req) => {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	const runId = url.searchParams.get("runId");

	if (!runId) {
		ws.close(1008, "runId required");
		return;
	}

	// Add to active connections
	if (!activeConnections.has(runId)) {
		activeConnections.set(runId, new Set());
	}
	activeConnections.get(runId)!.add(ws);

	ws.on("close", () => {
		const connections = activeConnections.get(runId);
		if (connections) {
			connections.delete(ws);
			if (connections.size === 0) {
				activeConnections.delete(runId);
			}
		}
	});

	ws.on("message", (data) => {
		try {
			const message = JSON.parse(data.toString());
			if (message.action === "subscribe" && message.runId) {
				// Already subscribed via URL param
			}
		} catch {
			// Ignore invalid messages
		}
	});
});

// Broadcast updates to WebSocket clients
export function broadcastRunUpdate(
	runId: string,
	type: "log" | "snapshot" | "metrics" | "status",
	data: any,
) {
	const connections = activeConnections.get(runId);
	if (connections) {
		const message = JSON.stringify({
			type,
			runId,
			data,
			timestamp: new Date().toISOString(),
		});
		connections.forEach((ws) => {
			if (ws.readyState === 1) {
				// WebSocket.OPEN
				ws.send(message);
			}
		});
	}
}

server.on("upgrade", (request, socket, head) => {
	const url = new URL(request.url || "/", `http://${request.headers.host}`);
	if (url.pathname === "/ws/runs") {
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	} else {
		socket.destroy();
	}
});

// Listen only on localhost for security (access via SSH tunnel if needed externally)
server.listen(PORT, "127.0.0.1", () => {
	// eslint-disable-next-line no-console
	console.log(`API server listening on http://127.0.0.1:${PORT} (localhost only)`);
	// eslint-disable-next-line no-console
	console.log(`WebSocket server ready at ws://127.0.0.1:${PORT}/ws/runs`);
});
