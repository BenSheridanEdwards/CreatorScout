import { useCallback, useEffect, useState } from "react";
import type { RunMetadata } from "../../types";

export default function Sessions() {
	const [sessions, setSessions] = useState<RunMetadata[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(true);

	const loadSessions = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/runs");
			if (!res.ok) {
				setError(`Failed to load sessions (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as RunMetadata[];
			setSessions(data);
		} catch {
			setError("Could not reach /api/runs. Is the API server running?");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadSessions();
		// Auto-refresh every 30 seconds
		const interval = setInterval(loadSessions, 30000);
		return () => clearInterval(interval);
	}, [loadSessions]);

	const formatDuration = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins > 60) {
			const hours = Math.floor(mins / 60);
			const remainingMins = mins % 60;
			return `${hours}h ${remainingMins}m`;
		}
		return `${mins}m ${secs}s`;
	};

	const formatTime = (isoString: string): string => {
		return new Date(isoString).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatDate = (isoString: string): string => {
		const date = new Date(isoString);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) {
			return "Today";
		} else if (date.toDateString() === yesterday.toDateString()) {
			return "Yesterday";
		}
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "completed":
				return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
			case "running":
				return "text-blue-400 bg-blue-500/10 border-blue-500/20";
			case "error":
				return "text-red-400 bg-red-500/10 border-red-500/20";
			case "scheduled":
				return "text-amber-400 bg-amber-500/10 border-amber-500/20";
			default:
				return "text-slate-400 bg-slate-500/10 border-slate-500/20";
		}
	};

	const getSessionTypeEmoji = (sessionType?: string) => {
		switch (sessionType) {
			case "morning":
				return "🌅";
			case "afternoon":
				return "☀️";
			case "evening":
				return "🌙";
			default:
				return "📋";
		}
	};

	// Filter to only show actual sessions (not old scroll tests)
	const realSessions = sessions.filter(
		(s) => s.scriptName === "discover" || s.sessionType,
	);

	// Group sessions by date
	const sessionsByDate = realSessions.reduce(
		(acc, session) => {
			const dateKey = formatDate(session.startTime);
			if (!acc[dateKey]) {
				acc[dateKey] = [];
			}
			acc[dateKey].push(session);
			return acc;
		},
		{} as Record<string, RunMetadata[]>,
	);

	// Get today's stats
	const todaySessions = sessionsByDate["Today"] || [];
	const completedToday = todaySessions.filter(
		(s) => s.status === "completed",
	).length;
	const creatorsToday = todaySessions.reduce(
		(sum, s) => sum + (s.creatorsFound || 0),
		0,
	);
	const dmsToday = todaySessions.reduce((sum, s) => sum + (s.dmsSent || 0), 0);

	return (
		<section className="xl:col-span-2">
			<header className="flex items-center justify-between mb-4">
				<button
					onClick={() => setExpanded(!expanded)}
					className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wide hover:text-slate-100 transition-colors"
					type="button"
				>
					<svg
						className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<title>Toggle</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5l7 7-7 7"
						/>
					</svg>
					Sessions
				</button>
				<button
					onClick={loadSessions}
					type="button"
					className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
					disabled={loading}
				>
					{loading ? "Loading..." : "Refresh"}
				</button>
			</header>

			{error && (
				<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 mb-4">
					<p className="text-sm text-red-400">{error}</p>
				</div>
			)}

			{expanded && (
				<div className="space-y-4">
					{/* Today's Summary */}
					<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
						<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
							Today's Summary
						</h4>
						<div className="grid grid-cols-3 gap-4">
							<div className="text-center">
								<p className="text-2xl font-bold text-emerald-400">
									{completedToday}
								</p>
								<p className="text-xs text-slate-500">Sessions</p>
							</div>
							<div className="text-center">
								<p className="text-2xl font-bold text-sky-400">{creatorsToday}</p>
								<p className="text-xs text-slate-500">Creators Found</p>
							</div>
							<div className="text-center">
								<p className="text-2xl font-bold text-purple-400">{dmsToday}</p>
								<p className="text-xs text-slate-500">DMs Sent</p>
							</div>
						</div>
					</div>

					{/* Session List by Date */}
					{Object.entries(sessionsByDate).map(([date, dateSessions]) => (
						<div
							key={date}
							className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
						>
							<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
								{date} ({dateSessions.length} session
								{dateSessions.length !== 1 ? "s" : ""})
							</h4>
							<div className="space-y-2">
								{dateSessions.map((session) => (
									<div
										key={session.id}
										className={`rounded-lg border p-3 ${getStatusColor(session.status)}`}
									>
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<span className="text-lg">
													{getSessionTypeEmoji(session.sessionType)}
												</span>
												<span className="font-medium text-slate-200 capitalize">
													{session.sessionType || session.scriptName}
												</span>
												<span
													className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(session.status)}`}
												>
													{session.status}
												</span>
											</div>
											<span className="text-xs text-slate-400">
												{formatTime(session.startTime)}
												{session.endTime && ` - ${formatTime(session.endTime)}`}
											</span>
										</div>

										<div className="grid grid-cols-4 gap-4 text-sm">
											<div>
												<p className="text-slate-500 text-xs">Profiles</p>
												<p className="text-slate-200 font-medium">
													{session.profilesChecked || session.profilesProcessed || 0}
												</p>
											</div>
											<div>
												<p className="text-slate-500 text-xs">Creators</p>
												<p className="text-slate-200 font-medium">
													{session.creatorsFound || 0}
												</p>
											</div>
											<div>
												<p className="text-slate-500 text-xs">DMs</p>
												<p className="text-slate-200 font-medium">
													{session.dmsSent || 0}
												</p>
											</div>
											<div>
												<p className="text-slate-500 text-xs">Duration</p>
												<p className="text-slate-200 font-medium">
													{session.stats?.duration
														? formatDuration(session.stats.duration)
														: session.endTime
															? formatDuration(
																	Math.round(
																		(new Date(session.endTime).getTime() -
																			new Date(session.startTime).getTime()) /
																			1000,
																	),
																)
															: "—"}
												</p>
											</div>
										</div>

										{session.errorMessage && (
											<div className="mt-2 p-2 bg-red-500/10 rounded border border-red-500/20">
												<p className="text-xs text-red-400">
													{session.errorMessage}
												</p>
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					))}

					{realSessions.length === 0 && !loading && (
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center">
							<p className="text-slate-400">No sessions yet</p>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
