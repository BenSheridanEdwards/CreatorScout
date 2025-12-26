import { useState } from "react";

interface Creator {
	username: string;
	bioText: string | null;
	confidence: number;
	manualOverride: boolean;
	dmSent: boolean;
	dmSentAt: string | null;
	visitedAt: string;
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
	const [dmFilter, setDmFilter] = useState<"all" | "pending" | "sent">("all");

	async function loadCreators(pageNum = 1, filter = dmFilter) {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/creators?page=${pageNum}&limit=50&dmFilter=${filter}`,
			);
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
				<div className="flex items-center gap-2">
					<select
						value={dmFilter}
						onChange={(e) => {
							const newFilter = e.target.value as "all" | "pending" | "sent";
							setDmFilter(newFilter);
							loadCreators(1, newFilter);
						}}
						className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
					>
						<option value="all">All</option>
						<option value="pending">DM Pending</option>
						<option value="sent">DM Sent</option>
					</select>
					<button
						onClick={() => loadCreators(page, dmFilter)}
						disabled={loading}
						type="button"
						className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
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
									Manual
								</th>
								<th className="pb-2 pr-3 text-slate-400 font-semibold text-center">
									DM Sent
								</th>
								<th className="pb-2 text-slate-400 font-semibold">DM Date</th>
								<th className="pb-2 text-slate-400 font-semibold">
									Discovered
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
									<td className="py-2 text-slate-400">
										{creator.dmSentAt
											? new Date(creator.dmSentAt).toLocaleDateString()
											: "-"}
									</td>
									<td className="py-2 text-slate-400">
										{new Date(creator.visitedAt).toLocaleDateString()}
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
							onClick={() => loadCreators(page - 1, dmFilter)}
							disabled={page === 1 || loading}
							type="button"
							className="px-3 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<button
							onClick={() => loadCreators(page + 1, dmFilter)}
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
