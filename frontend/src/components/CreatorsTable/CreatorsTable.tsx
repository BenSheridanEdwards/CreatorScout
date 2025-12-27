import { useState, useEffect } from "react";

interface Creator {
	username: string;
	bioText: string | null;
	confidence: number;
	manualOverride: boolean;
	dmSent: boolean;
	dmSentAt: string | null;
	dmSentBy: string | null;
	visitedAt: string;
	followers: number | null;
	hidden: boolean;
	hiddenAt: string | null;
}

interface CreatorsResponse {
	creators: Creator[];
	total: number;
	pendingCount: number;
	page: number;
	totalPages: number;
}

export default function CreatorsTable() {
	const [creators, setCreators] = useState<Creator[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [total, setTotal] = useState(0);
	const [pendingCount, setPendingCount] = useState(0);
	const [dmFilter, setDmFilter] = useState<"all" | "pending" | "sent">(
		"pending",
	);
	const [maxFollowers, setMaxFollowers] = useState<number | null>(100000);

	// Load creators with pending filter and 100k followers limit on mount
	useEffect(() => {
		async function loadInitialCreators() {
			setLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({
					page: "1",
					limit: "50",
					dmFilter: "pending",
					maxFollowers: "100000",
				});
				const res = await fetch(`/api/creators?${params.toString()}`);
				if (!res.ok) {
					setError(`Failed to load creators (status ${res.status}).`);
					return;
				}
				const data = (await res.json()) as CreatorsResponse;
				setCreators(data.creators);
				setPage(data.page);
				setTotalPages(data.totalPages);
				setTotal(data.total);
				setPendingCount(data.pendingCount);
			} catch {
				setError("Could not reach /api/creators. Is the API server running?");
			} finally {
				setLoading(false);
			}
		}
		void loadInitialCreators();
	}, []);

	async function loadCreators(
		pageNum = 1,
		filter = dmFilter,
		maxFollowersFilter = maxFollowers,
	) {
		setLoading(true);
		setError(null);
		try {
			const params = new URLSearchParams({
				page: pageNum.toString(),
				limit: "50",
				dmFilter: filter,
			});
			if (maxFollowersFilter !== null) {
				params.append("maxFollowers", maxFollowersFilter.toString());
			}
			const res = await fetch(`/api/creators?${params.toString()}`);
			if (!res.ok) {
				setError(`Failed to load creators (status ${res.status}).`);
				return;
			}
			const data = (await res.json()) as CreatorsResponse;
			setCreators(data.creators);
			setPage(data.page);
			setTotalPages(data.totalPages);
			setTotal(data.total);
			setPendingCount(data.pendingCount);
		} catch {
			setError("Could not reach /api/creators. Is the API server running?");
		} finally {
			setLoading(false);
		}
	}

	async function toggleDmSent(username: string, currentStatus: boolean) {
		try {
			const res = await fetch(`/api/creators/${username}/dm`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ dmSent: !currentStatus }),
			});
			if (!res.ok) return;

			setCreators((prev) =>
				prev.map((c) =>
					c.username === username
						? {
								...c,
								dmSent: !currentStatus,
								dmSentAt: !currentStatus ? new Date().toISOString() : null,
							}
						: c,
				),
			);
		} catch (err) {
			console.error("Failed to update DM status:", err);
		}
	}

	async function updateDmSentBy(username: string, dmSentBy: string | null) {
		try {
			const res = await fetch(`/api/creators/${username}/dm-sent-by`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ dmSentBy }),
			});
			if (!res.ok) return;

			setCreators((prev) =>
				prev.map((c) => (c.username === username ? { ...c, dmSentBy } : c)),
			);
		} catch (err) {
			console.error("Failed to update dmSentBy:", err);
		}
	}

	async function toggleHidden(
		username: string,
		currentStatus: boolean | null | undefined,
	) {
		try {
			// Treat null/undefined as false (not hidden)
			const isCurrentlyHidden = currentStatus === true;
			const newHiddenStatus = !isCurrentlyHidden;

			console.log(
				`Toggling hidden for ${username}: ${isCurrentlyHidden} -> ${newHiddenStatus}`,
			);

			const res = await fetch(`/api/creators/${username}/hide`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ hidden: newHiddenStatus }),
			});
			if (!res.ok) {
				console.error(
					`Failed to hide creator: ${res.status} ${res.statusText}`,
				);
				const errorText = await res.text();
				console.error("Error response:", errorText);
				return;
			}

			const data = await res.json();
			console.log("Hide toggle successful:", data);

			// Remove from list since hidden creators are filtered out
			setCreators((prev) => prev.filter((c) => c.username !== username));
			// Reload to get updated counts
			loadCreators(page, dmFilter, maxFollowers);
		} catch (err) {
			console.error("Failed to update hidden status:", err);
		}
	}

	return (
		<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden xl:col-span-2">
			<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
				<div>
					<h2 className="text-sm font-semibold text-slate-200">
						Confirmed Creators
					</h2>
					<p className="text-[11px] text-slate-400 mt-0.5">
						{total} total creators •{" "}
						<span className="text-amber-400">{pendingCount} awaiting DMs</span>{" "}
						• Click checkbox to mark DM as sent
					</p>
				</div>
				<div className="flex items-center gap-3">
					<select
						value={dmFilter}
						onChange={(e) => {
							const newFilter = e.target.value as "all" | "pending" | "sent";
							setDmFilter(newFilter);
							loadCreators(1, newFilter, maxFollowers);
						}}
						className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-colors"
					>
						<option value="all">All</option>
						<option value="pending">DM Pending</option>
						<option value="sent">DM Sent</option>
					</select>
					<div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/50">
						<button
							type="button"
							onClick={() => {
								const newMaxFollowers = maxFollowers === 100000 ? null : 100000;
								setMaxFollowers(newMaxFollowers);
								loadCreators(1, dmFilter, newMaxFollowers);
							}}
							className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
								maxFollowers === 100000
									? "bg-emerald-500 focus:ring-emerald-500/50"
									: "bg-slate-700 focus:ring-slate-600"
							}`}
						>
							<span
								className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-all duration-200 ease-in-out ${
									maxFollowers === 100000 ? "translate-x-6" : "translate-x-1"
								}`}
							/>
						</button>
						<span className="text-xs font-medium text-slate-300">
							Followers &lt; 100k
						</span>
					</div>
					<button
						onClick={() => loadCreators(page, dmFilter, maxFollowers)}
						disabled={loading}
						type="button"
						className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800/50 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
					>
						{loading ? "Loading..." : "Load creators"}
					</button>
				</div>
			</div>

			{error && (
				<div className="px-4 py-2 text-[11px] text-amber-400 border-b border-slate-800 bg-slate-950/60">
					{error}
				</div>
			)}

			<div className="flex-1 overflow-auto px-4 py-3 bg-slate-950/60 max-h-[600px]">
				{creators.length === 0 ? (
					<p className="text-xs text-slate-500">
						No creators yet. Run discovery scripts, then hit "Load creators".
					</p>
				) : (
					<table className="w-full text-xs">
						<thead className="sticky top-0 bg-slate-950">
							<tr className="border-b border-slate-800 text-left">
								<th className="pb-2 pr-3 text-slate-400 font-semibold">
									Username
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold">Bio</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									Conf.
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									Followers
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									Manual
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									DM Sent
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									DM Date
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									DM Sent By
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									Discovered
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									Hide
								</th>
							</tr>
						</thead>
						<tbody>
							{creators.map((creator) => (
								<tr
									key={creator.username}
									className="border-b border-slate-800/50 hover:bg-slate-800/30"
								>
									<td className="py-2 pr-3">
										<a
											href={`https://instagram.com/${creator.username}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-emerald-400 hover:text-emerald-300 font-medium"
										>
											@{creator.username}
										</a>
									</td>
									<td className="py-2 pr-3 text-slate-300 max-w-xs truncate">
										{creator.bioText || (
											<span className="text-slate-500">No bio</span>
										)}
									</td>
									<td className="py-2 pr-3 text-center">
										<span
											className={`px-2 py-0.5 rounded text-[10px] font-medium ${
												creator.confidence >= 90
													? "bg-emerald-500/20 text-emerald-300"
													: creator.confidence >= 70
														? "bg-sky-500/20 text-sky-300"
														: "bg-amber-500/20 text-amber-300"
											}`}
										>
											{creator.confidence}%
										</span>
									</td>
									<td className="py-2 pr-3 text-center text-slate-300">
										{creator.followers !== null &&
										creator.followers !== undefined
											? creator.followers.toLocaleString()
											: "-"}
									</td>
									<td className="py-2 pr-3 text-center">
										{creator.manualOverride ? (
											<span className="text-purple-400" title="Manual override">
												🔧
											</span>
										) : (
											<span className="text-slate-600" title="Automated">
												🤖
											</span>
										)}
									</td>
									<td className="py-2 pr-3 text-center">
										<input
											type="checkbox"
											checked={creator.dmSent}
											onChange={() =>
												toggleDmSent(creator.username, creator.dmSent)
											}
											className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
										/>
									</td>
									<td className="py-2 pr-3 text-slate-400 text-center">
										{creator.dmSentAt
											? new Date(creator.dmSentAt).toLocaleDateString()
											: "-"}
									</td>
									<td className="py-2 pr-3 text-center">
										<input
											type="text"
											value={creator.dmSentBy || ""}
											onChange={(e) => {
												const newValue = e.target.value.trim() || null;
												updateDmSentBy(creator.username, newValue);
											}}
											onBlur={(e) => {
												const newValue = e.target.value.trim() || null;
												if (newValue !== (creator.dmSentBy || null)) {
													updateDmSentBy(creator.username, newValue);
												}
											}}
											placeholder="username"
											className="w-24 px-2 py-1 text-xs rounded border border-slate-700 bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500"
										/>
									</td>
									<td className="py-2 pr-3 text-slate-400 text-center">
										{new Date(creator.visitedAt).toLocaleDateString()}
									</td>
									<td className="py-2 pr-3 text-center">
										<button
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												console.log(
													"Hide button clicked for:",
													creator.username,
													"current hidden:",
													creator.hidden,
												);
												toggleHidden(creator.username, creator.hidden ?? false);
											}}
											type="button"
											title="Strike off / Hide creator (e.g., male, not a creator to DM)"
											className="text-red-400 hover:text-red-300 text-lg font-bold transition hover:scale-110"
										>
											✕
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{totalPages > 1 && (
				<div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between text-xs">
					<div className="text-slate-400">
						Page {page} of {totalPages}
					</div>
					<div className="flex gap-2">
						<button
							onClick={() => loadCreators(page - 1, dmFilter, maxFollowers)}
							disabled={page === 1 || loading}
							type="button"
							className="px-3 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<button
							onClick={() => loadCreators(page + 1, dmFilter, maxFollowers)}
							disabled={page >= totalPages || loading}
							type="button"
							className="px-3 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</section>
	);
}
