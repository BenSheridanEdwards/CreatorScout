import { useState, useEffect } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import type { RunMetadata } from "../../types";

interface RunDetailsModalProps {
	run: RunMetadata;
	onClose: () => void;
}

type Tab = "overview" | "logs" | "issues";

function formatDuration(seconds?: number): string {
	if (!seconds) return "N/A";
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}m ${secs}s`;
}

export default function RunDetailsModal({
	run,
	onClose,
}: RunDetailsModalProps) {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [logs, setLogs] = useState<
		Array<{
			timestamp?: string;
			message?: string;
			level?: string;
			raw?: string;
		}>
	>([]);
	const [logsLoading, setLogsLoading] = useState(false);

	// Load logs when Logs tab is active
	useEffect(() => {
		if (activeTab === "logs" && run) {
			setLogsLoading(true);
			let url = "/api/logs?limit=500";
			url += `&startTime=${encodeURIComponent(run.startTime)}`;
			if (run.endTime) {
				url += `&endTime=${encodeURIComponent(run.endTime)}`;
			}

			fetch(url)
				.then((res) => res.json())
				.then((data) => {
					setLogs(data.entries || []);
				})
				.catch((error) => {
					console.error("Failed to load logs:", error);
				})
				.finally(() => {
					setLogsLoading(false);
				});
		}
	}, [activeTab, run]);

	return (
		<Dialog open={true} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="bg-slate-900 border-slate-800 text-slate-200 max-w-6xl w-full max-h-[90vh] overflow-hidden p-0">
				<DialogHeader className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-row items-center justify-between space-y-0 z-10">
					<div>
						<DialogTitle className="text-lg font-semibold text-slate-200 uppercase">
							{run.scriptName}
						</DialogTitle>
						<DialogDescription className="sr-only">
							Run details for {run.scriptName} script
						</DialogDescription>
						<div className="flex items-center gap-2 mt-1">
							<span
								className={`text-xs px-2 py-0.5 rounded font-medium ${
									run.status === "completed"
										? "bg-emerald-500/20 text-emerald-300"
										: run.status === "running"
											? "bg-sky-500/20 text-sky-300"
											: "bg-red-500/20 text-red-300"
								}`}
							>
								{run.status}
							</span>
							<span className="text-xs text-slate-400">
								{new Date(run.startTime).toLocaleString()}
							</span>
						</div>
					</div>
					<DialogClose asChild>
						<button
							type="button"
							className="text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center"
						>
							×
						</button>
					</DialogClose>
				</DialogHeader>

				{/* Tabs */}
				<div className="border-b border-slate-800 px-4">
					<div className="flex gap-4">
						<button
							type="button"
							onClick={() => setActiveTab("overview")}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
								activeTab === "overview"
									? "border-sky-500 text-sky-300"
									: "border-transparent text-slate-400 hover:text-slate-200"
							}`}
						>
							Overview
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("logs")}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
								activeTab === "logs"
									? "border-sky-500 text-sky-300"
									: "border-transparent text-slate-400 hover:text-slate-200"
							}`}
						>
							Logs
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("issues")}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
								activeTab === "issues"
									? "border-sky-500 text-sky-300"
									: "border-transparent text-slate-400 hover:text-slate-200"
							}`}
						>
							Issues{" "}
							{run.issues && run.issues.length > 0 && `(${run.issues.length})`}
						</button>
					</div>
				</div>

				<div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
					{activeTab === "overview" && (
						<div className="space-y-6">
							{/* Key Metrics - Large Cards */}
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								<div className="bg-gradient-to-br from-slate-800/80 to-slate-900/60 rounded-xl p-4 border border-slate-700/50">
									<div className="text-xs text-slate-400 mb-2 font-medium">
										Profiles Processed
									</div>
									<div className="text-3xl font-bold text-slate-100">
										{run.profilesProcessed}
									</div>
									{run.stats?.successRate !== undefined && (
										<div className="text-xs text-slate-500 mt-1">
											{run.stats.successRate.toFixed(1)}% success
										</div>
									)}
								</div>
								<div className="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-xl p-4 border border-emerald-500/30">
									<div className="text-xs text-emerald-400 mb-2 font-medium">
										Creators Found
									</div>
									<div className="text-3xl font-bold text-emerald-300">
										{run.creatorsFound}
									</div>
									{run.profilesProcessed > 0 && (
										<div className="text-xs text-emerald-400/70 mt-1">
											{(
												(run.creatorsFound / run.profilesProcessed) *
												100
											).toFixed(1)}
											% discovery rate
										</div>
									)}
								</div>
								<div className="bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-xl p-4 border border-red-500/30">
									<div className="text-xs text-red-400 mb-2 font-medium">
										Errors
									</div>
									<div className="text-3xl font-bold text-red-300">
										{run.errors}
									</div>
									{run.profilesProcessed > 0 && (
										<div className="text-xs text-red-400/70 mt-1">
											{((run.errors / run.profilesProcessed) * 100).toFixed(1)}%
											error rate
										</div>
									)}
								</div>
								<div className="bg-gradient-to-br from-slate-800/80 to-slate-900/60 rounded-xl p-4 border border-slate-700/50">
									<div className="text-xs text-slate-400 mb-2 font-medium">
										Duration
									</div>
									<div className="text-3xl font-bold text-slate-100">
										{formatDuration(run.stats?.duration)}
									</div>
									{run.stats?.duration && run.profilesProcessed > 0 && (
										<div className="text-xs text-slate-500 mt-1">
											{Math.round(run.stats.duration / run.profilesProcessed)}s
											per profile
										</div>
									)}
								</div>
							</div>

							{/* Creators Found - Card Grid */}
							{run.creatorsFoundList && run.creatorsFoundList.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
										<span className="text-emerald-400">✨</span>
										Creators Found ({run.creatorsFoundList.length})
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
										{run.creatorsFoundList.map((creator) => (
											<div
												key={`${creator.username}-${creator.timestamp}`}
												className="bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 rounded-lg p-3 border border-emerald-500/20 hover:border-emerald-500/40 transition"
											>
												<div className="flex items-start justify-between mb-2">
													<a
														href={`https://instagram.com/${creator.username}`}
														target="_blank"
														rel="noopener noreferrer"
														className="text-sm font-bold text-emerald-300 hover:text-emerald-200"
													>
														@{creator.username}
													</a>
													<span className="text-xs px-2 py-1 rounded-full bg-emerald-500/30 text-emerald-200 font-semibold">
														{creator.confidence}%
													</span>
												</div>
												<div className="text-xs text-slate-400 mb-2">
													{creator.reason}
												</div>
												<div className="text-[10px] text-slate-500">
													{new Date(creator.timestamp).toLocaleString()}
												</div>
												{creator.screenshotPath && (
													<button
														type="button"
														onClick={() =>
															window.open(
																`http://localhost:4000${creator.screenshotPath}`,
																"_blank",
															)
														}
														className="text-xs text-purple-400 hover:text-purple-300 mt-2 w-full text-left"
													>
														📸 View screenshot
													</button>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Error Logs - Card Grid */}
							{run.errorLogs && run.errorLogs.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
										<span className="text-red-400">❌</span>
										Error Logs ({run.errorLogs.length})
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
										{run.errorLogs.map((error) => (
											<div
												key={`${error.timestamp}-${error.username || "unknown"}`}
												className="bg-gradient-to-br from-red-900/30 to-red-800/10 rounded-lg p-3 border border-red-500/20"
											>
												<div className="flex items-start justify-between mb-2">
													{error.username && (
														<span className="text-sm font-semibold text-red-300">
															@{error.username}
														</span>
													)}
													<span className="text-xs text-slate-500">
														{new Date(error.timestamp).toLocaleTimeString()}
													</span>
												</div>
												<div className="text-xs text-red-300 font-mono mb-2 break-words">
													{error.message}
												</div>
												{error.stack && (
													<details className="text-xs text-slate-400">
														<summary className="cursor-pointer hover:text-slate-300 mb-1">
															Stack trace
														</summary>
														<pre className="mt-2 p-2 bg-slate-950/50 rounded overflow-x-auto text-[10px]">
															{error.stack}
														</pre>
													</details>
												)}
											</div>
										))}
									</div>
								</div>
							)}

							{/* Screenshots */}
							{run.screenshots.length > 0 && (
								<div>
									<h3 className="text-sm font-semibold text-slate-200 mb-3">
										Screenshots ({run.screenshots.length})
									</h3>
									<div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
										{run.screenshots.map((screenshot, idx) => (
											<button
												type="button"
												key={screenshot}
												className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-slate-700 hover:border-slate-500 transition w-full p-0 bg-transparent"
												onClick={() =>
													window.open(
														`http://localhost:4000${screenshot}`,
														"_blank",
													)
												}
											>
												<img
													src={`http://localhost:4000${screenshot}`}
													alt={`Screenshot ${idx + 1}`}
													className="w-full h-32 object-cover"
												/>
												<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
													<span className="text-white opacity-0 group-hover:opacity-100 text-xs">
														View
													</span>
												</div>
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{activeTab === "logs" && (
						<div>
							{logsLoading ? (
								<div className="text-center py-8 text-slate-400">
									Loading logs...
								</div>
							) : logs.length === 0 ? (
								<div className="text-center py-8 text-slate-400">
									No logs available
								</div>
							) : (
								<div className="space-y-1 font-mono text-xs">
									{logs.map((log, idx) => (
										<div
											key={`${log.timestamp || idx}-${log.message || log.raw || idx}`}
											className="p-2 rounded hover:bg-slate-800/50 border border-transparent hover:border-slate-700"
										>
											<div className="flex gap-2">
												<span className="text-slate-500">
													{log.timestamp
														? new Date(log.timestamp).toLocaleTimeString()
														: ""}
												</span>
												<span
													className={
														log.level === "ERROR"
															? "text-red-400"
															: log.level === "WARN"
																? "text-amber-400"
																: "text-slate-300"
													}
												>
													{log.message || log.raw || JSON.stringify(log)}
												</span>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{activeTab === "issues" && (
						<div>
							{run.issues && run.issues.length > 0 ? (
								<div className="space-y-3">
									{run.issues.map((issue) => (
										<div
											key={`${issue.type}-${issue.detectedAt}`}
											className={`rounded-lg p-4 border ${
												issue.severity === "critical"
													? "bg-red-500/5 border-red-500/20"
													: "bg-amber-500/5 border-amber-500/20"
											}`}
										>
											<div className="flex items-start justify-between mb-2">
												<div className="flex items-center gap-2">
													<span
														className={`w-2 h-2 rounded-full ${
															issue.severity === "critical"
																? "bg-red-400"
																: "bg-amber-400"
														}`}
													/>
													<span className="text-sm font-semibold text-slate-200">
														{issue.type.replace(/_/g, " ")}
													</span>
													<span
														className={`text-xs px-2 py-0.5 rounded ${
															issue.severity === "critical"
																? "bg-red-500/20 text-red-300"
																: "bg-amber-500/20 text-amber-300"
														}`}
													>
														{issue.severity}
													</span>
												</div>
												{issue.logLine && (
													<button
														type="button"
														onClick={() => {
															setActiveTab("logs");
															// Scroll to log line (would need refs for actual implementation)
														}}
														className="text-xs text-sky-400 hover:text-sky-300"
													>
														Line {issue.logLine}
													</button>
												)}
											</div>
											<div className="text-sm text-slate-300">
												{issue.message}
											</div>
											<div className="text-xs text-slate-500 mt-2">
												Detected: {new Date(issue.detectedAt).toLocaleString()}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-8 text-slate-400">
									No issues detected
								</div>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
