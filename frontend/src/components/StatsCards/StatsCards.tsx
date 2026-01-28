import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import type { Stats } from "../../types";

export default function StatsCards() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [statsLoading, setStatsLoading] = useState(false);
	const [statsError, setStatsError] = useState<string | null>(null);

	const loadStats = useCallback(async () => {
		setStatsLoading(true);
		setStatsError(null);
		try {
			const res = await apiFetch("/api/stats");
			if (!res.ok) {
				setStatsError(`Failed to load stats (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as Stats;
			setStats(data);
		} catch {
			setStatsError("Could not reach /api/stats. Is the API server running?");
		} finally {
			setStatsLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadStats();
	}, [loadStats]);

	return (
		<section className="xl:col-span-2">
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
					Statistics
				</h2>
				<button
					onClick={loadStats}
					type="button"
					className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
					disabled={statsLoading}
				>
					{statsLoading ? "Loading..." : "Refresh"}
				</button>
			</header>
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
					<div className="flex items-center justify-between">
						<div className="flex-1">
							<div className="flex items-center gap-1.5 mb-1">
								<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									Avatar Creators Found
								</p>
								<div className="group relative">
									<svg
										className="w-3.5 h-3.5 text-slate-500 hover:text-slate-400 cursor-help"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
										<div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 shadow-xl w-64">
											<p className="font-medium mb-1.5">Filter Parameters:</p>
											<ul className="space-y-1 text-slate-300">
												<li>• Followers: &lt; 100k</li>
												<li>• Excludes hidden creators</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
							{statsLoading ? (
								<p className="text-2xl font-bold text-slate-300">Loading...</p>
							) : statsError ? (
								<p className="text-sm text-amber-400">{statsError}</p>
							) : (
								<p className="text-3xl font-bold text-emerald-400">
									{stats?.creatorsFound ?? 0}
								</p>
							)}
						</div>
						<div className="rounded-full bg-emerald-500/10 p-3">
							<svg
								className="w-8 h-8 text-emerald-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
								/>
							</svg>
						</div>
					</div>
				</div>
				<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
								DMs Sent
							</p>
							{statsLoading ? (
								<p className="text-2xl font-bold text-slate-300">Loading...</p>
							) : statsError ? (
								<p className="text-sm text-amber-400">{statsError}</p>
							) : (
								<p className="text-3xl font-bold text-sky-400">
									{stats?.dmsSent ?? 0}
								</p>
							)}
						</div>
						<div className="rounded-full bg-sky-500/10 p-3">
							<svg
								className="w-8 h-8 text-sky-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								/>
							</svg>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
