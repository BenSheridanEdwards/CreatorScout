import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import { extname, join } from "node:path";
import {
	BROWSERLESS_TOKEN,
	ADSPOWER_API_KEY,
	LOCAL_BROWSER,
} from "./functions/shared/config/config.ts";

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

	if (req.method === "GET" && url.pathname === "/api/health") {
		sendJson(res, 200, { ok: true, ts: Date.now() });
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

		const tsCommand = process.env.TSX_PATH || "tsx";
		const scriptPath = validScripts[scriptName as ScriptName];

		const child = spawn(tsCommand, [scriptPath], {
			stdio: "inherit",
			env: process.env,
		});

		child.on("error", (err) => {
			// eslint-disable-next-line no-console
			console.error("Failed to start script", scriptName, err);
		});

		const startedAt = new Date().toISOString();
		sendJson(res, 200, { script: scriptName, startedAt });
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
	if ((req.url ?? "").startsWith("/api/")) {
		void handleApi(req, res);
		return;
	}
	res.writeHead(404);
	res.end("Not found");
});

server.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`API server listening on http://localhost:${PORT}`);
});
