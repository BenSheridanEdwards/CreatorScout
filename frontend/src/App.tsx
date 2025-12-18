import { useEffect, useState } from "react";

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
				return;
			}
			if (!res.ok) {
				setLiveUrlError(
					`Failed to load live viewer (status ${res.status}). Check server logs.`,
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
			}
		} catch {
			setLiveUrlError(
				"Could not reach /api/session/live-url. Is the API server running on port 4000?",
			);
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

			<main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 p-6">
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
			</main>
		</div>
	);
}

export default App;
