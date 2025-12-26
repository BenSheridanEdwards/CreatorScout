import { useEffect, useState } from "react";
import CreatorsTable from "./components/CreatorsTable/CreatorsTable";

type ScriptName =
	| "discover"
	| "analyze"
	| "follow"
	| "dm"
	| "inbox"
	| "process"
	| "health"
	| "dashboard";

interface ScriptStatus {
	name: ScriptName;
	running: boolean;
	lastRun?: string;
	lastError?: string;
}

interface ConnectionInfo {
	provider: "local" | "browserless" | "unknown" | "offline";
	localBrowser: boolean;
	browserlessConfigured: boolean;
}

interface Screenshot {
	username: string;
	type: "profile" | "link" | "dm" | "unknown";
	date: string;
	path: string;
	filename: string;
}

interface ErrorLog {
	timestamp: string;
	username?: string;
	message: string;
	stack?: string;
}

interface CreatorFound {
	username: string;
	confidence: number;
	reason: string;
	timestamp: string;
	screenshotPath?: string;
}

interface RunMetadata {
	id: string;
	scriptName: string;
	startTime: string;
	endTime?: string;
	status: "running" | "completed" | "error";
	profilesProcessed: number;
	creatorsFound: number;
	errors: number;
	screenshots: string[];
	finalScreenshot?: string;
	errorMessage?: string;
	stats?: {
		duration?: number;
		avgProcessingTime?: number;
		successRate?: number;
	};
	errorLogs?: ErrorLog[];
	creatorsFoundList?: CreatorFound[];
}

const scripts: ScriptName[] = [
	"discover",
	"analyze",
	"follow",
	"dm",
	"inbox",
	"process",
	"health",
	"dashboard",
];

