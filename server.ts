import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import { extname, join } from "node:path";
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

	// Match discovery-related screenshots (profile, link_analysis, dm)
	const discoveryMatch = filename.match(
		/(profile|link_analysis|dm)_([^-]+)-(\d+)\.png$/,
	);
	if (discoveryMatch) {
		const [, type, username, timestamp] = discoveryMatch;
		const date = new Date(parseInt(timestamp, 10));

		return {
			username,
			type: type === "link_analysis" ? "link" : (type as "profile" | "dm"),
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
			const tail = lines.slice(-limit);
			const entries = tail.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return { raw: line };
				}
			});
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
			sendJson(res, 200, runs);
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

server.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`API server listening on http://localhost:${PORT}`);
});
