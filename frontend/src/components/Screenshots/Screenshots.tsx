import { useState } from "react";
import type { Screenshot as ScreenshotType } from "../../types";

interface ScreenshotsProps {
	onScreenshotSelect: (screenshot: ScreenshotType) => void;
}

export default function Screenshots({ onScreenshotSelect }: ScreenshotsProps) {
	const [screenshots, setScreenshots] = useState<ScreenshotType[]>([]);
	const [screenshotsLoading, setScreenshotsLoading] = useState(false);
	const [screenshotsError, setScreenshotsError] = useState<string | null>(null);
	const [screenshotTab, setScreenshotTab] = useState<
		"proof" | "analysis" | "errors"
	>("proof");

	async function loadScreenshots() {
		setScreenshotsLoading(true);
		setScreenshotsError(null);
		try {
			const res = await fetch("/api/screenshots");
			if (!res.ok) {
				setScreenshotsError(
					`Failed to load screenshots (status ${res.status}).`,
				);
				return;
			}
			const data = (await res.json()) as ScreenshotType[];
			// Sort by date, newest first
			data.sort(
				(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
			);
			setScreenshots(data);
		} catch {
			setScreenshotsError(
				"Could not reach /api/screenshots. Is the API server running?",
			);
		} finally {
			setScreenshotsLoading(false);
		}
	}

	return (
		<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
			<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
				<div>
					<h2 className="text-sm font-semibold text-slate-200">Screenshots</h2>
					<p className="text-[11px] text-slate-400 mt-0.5">
						Organized by type: proof, profile analysis, and errors
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
			{/* Tabs */}
			<div className="flex border-b border-slate-800 bg-slate-950/60">
				<button
					onClick={() => setScreenshotTab("proof")}
					type="button"
					className={`flex-1 px-4 py-2 text-xs font-medium transition ${
						screenshotTab === "proof"
							? "text-sky-300 border-b-2 border-sky-400 bg-slate-900/40"
							: "text-slate-400 hover:text-slate-300 hover:bg-slate-900/20"
					}`}
				>
					Proof ({screenshots.filter((s) => s.type === "dm").length})
				</button>
				<button
					onClick={() => setScreenshotTab("analysis")}
					type="button"
					className={`flex-1 px-4 py-2 text-xs font-medium transition ${
						screenshotTab === "analysis"
							? "text-emerald-300 border-b-2 border-emerald-400 bg-slate-900/40"
							: "text-slate-400 hover:text-slate-300 hover:bg-slate-900/20"
					}`}
				>
					Profile Analysis (
					{
						screenshots.filter(
							(s) => s.type === "profile" || s.type === "link",
						).length
					}
					)
				</button>
				<button
					onClick={() => setScreenshotTab("errors")}
					type="button"
					className={`flex-1 px-4 py-2 text-xs font-medium transition ${
						screenshotTab === "errors"
							? "text-red-300 border-b-2 border-red-400 bg-slate-900/40"
							: "text-slate-400 hover:text-slate-300 hover:bg-slate-900/20"
					}`}
				>
					Errors & Debug (
					{
						screenshots.filter(
							(s) => s.type === "error" || s.type === "debug",
						).length
					}
					)
				</button>
			</div>
			<div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-950/60 max-h-[600px]">
				{(() => {
					const filteredScreenshots = screenshots.filter((s) => {
						if (screenshotTab === "proof") return s.type === "dm";
						if (screenshotTab === "analysis")
							return s.type === "profile" || s.type === "link";
						if (screenshotTab === "errors")
							return s.type === "error" || s.type === "debug";
						return false;
					});

					if (filteredScreenshots.length === 0) {
						return (
							<p className="text-xs text-slate-500">
								No {screenshotTab} screenshots yet.
							</p>
						);
					}

					return (
						<>
							<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
								{filteredScreenshots.slice(0, 20).map((screenshot, idx) => (
									<button
										key={idx}
										onClick={() => onScreenshotSelect(screenshot)}
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
												<span
													className={`text-[10px] px-1.5 py-0.5 rounded ${
														screenshot.type === "profile"
															? "bg-emerald-500/20 text-emerald-300"
															: screenshot.type === "link"
																? "bg-purple-500/20 text-purple-300"
																: screenshot.type === "dm"
																	? "bg-sky-500/20 text-sky-300"
																	: screenshot.type === "error"
																		? "bg-red-500/20 text-red-300"
																		: screenshot.type === "debug"
																			? "bg-amber-500/20 text-amber-300"
																			: "bg-slate-700 text-slate-400"
													}`}
												>
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
							{filteredScreenshots.length > 20 && (
								<p className="text-[11px] text-slate-500 mt-3 text-center">
									Showing 20 of {filteredScreenshots.length} screenshots
								</p>
							)}
						</>
					);
				})()}
			</div>
		</section>
	);
}

