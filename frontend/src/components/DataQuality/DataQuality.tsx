import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";

interface DataQualityReport {
	timestamp: string;
	totalProfiles: number;
	profilesWithMissingData: {
		missingBio: number;
		missingFollowers: number;
		missingStats: number;
	};
	recentProfilesQuality: {
		last24Hours: {
			total: number;
			missingBio: number;
			missingFollowers: number;
		};
		lastHour: {
			total: number;
			missingBio: number;
			missingFollowers: number;
		};
	};
	alerts: Array<{
		level: "warning" | "error";
		message: string;
		field: string;
		threshold: number;
		actual: number;
	}>;
}

export default function DataQuality() {
	const [report, setReport] = useState<DataQualityReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadDataQuality = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await apiFetch("/api/data-quality");
			if (!res.ok) {
				setError(`Failed to load data quality (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as DataQualityReport;
			setReport(data);
		} catch {
			setError(
				"Could not reach /api/data-quality. Is the API server running?",
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadDataQuality();
		// Auto-refresh every 60 seconds
		const interval = setInterval(loadDataQuality, 60000);
		return () => clearInterval(interval);
	}, [loadDataQuality]);

	const getCompletionRate = (missing: number, total: number): number => {
		if (total === 0) return 100;
		return Math.round(((total - missing) / total) * 100);
	};

	const getStatusColor = (rate: number): string => {
		if (rate >= 90) return "text-emerald-400";
		if (rate >= 70) return "text-amber-400";
		return "text-red-400";
	};

	const getStatusBg = (rate: number): string => {
		if (rate >= 90) return "bg-emerald-500/10 border-emerald-500/20";
		if (rate >= 70) return "bg-amber-500/10 border-amber-500/20";
		return "bg-red-500/10 border-red-500/20";
	};

	const getProgressColor = (rate: number): string => {
		if (rate >= 90) return "bg-emerald-500";
		if (rate >= 70) return "bg-amber-500";
		return "bg-red-500";
	};

	if (loading && !report) {
		return (
			<section className="xl:col-span-2">
				<header className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
						Data Quality
					</h2>
				</header>
				<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
					<p className="text-slate-400">Loading data quality report...</p>
				</div>
			</section>
		);
	}

	return (
		<section className="xl:col-span-2">
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
					Data Quality Monitor
				</h2>
				<button
					onClick={loadDataQuality}
					type="button"
					className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
					disabled={loading}
				>
					{loading ? "Refreshing..." : "Refresh"}
				</button>
			</header>

			{error && (
				<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 mb-4">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}

			{report && (
				<div className="space-y-4">
					{/* Alerts Banner */}
					{report.alerts.length > 0 && (
						<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
							<div className="flex items-start gap-3">
								<svg
									className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Alert</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								<div>
									<h3 className="text-sm font-semibold text-red-400 mb-2">
										Data Quality Alerts ({report.alerts.length})
									</h3>
									<ul className="space-y-1">
										{report.alerts.map((alert, i) => (
											<li
												key={`${alert.field}-${i}`}
												className={`text-sm ${
													alert.level === "error"
														? "text-red-300"
														: "text-amber-300"
												}`}
											>
												• {alert.message}
											</li>
										))}
									</ul>
									<p className="text-xs text-slate-400 mt-2">
										This may indicate proxy blocking is preventing data
										extraction. Check logs for details.
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Summary Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
								Total Profiles
							</p>
							<p className="text-2xl font-bold text-slate-200">
								{report.totalProfiles.toLocaleString()}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
								Profiles (Last 24h)
							</p>
							<p className="text-2xl font-bold text-slate-200">
								{report.recentProfilesQuality.last24Hours.total.toLocaleString()}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
								Profiles (Last Hour)
							</p>
							<p className="text-2xl font-bold text-slate-200">
								{report.recentProfilesQuality.lastHour.total.toLocaleString()}
							</p>
						</div>
					</div>

					{/* Field Completion Rates */}
					<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
						<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
							Field Completion Rates (Last 24h)
						</h4>
						{report.recentProfilesQuality.last24Hours.total > 0 ? (
							<div className="space-y-4">
								{/* Bio */}
								{(() => {
									const rate = getCompletionRate(
										report.recentProfilesQuality.last24Hours.missingBio,
										report.recentProfilesQuality.last24Hours.total,
									);
									return (
										<div>
											<div className="flex justify-between text-sm mb-1">
												<span className="text-slate-300">Bio Text</span>
												<span className={getStatusColor(rate)}>{rate}%</span>
											</div>
											<div className="h-2 bg-slate-800 rounded-full overflow-hidden">
												<div
													className={`h-full ${getProgressColor(rate)} transition-all duration-300`}
													style={{ width: `${rate}%` }}
												/>
											</div>
											<p className="text-xs text-slate-500 mt-1">
												{report.recentProfilesQuality.last24Hours.total -
													report.recentProfilesQuality.last24Hours
														.missingBio}{" "}
												/{" "}
												{report.recentProfilesQuality.last24Hours.total}{" "}
												profiles have bio
											</p>
										</div>
									);
								})()}

								{/* Followers */}
								{(() => {
									const rate = getCompletionRate(
										report.recentProfilesQuality.last24Hours.missingFollowers,
										report.recentProfilesQuality.last24Hours.total,
									);
									return (
										<div>
											<div className="flex justify-between text-sm mb-1">
												<span className="text-slate-300">Followers Count</span>
												<span className={getStatusColor(rate)}>{rate}%</span>
											</div>
											<div className="h-2 bg-slate-800 rounded-full overflow-hidden">
												<div
													className={`h-full ${getProgressColor(rate)} transition-all duration-300`}
													style={{ width: `${rate}%` }}
												/>
											</div>
											<p className="text-xs text-slate-500 mt-1">
												{report.recentProfilesQuality.last24Hours.total -
													report.recentProfilesQuality.last24Hours
														.missingFollowers}{" "}
												/{" "}
												{report.recentProfilesQuality.last24Hours.total}{" "}
												profiles have followers count
											</p>
										</div>
									);
								})()}
							</div>
						) : (
							<p className="text-slate-400 text-sm">
								No profiles processed in the last 24 hours
							</p>
						)}
					</div>

					{/* Overall Stats */}
					<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
						<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
							Overall Field Completeness
						</h4>
						<div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
							<div
								className={`rounded-lg border p-3 ${getStatusBg(
									getCompletionRate(
										report.profilesWithMissingData.missingBio,
										report.totalProfiles,
									),
								)}`}
							>
								<p className="text-slate-500 text-xs mb-1">Bio Text</p>
								<p className="text-slate-200 font-medium">
									{(
										report.totalProfiles -
										report.profilesWithMissingData.missingBio
									).toLocaleString()}{" "}
									/ {report.totalProfiles.toLocaleString()}
								</p>
							</div>
							<div
								className={`rounded-lg border p-3 ${getStatusBg(
									getCompletionRate(
										report.profilesWithMissingData.missingFollowers,
										report.totalProfiles,
									),
								)}`}
							>
								<p className="text-slate-500 text-xs mb-1">Followers</p>
								<p className="text-slate-200 font-medium">
									{(
										report.totalProfiles -
										report.profilesWithMissingData.missingFollowers
									).toLocaleString()}{" "}
									/ {report.totalProfiles.toLocaleString()}
								</p>
							</div>
							<div
								className={`rounded-lg border p-3 ${getStatusBg(
									getCompletionRate(
										report.profilesWithMissingData.missingStats,
										report.totalProfiles,
									),
								)}`}
							>
								<p className="text-slate-500 text-xs mb-1">Engagement Stats</p>
								<p className="text-slate-200 font-medium">
									{(
										report.totalProfiles -
										report.profilesWithMissingData.missingStats
									).toLocaleString()}{" "}
									/ {report.totalProfiles.toLocaleString()}
								</p>
							</div>
						</div>
					</div>

					{/* Last Updated */}
					<p className="text-xs text-slate-500 text-right">
						Last checked: {new Date(report.timestamp).toLocaleString()}
					</p>
				</div>
			)}
		</section>
	);
}