function App() {
	const [statuses, setStatuses] = useState<Record<ScriptName, ScriptStatus>>(
		() =>
			Object.fromEntries(
				scripts.map((name) => [
					name,
					{ name, running: false } satisfies ScriptStatus,
				]),
			) as Record<ScriptName, ScriptStatus>,
	);
	const [liveUrl, setLiveUrl] = useState<string | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(
		null,
	);
	const [liveUrlError, setLiveUrlError] = useState<string | null>(null);
	const [logEntries, setLogEntries] = useState<any[]>([]);
	const [logsError, setLogsError] = useState<string | null>(null);
	const [logsLoading, setLogsLoading] = useState(false);
	const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
	const [screenshotsLoading, setScreenshotsLoading] = useState(false);
	const [screenshotsError, setScreenshotsError] = useState<string | null>(null);
	const [selectedScreenshot, setSelectedScreenshot] = useState<Screenshot | null>(null);
	const [runs, setRuns] = useState<RunMetadata[]>([]);
	const [runsLoading, setRunsLoading] = useState(false);
	const [runsError, setRunsError] = useState<string | null>(null);
	const [selectedRun, setSelectedRun] = useState<RunMetadata | null>(null);

	useEffect(() => {
		void (async () => {
			try {
				const res = await fetch("/api/env/connection");
				if (!res.ok) {
					setConnectionInfo({
						provider: "offline",
						localBrowser: false,
						browserlessConfigured: false,
					});
					return;
				}
				const data = (await res.json()) as ConnectionInfo;
				setConnectionInfo(data);
			} catch {
				setConnectionInfo({
					provider: "offline",
					localBrowser: false,
					browserlessConfigured: false,
				});
			}
		})();
	}, []);

	async function runScript(name: ScriptName) {
		setStatuses((prev) => ({
			...prev,
			[name]: { ...prev[name], running: true, lastError: undefined },
		}));

		try {
			const res = await fetch(`/api/scripts/${name}/start`, {
				method: "POST",
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `Failed with ${res.status}`);
			}
			const { startedAt } = (await res.json()) as { startedAt: string };
			setStatuses((prev) => ({
				...prev,
				[name]: { ...prev[name], running: false, lastRun: startedAt },
			}));
		} catch (err) {
			setStatuses((prev) => ({
				...prev,
				[name]: {
					...prev[name],
					running: false,
					lastError: err instanceof Error ? err.message : String(err),
				},
			}));
		}
	}

	async function refreshLiveUrl() {
		try {
			const res = await fetch("/api/session/live-url");
			if (res.status === 204) {
				setLiveUrl(null);
				setLiveUrlError(
					"No active Browserless live session. Start a script while connected to Browserless.",
				);
				// Also surface in devtools for easier debugging
				// eslint-disable-next-line no-console
				console.error(
					"[Scout Studio] /api/session/live-url returned 204 (no live URL). " +
						"Likely causes: script not using Browserless Sessions, plan without Live Debugger, or session not started yet.",
				);
				return;
			}
			if (!res.ok) {
				setLiveUrlError(
					`Failed to load live viewer (status ${res.status}). Check server logs.`,
				);
				// eslint-disable-next-line no-console
				console.error(
					`[Scout Studio] /api/session/live-url failed with status ${res.status}.`,
				);
				return;
			}
			const data = (await res.json()) as { liveURL?: string };
			if (data.liveURL) {
				setLiveUrl(data.liveURL);
				setLiveUrlError(null);
			} else {
				setLiveUrl(null);
				setLiveUrlError(
					"No Browserless live URL available yet. Make sure a script is running with Browserless enabled.",
				);
				// eslint-disable-next-line no-console
				console.error(
					"[Scout Studio] /api/session/live-url responded without a liveURL field.",
				);
			}
		} catch {
			setLiveUrlError(
				"Could not reach /api/session/live-url. Is the API server running on port 4000?",
			);
			// eslint-disable-next-line no-console
			console.error(
				"[Scout Studio] Network error while calling /api/session/live-url. " +
					"Verify that `npm run dev:server` is running on port 4000.",
			);
		}
	}

	async function refreshLogs() {
		setLogsLoading(true);
		setLogsError(null);
		try {
			const res = await fetch("/api/logs?limit=200");
			if (!res.ok) {
				setLogsError(`Failed to load logs (status ${res.status}).`);
				// eslint-disable-next-line no-console
				console.error(
					`[Scout Studio] /api/logs failed with status ${res.status}.`,
				);
				return;
			}
			const data = (await res.json()) as { entries?: any[] };
			setLogEntries(data.entries ?? []);
		} catch {
			setLogsError(
				"Could not reach /api/logs. Is the API server running on port 4000?",
			);
			// eslint-disable-next-line no-console
			console.error(
				"[Scout Studio] Network error while calling /api/logs. " +
					"Verify that `npm run dev:server` is running on port 4000.",
			);
		} finally {
			setLogsLoading(false);
		}
	}

	async function toggleRecording() {
		try {
			const res = await fetch("/api/session/recording", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enable: !isRecording }),
			});
			if (!res.ok) return;
			const data = (await res.json()) as { recording: boolean };
			setIsRecording(data.recording);
		} catch {
			// ignore for now
		}
	}

	async function loadScreenshots() {
		setScreenshotsLoading(true);
		setScreenshotsError(null);
		try {
			const res = await fetch("/api/screenshots");
			if (!res.ok) {
				setScreenshotsError(`Failed to load screenshots (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as Screenshot[];
			// Sort by date, newest first
			data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
			setScreenshots(data);
		} catch {
			setScreenshotsError("Could not reach /api/screenshots. Is the API server running?");
		} finally {
			setScreenshotsLoading(false);
		}
	}

	async function loadRuns() {
		setRunsLoading(true);
		setRunsError(null);
		try {
			const res = await fetch("/api/runs");
			if (!res.ok) {
				setRunsError(`Failed to load runs (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as RunMetadata[];
			setRuns(data);
		} catch {
			setRunsError("Could not reach /api/runs. Is the API server running?");
		} finally {
			setRunsLoading(false);
		}
	}

	function formatDuration(seconds?: number): string {
		if (!seconds) return "N/A";
		if (seconds < 60) return `${seconds}s`;
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}m ${secs}s`;
	}

	return (
		<div className="min-h-screen flex flex-col">
			<header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">Scout Studio</h1>
					<p className="text-sm text-slate-400">
						Control panel for Browserless sessions & scripts
					</p>
					{connectionInfo && (
						<div className="mt-1 flex items-center gap-2 text-xs">
							<span
								className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
									connectionInfo.provider === "browserless"
										? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
										: connectionInfo.provider === "local"
											? "bg-sky-500/10 text-sky-300 border border-sky-500/40"
											: connectionInfo.provider === "offline"
												? "bg-rose-500/10 text-rose-300 border border-rose-500/40"
												: "bg-amber-500/10 text-amber-300 border border-amber-500/40"
								}`}
							>
								<span
									className={`mr-1 h-1.5 w-1.5 rounded-full ${
										connectionInfo.provider === "browserless"
											? "bg-emerald-400"
											: connectionInfo.provider === "local"
												? "bg-sky-400"
												: connectionInfo.provider === "offline"
													? "bg-rose-400"
													: "bg-amber-400"
									}`}
								/>
								{connectionInfo.provider === "browserless" &&
									"Connected to Browserless"}
								{connectionInfo.provider === "local" &&
									"Using local Chrome (LOCAL_BROWSER=true)"}
								{connectionInfo.provider === "offline" &&
									"API offline (server not reachable)"}
								{connectionInfo.provider === "unknown" &&
									"No Browserless token detected"}
							</span>
							{connectionInfo.provider !== "offline" &&
								!connectionInfo.browserlessConfigured && (
									<span className="text-[11px] text-slate-500">
										Set BROWSERLESS_TOKEN and LOCAL_BROWSER=false to enable
										Browserless.
									</span>
								)}
						</div>
					)}
				</div>
				<button
					onClick={toggleRecording}
					type="button"
					className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition ${
						isRecording
							? "bg-red-500/90 hover:bg-red-500 text-white"
							: "bg-emerald-500/90 hover:bg-emerald-500 text-slate-900"
					}`}
				>
					<span
						className={`mr-2 h-2 w-2 rounded-full ${
							isRecording ? "bg-red-200 animate-pulse" : "bg-emerald-900"
						}`}
					/>
					{isRecording ? "Stop Recording" : "Start Recording"}
				</button>
			</header>

			<main className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 p-6">
				<section className="space-y-4">
					<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
						Scripts
					</h2>
					<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
						{scripts.map((name) => {
							const status = statuses[name];
							const label = name.toUpperCase();
							return (
								<button
									key={name}
									onClick={() => runScript(name)}
									type="button"
									disabled={status.running}
									className="group flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left shadow-sm transition hover:border-slate-700 hover:bg-slate-900/90 disabled:opacity-60 disabled:cursor-not-allowed"
								>
									<span className="text-xs font-semibold tracking-wide text-slate-400">
										SCRIPT
									</span>
									<span className="mt-0.5 text-sm font-medium text-slate-50">
										{label}
									</span>
									<span className="mt-1 text-xs text-slate-400">
										{status.running
											? "Running..."
											: status.lastRun
												? `Last run: ${new Date(
														status.lastRun,
													).toLocaleTimeString()}`
												: "Not run yet"}
									</span>
									{status.lastError && (
										<span className="mt-1 text-[11px] text-red-400">
											{status.lastError}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</section>

				<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
					<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
						<h2 className="text-sm font-semibold text-slate-200">
							Live Session
						</h2>
						<button
							onClick={refreshLiveUrl}
							type="button"
							className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
						>
							Load viewer
						</button>
					</div>
					<div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-800 space-y-1 bg-slate-950/60">
						<p className="font-medium text-slate-300">
							Live viewer requirements (Browserless):
						</p>
						<ul className="list-disc pl-4 space-y-0.5">
							<li>
								<code className="text-[11px]">BROWSERLESS_TOKEN</code> is set in
								your environment
							</li>
							<li>
								<code className="text-[11px]">LOCAL_BROWSER=false</code> (or not
								set) so scripts use Browserless instead of local Chrome
							</li>
							<li>
								A script (e.g. <span className="font-mono text-[11px]">dm</span>{" "}
								or <span className="font-mono text-[11px]">inbox</span>) is
								currently running
							</li>
						</ul>
						{connectionInfo && (
							<p className="mt-1 text-[11px] text-slate-500">
								Current status: provider{" "}
								<code className="text-[11px]">{connectionInfo.provider}</code>,{" "}
								Browserless configured{" "}
								<code className="text-[11px]">
									{connectionInfo.browserlessConfigured ? "true" : "false"}
								</code>
								, local browser{" "}
								<code className="text-[11px]">
									{connectionInfo.localBrowser ? "true" : "false"}
								</code>
								.
							</p>
						)}
						{liveUrlError && (
							<p className="mt-1 text-[11px] text-amber-400">{liveUrlError}</p>
						)}
					</div>
					<div className="flex-1 flex items-center justify-center bg-black/90">
						{liveUrl ? (
							<iframe
								src={liveUrl}
								title="Browserless Live Session"
								className="h-[500px] w-full border-0"
								allow="clipboard-read; clipboard-write; fullscreen"
							/>
						) : (
							<p className="text-xs text-slate-500">
								No live viewer yet. Run a script (Browserless) and hit “Load
								viewer”.
							</p>
						)}
					</div>
				</section>

				<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
					<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
						<h2 className="text-sm font-semibold text-slate-200">Logs</h2>
						<button
							onClick={refreshLogs}
							type="button"
							className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
							disabled={logsLoading}
						>
							{logsLoading ? "Loading..." : "Refresh logs"}
						</button>
					</div>
					{logsError && (
						<div className="px-4 py-2 text-[11px] text-amber-400 border-b border-slate-800 bg-slate-950/60">
							{logsError}
						</div>
					)}
					<div className="flex-1 overflow-y-auto px-4 py-3 text-xs font-mono text-slate-300 bg-slate-950/60">
						{logEntries.length === 0 ? (
							<p className="text-slate-500">
								No log entries yet. Run a script to generate logs, then hit
								“Refresh logs”.
							</p>
						) : (
							<ul className="space-y-1">
								{logEntries.map((entry, idx) => {
									const ts = entry.timestamp ?? "";
									const level = entry.level ?? "";
									const prefix = entry.prefix ?? "";
									const message = entry.message ?? entry.raw ?? "";
									return (
										<li
											// eslint-disable-next-line react/no-array-index-key
											key={idx}
											className="whitespace-pre-wrap break-words"
										>
											<span className="text-slate-500 mr-1">
												{ts && `[${ts}]`}
											</span>
											{level && (
												<span
													className={
														level === "ERROR"
															? "text-red-400 mr-1"
															: level === "WARN"
																? "text-amber-300 mr-1"
																: "text-sky-300 mr-1"
													}
												>
													{level}
												</span>
											)}
											{prefix && (
												<span className="text-emerald-300 mr-1">
													[{prefix}]
												</span>
											)}
											<span>{message}</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</section>

				<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
					<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
						<div>
							<h2 className="text-sm font-semibold text-slate-200">Recent Runs</h2>
							<p className="text-[11px] text-slate-400 mt-0.5">
								Script execution history with screenshots and metrics
							</p>
						</div>
						<button
							onClick={loadRuns}
							type="button"
							className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
							disabled={runsLoading}
						>
							{runsLoading ? "Loading..." : "Load runs"}
						</button>
					</div>
					{runsError && (
						<div className="px-4 py-2 text-[11px] text-amber-400 border-b border-slate-800 bg-slate-950/60">
							{runsError}
						</div>
					)}
					<div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-950/60 max-h-[600px]">
						{runs.length === 0 ? (
							<p className="text-xs text-slate-500">
								No runs yet. Start a script, then hit "Load runs".
							</p>
						) : (
							<div className="space-y-3">
								{runs.map((run) => (
									<button
										key={run.id}
										onClick={() => setSelectedRun(run)}
										type="button"
										className="w-full text-left rounded-lg border border-slate-800 hover:border-slate-600 transition bg-slate-900/40 p-3"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 mb-1">
													<span className="text-sm font-semibold text-slate-200 uppercase">
														{run.scriptName}
													</span>
													<span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
														run.status === 'completed'
															? 'bg-emerald-500/20 text-emerald-300'
															: run.status === 'running'
															? 'bg-sky-500/20 text-sky-300 animate-pulse'
															: 'bg-red-500/20 text-red-300'
													}`}>
														{run.status}
													</span>
													{run.screenshots.length > 0 && (
														<span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
															📸 {run.screenshots.length}
														</span>
													)}
												</div>
												<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
													<div>
														<span className="text-slate-500">Profiles:</span>{" "}
														<span className="text-slate-300 font-medium">{run.profilesProcessed}</span>
													</div>
													<div>
														<span className="text-slate-500">Creators:</span>{" "}
														<span className="text-emerald-400 font-medium">{run.creatorsFound}</span>
													</div>
													<div>
														<span className="text-slate-500">Errors:</span>{" "}
														<span className={run.errors > 0 ? "text-red-400 font-medium" : "text-slate-400"}>
															{run.errors}
														</span>
													</div>
													<div>
														<span className="text-slate-500">Duration:</span>{" "}
														<span className="text-slate-300">{formatDuration(run.stats?.duration)}</span>
													</div>
												</div>
												<div className="text-[10px] text-slate-500 mt-1">
													Started: {new Date(run.startTime).toLocaleString()}
												</div>
												{run.errorMessage && (
													<div className="text-[10px] text-red-400 mt-1 truncate">
														Error: {run.errorMessage}
													</div>
												)}
											</div>
											{run.finalScreenshot && (
												<img
													src={`http://localhost:4000${run.finalScreenshot}`}
													alt="Final screenshot"
													className="w-16 h-16 object-cover rounded border border-slate-700"
												/>
											)}
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				</section>

				<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
					<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
						<div>
							<h2 className="text-sm font-semibold text-slate-200">Screenshots</h2>
							<p className="text-[11px] text-slate-400 mt-0.5">
								Profile & link analysis screenshots from discovery runs
							</p>
						</div>
						<button
							onClick={loadScreenshots}
							type="button"
							className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
							disabled={screenshotsLoading}
						>
							{screenshotsLoading ? "Loading..." : "Load screenshots"}
						</button>
					</div>
					{screenshotsError && (
						<div className="px-4 py-2 text-[11px] text-amber-400 border-b border-slate-800 bg-slate-950/60">
							{screenshotsError}
						</div>
					)}
					<div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-950/60 max-h-[600px]">
						{screenshots.length === 0 ? (
							<p className="text-xs text-slate-500">
								No screenshots yet. Run discovery or analysis scripts, then hit "Load screenshots".
							</p>
						) : (
							<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
								{screenshots.slice(0, 20).map((screenshot, idx) => (
									<button
										key={idx}
										onClick={() => setSelectedScreenshot(screenshot)}
										type="button"
										className="group relative rounded-lg overflow-hidden border border-slate-800 hover:border-slate-600 transition bg-slate-900/40"
									>
										<img
											src={`http://localhost:4000${screenshot.path}`}
											alt={screenshot.username}
											className="w-full h-32 object-cover"
										/>
										<div className="p-2 text-left">
											<div className="text-xs font-medium text-slate-200 truncate">
												@{screenshot.username}
											</div>
											<div className="flex items-center gap-1 mt-1">
												<span className={`text-[10px] px-1.5 py-0.5 rounded ${
													screenshot.type === 'profile' 
														? 'bg-emerald-500/20 text-emerald-300'
														: screenshot.type === 'link'
														? 'bg-purple-500/20 text-purple-300'
														: 'bg-slate-700 text-slate-400'
												}`}>
													{screenshot.type}
												</span>
												<span className="text-[10px] text-slate-500">
													{new Date(screenshot.date).toLocaleDateString()}
												</span>
											</div>
										</div>
									</button>
								))}
							</div>
						)}
						{screenshots.length > 20 && (
							<p className="text-[11px] text-slate-500 mt-3 text-center">
							Showing 20 of {screenshots.length} screenshots
						</p>
					)}
				</div>
			</section>

			{/* Confirmed Creators */}
			<CreatorsTable />
		</main>

			{selectedScreenshot && (
				<div
					className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
					onClick={() => setSelectedScreenshot(null)}
				>
					<div
						className="bg-slate-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
							<div>
								<h3 className="text-lg font-semibold text-slate-200">
									@{selectedScreenshot.username}
								</h3>
								<div className="flex items-center gap-2 mt-1">
									<span className={`text-xs px-2 py-0.5 rounded ${
										selectedScreenshot.type === 'profile' 
											? 'bg-emerald-500/20 text-emerald-300'
											: selectedScreenshot.type === 'link'
											? 'bg-purple-500/20 text-purple-300'
											: 'bg-slate-700 text-slate-400'
									}`}>
										{selectedScreenshot.type}
									</span>
									<span className="text-xs text-slate-400">
										{new Date(selectedScreenshot.date).toLocaleString()}
									</span>
								</div>
							</div>
							<button
								onClick={() => setSelectedScreenshot(null)}
								type="button"
								className="text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center"
							>
								×
							</button>
						</div>
						<div className="p-4">
							<img
								src={`http://localhost:4000${selectedScreenshot.path}`}
								alt={selectedScreenshot.username}
								className="w-full rounded-lg"
							/>
						</div>
					</div>
				</div>
			)}

			{selectedRun && (
				<div
					className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
					onClick={() => setSelectedRun(null)}
				>
					<div
						className="bg-slate-900 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-auto"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
							<div>
								<h3 className="text-lg font-semibold text-slate-200 uppercase">
									{selectedRun.scriptName}
								</h3>
								<div className="flex items-center gap-2 mt-1">
									<span className={`text-xs px-2 py-0.5 rounded font-medium ${
										selectedRun.status === 'completed'
											? 'bg-emerald-500/20 text-emerald-300'
											: selectedRun.status === 'running'
											? 'bg-sky-500/20 text-sky-300'
											: 'bg-red-500/20 text-red-300'
									}`}>
										{selectedRun.status}
									</span>
									<span className="text-xs text-slate-400">
										{new Date(selectedRun.startTime).toLocaleString()}
									</span>
								</div>
							</div>
							<button
								onClick={() => setSelectedRun(null)}
								type="button"
								className="text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center"
							>
								×
							</button>
						</div>
						<div className="p-4">
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
								<div className="bg-slate-800/50 rounded-lg p-3">
									<div className="text-xs text-slate-400 mb-1">Profiles Processed</div>
									<div className="text-2xl font-bold text-slate-200">{selectedRun.profilesProcessed}</div>
								</div>
								<div className="bg-emerald-500/10 rounded-lg p-3">
									<div className="text-xs text-emerald-400 mb-1">Creators Found</div>
									<div className="text-2xl font-bold text-emerald-300">{selectedRun.creatorsFound}</div>
								</div>
								<div className="bg-red-500/10 rounded-lg p-3">
									<div className="text-xs text-red-400 mb-1">Errors</div>
									<div className="text-2xl font-bold text-red-300">{selectedRun.errors}</div>
								</div>
								<div className="bg-slate-800/50 rounded-lg p-3">
									<div className="text-xs text-slate-400 mb-1">Duration</div>
									<div className="text-2xl font-bold text-slate-200">{formatDuration(selectedRun.stats?.duration)}</div>
								</div>
							</div>
							
							{selectedRun.creatorsFoundList && selectedRun.creatorsFoundList.length > 0 && (
								<div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-4">
									<h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
										<span>✨</span>
										Creators Found ({selectedRun.creatorsFoundList.length})
									</h4>
									<div className="space-y-2 max-h-60 overflow-y-auto">
										{selectedRun.creatorsFoundList.map((creator, idx) => (
											<div
												key={idx}
												className="bg-slate-900/50 rounded p-2 border border-emerald-500/10 hover:border-emerald-500/30 transition"
											>
												<div className="flex items-center justify-between">
													<a
														href={`https://instagram.com/${creator.username}`}
														target="_blank"
														rel="noopener noreferrer"
														className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
													>
														@{creator.username}
													</a>
													<span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
														{creator.confidence}%
													</span>
												</div>
												<div className="text-xs text-slate-400 mt-1">
													{creator.reason} • {new Date(creator.timestamp).toLocaleTimeString()}
												</div>
												{creator.screenshotPath && (
													<button
														onClick={() => window.open(`http://localhost:4000${creator.screenshotPath}`, '_blank')}
														className="text-xs text-purple-400 hover:text-purple-300 mt-1"
													>
														📸 View screenshot
													</button>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{selectedRun.errorLogs && selectedRun.errorLogs.length > 0 && (
								<div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
									<h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
										<span>❌</span>
										Error Logs ({selectedRun.errorLogs.length})
									</h4>
									<div className="space-y-2 max-h-60 overflow-y-auto">
										{selectedRun.errorLogs.map((error, idx) => (
											<div
												key={idx}
												className="bg-slate-900/50 rounded p-3 border border-red-500/10"
											>
												<div className="flex items-start justify-between gap-2 mb-1">
													{error.username && (
														<span className="text-sm font-semibold text-red-300">
															@{error.username}
														</span>
													)}
													<span className="text-xs text-slate-500">
														{new Date(error.timestamp).toLocaleTimeString()}
													</span>
												</div>
												<div className="text-xs text-red-300 font-mono mb-2">
													{error.message}
												</div>
												{error.stack && (
													<details className="text-xs text-slate-400">
														<summary className="cursor-pointer hover:text-slate-300">
															Stack trace
														</summary>
														<pre className="mt-2 p-2 bg-slate-950 rounded overflow-x-auto text-[10px]">
															{error.stack}
														</pre>
													</details>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{selectedRun.screenshots.length > 0 && (
								<div>
									<h4 className="text-sm font-semibold text-slate-200 mb-3">
										Screenshots ({selectedRun.screenshots.length})
									</h4>
									<div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
										{selectedRun.screenshots.map((screenshot, idx) => (
											<img
												key={idx}
												src={`http://localhost:4000${screenshot}`}
												alt={`Screenshot ${idx + 1}`}
												className="w-full h-24 object-cover rounded border border-slate-700 hover:border-slate-500 transition cursor-pointer"
												onClick={() => window.open(`http://localhost:4000${screenshot}`, '_blank')}
											/>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default App;
