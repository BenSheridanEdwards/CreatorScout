import { apiFetch } from "../../utils/api";
import { useState } from "react";
import type { RunMetadata } from "../../types";
import { getImageUrl } from "../../utils/imageUrl";

interface RecentRunsProps {
	onRunSelect: (run: RunMetadata) => void;
}

function formatDuration(seconds?: number): string {
	if (!seconds) return "N/A";
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}m ${secs}s`;
}

export default function RecentRuns({ onRunSelect }: RecentRunsProps) {
	const [runs, setRuns] = useState<RunMetadata[]>([]);
	const [runsLoading, setRunsLoading] = useState(false);
	const [runsError, setRunsError] = useState<string | null>(null);
	const [selectedRunForLogs, setSelectedRunForLogs] =
		useState<RunMetadata | null>(null);

	async function loadRuns() {
		setRunsLoading(true);
		setRunsError(null);
		try {
			const res = await apiFetch("/api/runs");
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

	return (
		<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
			<header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
				<div>
					<h2 className="text-sm font-semibold text-slate-200">Recent Runs</h2>
					<p className="text-[11px] text-slate-400 mt-0.5">
						Script execution history with screenshots and metrics. Click a run
						to view its logs.
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
			</header>
			{runsError && (
				<div
					className="px-4 py-2 text-[11px] text-amber-400 border-b border-slate-800 bg-slate-950/60"
					role="alert"
				>
					{runsError}
				</div>
			)}
			<div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-950/60 max-h-[600px]">
				{runs.length === 0 ? (
					<p className="text-xs text-slate-500">
						No runs yet. Start a script, then hit "Load runs".
					</p>
				) : (
					<ul className="space-y-3">
						{runs.map((run) => (
							<li key={run.id}>
								<button
									onClick={(e) => {
										e.stopPropagation();
										setSelectedRunForLogs(run);
										onRunSelect(run);
									}}
									type="button"
									className={`w-full text-left rounded-lg border transition p-3 ${
										selectedRunForLogs?.id === run.id
											? "border-sky-500 bg-slate-900/60"
											: "border-slate-800 hover:border-slate-600 bg-slate-900/40"
									}`}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<span className="text-sm font-semibold text-slate-200 uppercase">
													{run.scriptName}
												</span>
												<span
													className={`text-[10px] px-2 py-0.5 rounded font-medium ${
														run.status === "completed"
															? "bg-emerald-500/20 text-emerald-300"
															: run.status === "running"
																? "bg-sky-500/20 text-sky-300 animate-pulse"
																: "bg-red-500/20 text-red-300"
													}`}
												>
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
													<span className="text-slate-300 font-medium">
														{run.profilesProcessed}
													</span>
												</div>
												<div>
													<span className="text-slate-500">Creators:</span>{" "}
													<span className="text-emerald-400 font-medium">
														{run.creatorsFound}
													</span>
												</div>
												<div>
													<span className="text-slate-500">Errors:</span>{" "}
													<span
														className={
															run.errors > 0
																? "text-red-400 font-medium"
																: "text-slate-400"
														}
													>
														{run.errors}
													</span>
												</div>
												<div>
													<span className="text-slate-500">Duration:</span>{" "}
													<span className="text-slate-300">
														{formatDuration(run.stats?.duration)}
													</span>
												</div>
											</div>
											<p className="text-[10px] text-slate-500 mt-1">
												Started:{" "}
												<time dateTime={run.startTime}>
													{new Date(run.startTime).toLocaleString()}
												</time>
											</p>
											{run.errorMessage && (
												<p className="text-[10px] text-red-400 mt-1 truncate">
													Error: {run.errorMessage}
												</p>
											)}
										</div>
										{run.finalScreenshot && (
											<img
												src={getImageUrl(run.finalScreenshot)}
												alt="Final screenshot"
												className="w-16 h-16 object-cover rounded border border-slate-700"
											/>
										)}
									</div>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
