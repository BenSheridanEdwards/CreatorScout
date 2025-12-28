import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { RunMetadata } from "../../types";

interface RunDetailsModalProps {
	run: RunMetadata;
	onClose: () => void;
}

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
				<div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
						<div className="bg-slate-800/50 rounded-lg p-3">
							<div className="text-xs text-slate-400 mb-1">
								Profiles Processed
							</div>
							<div className="text-2xl font-bold text-slate-200">
								{run.profilesProcessed}
							</div>
						</div>
						<div className="bg-emerald-500/10 rounded-lg p-3">
							<div className="text-xs text-emerald-400 mb-1">
								Creators Found
							</div>
							<div className="text-2xl font-bold text-emerald-300">
								{run.creatorsFound}
							</div>
						</div>
						<div className="bg-red-500/10 rounded-lg p-3">
							<div className="text-xs text-red-400 mb-1">Errors</div>
							<div className="text-2xl font-bold text-red-300">
								{run.errors}
							</div>
						</div>
						<div className="bg-slate-800/50 rounded-lg p-3">
							<div className="text-xs text-slate-400 mb-1">Duration</div>
							<div className="text-2xl font-bold text-slate-200">
								{formatDuration(run.stats?.duration)}
							</div>
						</div>
					</div>

					{run.creatorsFoundList && run.creatorsFoundList.length > 0 && (
						<div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 mb-4">
							<h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
								<span>✨</span>
								Creators Found ({run.creatorsFoundList.length})
							</h4>
							<div className="space-y-2 max-h-60 overflow-y-auto">
								{run.creatorsFoundList.map((creator, idx) => (
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
											{creator.reason} •{" "}
											{new Date(creator.timestamp).toLocaleTimeString()}
										</div>
										{creator.screenshotPath && (
											<button
												onClick={() =>
													window.open(
														`http://localhost:4000${creator.screenshotPath}`,
														"_blank",
													)
												}
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

					{run.errorLogs && run.errorLogs.length > 0 && (
						<div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-4">
							<h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
								<span>❌</span>
								Error Logs ({run.errorLogs.length})
							</h4>
							<div className="space-y-2 max-h-60 overflow-y-auto">
								{run.errorLogs.map((error, idx) => (
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

					{run.screenshots.length > 0 && (
						<div>
							<h4 className="text-sm font-semibold text-slate-200 mb-3">
								Screenshots ({run.screenshots.length})
							</h4>
							<div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
								{run.screenshots.map((screenshot, idx) => (
									<img
										key={idx}
										src={`http://localhost:4000${screenshot}`}
										alt={`Screenshot ${idx + 1}`}
										className="w-full h-24 object-cover rounded border border-slate-700 hover:border-slate-500 transition cursor-pointer"
										onClick={() =>
											window.open(
												`http://localhost:4000${screenshot}`,
												"_blank",
											)
										}
									/>
								))}
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
