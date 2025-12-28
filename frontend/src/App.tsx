import { useState } from "react";
import CreatorsTable from "./components/CreatorsTable/CreatorsTable";
import StatsCards from "./components/StatsCards/StatsCards";
import RecentRuns from "./components/RecentRuns/RecentRuns";
import Screenshots from "./components/Screenshots/Screenshots";
import ScreenshotModal from "./components/ScreenshotModal/ScreenshotModal";
import RunDetailsModal from "./components/RunDetailsModal/RunDetailsModal";
import type { Screenshot, RunMetadata } from "./types";

function App() {
	const [selectedScreenshot, setSelectedScreenshot] =
		useState<Screenshot | null>(null);
	const [selectedRun, setSelectedRun] = useState<RunMetadata | null>(null);

	async function refreshLogs(run?: RunMetadata | null) {
		try {
			let url = "/api/logs?limit=500";
			if (run) {
				// Filter logs by run's time window
				url += `&startTime=${encodeURIComponent(run.startTime)}`;
				if (run.endTime) {
					url += `&endTime=${encodeURIComponent(run.endTime)}`;
				}
			}
			const res = await fetch(url);
			if (!res.ok) {
				// eslint-disable-next-line no-console
				console.error(
					`[Scout Studio] /api/logs failed with status ${res.status}.`,
				);
				return;
			}
			const data = (await res.json()) as { entries?: any[] };
			// eslint-disable-next-line no-console
			console.log("[Scout Studio] Logs loaded:", data.entries?.length ?? 0);
		} catch {
			// eslint-disable-next-line no-console
			console.error(
				"[Scout Studio] Network error while calling /api/logs. " +
					"Verify that `npm run dev:server` is running on port 4000.",
			);
		}
	}

	function handleRunSelect(run: RunMetadata) {
		setSelectedRun(run);
		void refreshLogs(run);
	}

	return (
		<div className="min-h-screen flex flex-col">
			<header className="border-b border-slate-800 px-6 py-4">
				<div>
					<h1 className="text-xl font-semibold tracking-tight">Scout Studio</h1>
					<p className="text-sm text-slate-400">
						Dashboard for creator discovery and outreach
					</p>
				</div>
			</header>

			<main className="flex-1 grid grid-cols-1 gap-6 p-6">
				<StatsCards />

				<CreatorsTable />

				<RecentRuns onRunSelect={handleRunSelect} />

				<Screenshots onScreenshotSelect={setSelectedScreenshot} />
			</main>

			{selectedScreenshot && (
				<ScreenshotModal
					screenshot={selectedScreenshot}
					onClose={() => setSelectedScreenshot(null)}
				/>
			)}

			{selectedRun && (
				<RunDetailsModal
					run={selectedRun}
					onClose={() => setSelectedRun(null)}
				/>
			)}
		</div>
	);
}

export default App;
