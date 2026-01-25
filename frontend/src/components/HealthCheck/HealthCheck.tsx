import { useCallback, useEffect, useState } from "react";

interface HealthStatus {
	healthy: boolean;
	timestamp: string;
	uptime: number;
	checks: {
		database: CheckResult;
		scheduler: CheckResult;
		sessions: CheckResult;
		proxy: CheckResult;
		adspower?: CheckResult;
		display?: CheckResult;
		system?: CheckResult;
	};
	alerts: Alert[];
	systemInfo?: {
		platform: string;
		nodeVersion: string;
		memoryUsage: {
			used: number;
			total: number;
			percentage: number;
		};
		display?: string;
		browserProvider?: string;
	};
}

interface CheckResult {
	status: "ok" | "warning" | "error";
	message: string;
	details?: Record<string, unknown>;
}

interface Alert {
	level: "info" | "warning" | "error";
	message: string;
	timestamp: string;
}

export default function HealthCheck() {
	const [health, setHealth] = useState<HealthStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadHealth = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/health/detailed");
			if (!res.ok) {
				setError(`Failed to load health (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as HealthStatus;
			setHealth(data);
		} catch {
			setError("Could not reach /api/health/detailed. Is the API server running?");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadHealth();
		// Auto-refresh every 30 seconds
		const interval = setInterval(loadHealth, 30000);
		return () => clearInterval(interval);
	}, [loadHealth]);

	const getStatusColor = (status: string) => {
		switch (status) {
			case "ok":
				return "text-emerald-400";
			case "warning":
				return "text-amber-400";
			case "error":
				return "text-red-400";
			default:
				return "text-slate-400";
		}
	};

	const getStatusBg = (status: string) => {
		switch (status) {
			case "ok":
				return "bg-emerald-500/10 border-emerald-500/20";
			case "warning":
				return "bg-amber-500/10 border-amber-500/20";
			case "error":
				return "bg-red-500/10 border-red-500/20";
			default:
				return "bg-slate-500/10 border-slate-500/20";
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "ok":
				return (
					<svg
						className="w-5 h-5 text-emerald-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-label="OK"
					>
						<title>OK</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				);
			case "warning":
				return (
					<svg
						className="w-5 h-5 text-amber-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-label="Warning"
					>
						<title>Warning</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				);
			case "error":
				return (
					<svg
						className="w-5 h-5 text-red-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						aria-label="Error"
					>
						<title>Error</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				);
			default:
				return null;
		}
	};

	const formatUptime = (seconds: number) => {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		if (days > 0) return `${days}d ${hours}h ${minutes}m`;
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	};

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	};

	if (loading && !health) {
		return (
			<section className="xl:col-span-2">
				<header className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
						Health Check
					</h2>
				</header>
				<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
					<p className="text-slate-400">Loading health status...</p>
				</div>
			</section>
		);
	}

	return (
		<section className="xl:col-span-2">
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
					Health Check
				</h2>
				<button
					onClick={loadHealth}
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

			{health && (
				<div className="space-y-4">
					{/* Overall Status */}
					<div
						className={`rounded-xl border p-6 ${
							health.healthy
								? "bg-emerald-500/10 border-emerald-500/20"
								: "bg-red-500/10 border-red-500/20"
						}`}
					>
						<div className="flex items-center justify-between">
							<div>
								<div className="flex items-center gap-2 mb-2">
									{health.healthy ? (
										<svg
											className="w-6 h-6 text-emerald-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-label="Healthy"
										>
											<title>Healthy</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
									) : (
										<svg
											className="w-6 h-6 text-red-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											aria-label="Unhealthy"
										>
											<title>Unhealthy</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
									)}
									<h3 className="text-lg font-semibold text-slate-200">
										{health.healthy ? "All Systems Operational" : "Issues Detected"}
									</h3>
								</div>
								<p className="text-sm text-slate-400">
									Uptime: {formatUptime(health.uptime)} • Last checked:{" "}
									{new Date(health.timestamp).toLocaleTimeString()}
								</p>
							</div>
						</div>
					</div>

					{/* System Info */}
					{health.systemInfo && (
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
							<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
								System Information
							</h4>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
								<div>
									<p className="text-slate-500 text-xs mb-1">Platform</p>
									<p className="text-slate-200 font-medium">
										{health.systemInfo.platform}
									</p>
								</div>
								<div>
									<p className="text-slate-500 text-xs mb-1">Node.js</p>
									<p className="text-slate-200 font-medium">
										{health.systemInfo.nodeVersion}
									</p>
								</div>
								<div>
									<p className="text-slate-500 text-xs mb-1">Memory</p>
									<p className="text-slate-200 font-medium">
										{formatBytes(health.systemInfo.memoryUsage.used)} /{" "}
										{formatBytes(health.systemInfo.memoryUsage.total)} (
										{health.systemInfo.memoryUsage.percentage}%)
									</p>
								</div>
								<div>
									<p className="text-slate-500 text-xs mb-1">Browser</p>
									<p className="text-slate-200 font-medium">
										{health.systemInfo.browserProvider}
									</p>
								</div>
							</div>
							{health.systemInfo.display && (
								<div className="mt-3 pt-3 border-t border-slate-800">
									<p className="text-slate-500 text-xs mb-1">Display</p>
									<p className="text-slate-200 font-medium text-sm">
										{health.systemInfo.display}
									</p>
								</div>
							)}
						</div>
					)}

					{/* Health Checks */}
					<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
						<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
							Component Status
						</h4>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{Object.entries(health.checks).map(([key, check]) => (
								<div
									key={key}
									className={`rounded-lg border p-3 ${getStatusBg(check.status)}`}
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center gap-2 mb-1">
												{getStatusIcon(check.status)}
												<p className="text-sm font-medium text-slate-200 capitalize">
													{key}
												</p>
											</div>
											<p className={`text-xs ${getStatusColor(check.status)}`}>
												{check.message}
											</p>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Recent Alerts */}
					{health.alerts.length > 0 && (
						<div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
							<h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
								Recent Alerts ({health.alerts.length})
							</h4>
							<div className="space-y-2">
								{health.alerts.slice(-5).map((alert) => (
									<div
										key={`${alert.timestamp}-${alert.message}`}
										className={`rounded-lg border p-3 ${
											alert.level === "error"
												? "bg-red-500/10 border-red-500/20"
												: alert.level === "warning"
													? "bg-amber-500/10 border-amber-500/20"
													: "bg-blue-500/10 border-blue-500/20"
										}`}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<div className="flex items-center gap-2 mb-1">
													{alert.level === "error" ? (
														<svg
															className="w-4 h-4 text-red-400"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<title>Error</title>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
															/>
														</svg>
													) : alert.level === "warning" ? (
														<svg
															className="w-4 h-4 text-amber-400"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<title>Warning</title>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
															/>
														</svg>
													) : (
														<svg
															className="w-4 h-4 text-blue-400"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<title>Info</title>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
															/>
														</svg>
													)}
													<p className="text-xs font-medium text-slate-200 uppercase">
														{alert.level}
													</p>
												</div>
												<p className="text-xs text-slate-300">{alert.message}</p>
												<p className="text-xs text-slate-500 mt-1">
													{new Date(alert.timestamp).toLocaleString()}
												</p>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
