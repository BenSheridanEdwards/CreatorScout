import { useState, useEffect, useRef, useCallback } from "react";
import type { RunMetadata, ScheduledRun, TimelineCard } from "../../types";

interface TimelineCarouselProps {
	onRunSelect: (run: RunMetadata) => void;
	selectedAccount?: string;
}

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}m ${secs}s`;
}

function calculateTimelinePosition(timestamp: string, startTime: number): number {
	const time = new Date(timestamp).getTime();
	const pixelsPerMinute = 8; // 8 pixels per minute for better spacing between cards
	return ((time - startTime) / (1000 * 60)) * pixelsPerMinute;
}

export default function TimelineCarousel({
	onRunSelect,
	selectedAccount = "all",
}: TimelineCarouselProps) {
	const [runs, setRuns] = useState<RunMetadata[]>([]);
	const [scheduledRuns, setScheduledRuns] = useState<ScheduledRun[]>([]);
	const [loading, setLoading] = useState(false);
	const [currentTime, setCurrentTime] = useState(Date.now());
	const [isHovered, setIsHovered] = useState(false);
	const timelineRef = useRef<HTMLDivElement>(null);
	const currentTimeLineRef = useRef<HTMLDivElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const [wsConnected, setWsConnected] = useState(false);

	// Update current time every second
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(Date.now());
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Load runs and scheduled runs
	const loadData = useCallback(async () => {
		setLoading(true);
		try {
			// Load actual runs
			const runsRes = await fetch("/api/runs");
			if (runsRes.ok) {
				const runsData = (await runsRes.json()) as RunMetadata[];
				setRuns(runsData);
			} else {
				console.error("Failed to load runs:", runsRes.status);
			}

			// Load scheduled runs (gracefully handle failures)
			try {
				const scheduleRes = await fetch("/api/schedule");
				if (scheduleRes.ok) {
					const scheduleData = (await scheduleRes.json()) as ScheduledRun[];
					setScheduledRuns(scheduleData);
				} else if (scheduleRes.status !== 404) {
					console.warn("Failed to load schedule:", scheduleRes.status);
				}
				// 404 is OK - means no schedule endpoint or no scheduled runs
			} catch (scheduleError) {
				console.warn("Schedule endpoint not available:", scheduleError);
				// Continue without scheduled runs
			}
		} catch (error) {
			console.error("Failed to load timeline data:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadData();
		const interval = setInterval(loadData, 10000); // Refresh every 10s (fallback polling)
		return () => clearInterval(interval);
	}, [loadData]);

	// WebSocket connection for live updates
	useEffect(() => {
		// Find the currently running run
		const runningRun = runs.find((r) => r.status === "running");
		if (!runningRun) {
			// Close WebSocket if no running run
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
				setWsConnected(false);
			}
			return;
		}

		// Connect to WebSocket
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/ws/runs?runId=${runningRun.id}`;
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			setWsConnected(true);
			ws.send(JSON.stringify({ action: "subscribe", runId: runningRun.id }));
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				if (message.type === "metrics" && message.data) {
					// Update run metrics
					setRuns((prevRuns) =>
						prevRuns.map((run) =>
							run.id === message.runId
								? {
										...run,
										profilesProcessed: message.data.metrics?.profilesProcessed || run.profilesProcessed,
										creatorsFound: message.data.metrics?.creatorsFound || run.creatorsFound,
										errors: message.data.metrics?.errors || run.errors,
									}
								: run,
						),
					);
				} else if (message.type === "snapshot" && message.data?.thumbnailPath) {
					// Update thumbnail
					setRuns((prevRuns) =>
						prevRuns.map((run) =>
							run.id === message.runId
								? {
										...run,
										finalScreenshot: message.data.thumbnailPath,
										screenshots: [...run.screenshots, message.data.thumbnailPath],
									}
								: run,
						),
					);
				}
			} catch (error) {
				console.error("Failed to parse WebSocket message:", error);
			}
		};

		ws.onerror = () => {
			setWsConnected(false);
		};

		ws.onclose = () => {
			setWsConnected(false);
			// Attempt reconnection after 5 seconds
			setTimeout(() => {
				if (runs.find((r) => r.status === "running")) {
					// Still have running run, reconnect
					wsRef.current = null;
				}
			}, 5000);
		};

		wsRef.current = ws;

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [runs]);

	// Poll for thumbnail updates during live runs
	useEffect(() => {
		const runningRun = runs.find((r) => r.status === "running");
		if (!runningRun || wsConnected) return; // Only poll if WebSocket not connected

		const pollThumbnail = async () => {
			try {
				const res = await fetch(`/api/runs/${runningRun.id}/thumbnail`);
				if (res.ok) {
					const data = (await res.json()) as { thumbnail?: string };
					if (data.thumbnail && !runningRun.screenshots.includes(data.thumbnail)) {
						setRuns((prevRuns) =>
							prevRuns.map((run) =>
								run.id === runningRun.id
									? {
											...run,
											finalScreenshot: data.thumbnail,
											screenshots: [...run.screenshots, data.thumbnail!],
										}
									: run,
							),
						);
					}
				}
			} catch (error) {
				console.error("Failed to poll thumbnail:", error);
			}
		};

		const interval = setInterval(pollThumbnail, 5000); // Poll every 5s
		return () => clearInterval(interval);
	}, [runs, wsConnected]);

	// Filter runs by account
	const filteredRuns = runs.filter(
		(run) => selectedAccount === "all" || run.profileId === selectedAccount,
	);
	const filteredScheduled = scheduledRuns.filter(
		(scheduled) =>
			selectedAccount === "all" || scheduled.profileId === selectedAccount,
	);

	// Convert to timeline cards
	const timelineCards: TimelineCard[] = [
		...filteredRuns.map((run) => ({
			id: run.id,
			type: run.status as "scheduled" | "running" | "completed" | "error",
			profileId: run.profileId || run.scriptName || "unknown",
			accountName: run.profileId || run.scriptName || "unknown",
			timestamp: run.startTime,
			thumbnail: run.finalScreenshot || (run.screenshots && run.screenshots.length > 0 ? run.screenshots[run.screenshots.length - 1] : undefined),
			hasIssues: (run.issues?.length || 0) > 0,
			elapsed:
				run.status === "running"
					? Math.floor((Date.now() - new Date(run.startTime).getTime()) / 1000)
					: undefined,
		})),
		...filteredScheduled.map((scheduled) => ({
			id: scheduled.id,
			type: "scheduled" as const,
			profileId: scheduled.profileId,
			accountName: scheduled.accountName || scheduled.profileId,
			timestamp: scheduled.scheduledTime,
			countdown: Math.max(
				0,
				Math.floor(
					(new Date(scheduled.scheduledTime).getTime() - currentTime) / 1000,
				),
			),
		})),
	].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	// Calculate timeline bounds - center on current time
	const allTimestamps = timelineCards.map((card) =>
		new Date(card.timestamp).getTime(),
	);
	
	// Determine how far cards extend from current time
	const dataStart = allTimestamps.length > 0 ? Math.min(...allTimestamps) : currentTime;
	const dataEnd = allTimestamps.length > 0 ? Math.max(...allTimestamps) : currentTime;
	const pastExtent = currentTime - dataStart;
	const futureExtent = dataEnd - currentTime;
	const maxExtent = Math.max(pastExtent, futureExtent);
	
	// Ensure minimum 4-hour window (2 hours each side), centered on current time
	const minWindow = 4 * 60 * 60 * 1000; // 4 hours total
	const halfWindow = Math.max(minWindow / 2, maxExtent + 60 * 60 * 1000); // At least 1 hour padding beyond cards
	
	const startTime = currentTime - halfWindow;
	const endTime = currentTime + halfWindow;

	// Auto-scroll to center timeline on current time
	useEffect(() => {
		if (!isHovered && timelineRef.current) {
			const currentTimePos = calculateTimelinePosition(
				new Date(currentTime).toISOString(),
				startTime,
			);
			
			// Center the current time line in the viewport
			const scrollPosition = Math.max(0, currentTimePos - timelineRef.current.clientWidth / 2);
			
			timelineRef.current.scrollTo({
				left: scrollPosition,
				behavior: "smooth",
			});
		}
	}, [currentTime, startTime, isHovered]);

	const currentTimePosition = calculateTimelinePosition(
		new Date(currentTime).toISOString(),
		startTime,
	);

	// Debug logging
	useEffect(() => {
		if (timelineCards.length > 0) {
			const scheduledCount = timelineCards.filter(c => c.type === "scheduled").length;
			const runCount = timelineCards.filter(c => c.type !== "scheduled").length;
			console.log(`Timeline: ${timelineCards.length} cards (${scheduledCount} scheduled, ${runCount} runs)`);
			console.log("Scheduled runs:", filteredScheduled.map(s => ({
				id: s.id,
				time: s.scheduledTime,
				countdown: Math.floor((new Date(s.scheduledTime).getTime() - currentTime) / 1000)
			})));
		}
	}, [timelineCards.length, filteredScheduled, currentTime]);

	return (
		<section
			className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
				<div>
					<h2 className="text-sm font-semibold text-slate-200">Run Timeline</h2>
					<p className="text-[11px] text-slate-400 mt-0.5">
						Horizontal timeline of scheduled, live, and completed runs
					</p>
				</div>
				<button
					onClick={loadData}
					type="button"
					className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
					disabled={loading}
				>
					{loading ? "Loading..." : "Refresh"}
				</button>
			</div>
			<div
				ref={timelineRef}
				className="relative flex-1 overflow-x-auto overflow-y-visible bg-gradient-to-b from-slate-950/60 to-slate-950/40"
				style={{ height: "600px", minHeight: "600px" }}
			>
				{loading ? (
					<div className="flex items-center justify-center h-full text-slate-400 text-sm">
						Loading timeline...
					</div>
				) : timelineCards.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-slate-500">
						<div className="text-sm mb-2">No runs scheduled or completed yet</div>
						<div className="text-xs text-slate-600">
							Run discovery scripts or check crontab for scheduled runs
						</div>
					</div>
				) : (
					<div
						className="relative h-full"
						style={{
							minWidth: `${Math.max(2000, ((endTime - startTime) / (1000 * 60)) * 2)}px`,
							paddingTop: "100px",
							paddingBottom: "100px",
						}}
					>
						{/* Timeline axis line - positioned lower to give more space for cards above */}
						<div
							className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-slate-600/60 to-transparent z-0"
							style={{ top: "75%", transform: "translateY(-50%)" }}
						/>

						{/* Time markers - show scheduled time for each run */}
						{timelineCards.map((card) => {
							const markerPosition = calculateTimelinePosition(
								card.timestamp,
								startTime,
							);
							const maxPosition = ((endTime - startTime) / (1000 * 60)) * 8; // Match pixelsPerMinute
							if (markerPosition < 0 || markerPosition > maxPosition) return null;
							
							const markerTime = new Date(card.timestamp);
							return (
								<div
									key={`marker-${card.id}`}
									className="absolute z-0"
									style={{
										left: `${markerPosition}px`,
										top: "75%",
										transform: "translate(-50%, -50%)",
									}}
								>
									<div className="w-0.5 h-4 bg-slate-600/40" />
									<div className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap font-mono">
										{markerTime.toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</div>
								</div>
							);
						})}

						{/* Current-time line */}
						{currentTimePosition >= 0 && (
							<div
								ref={currentTimeLineRef}
								className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-amber-400/20 to-transparent z-30 pointer-events-none"
								style={{
									left: `${currentTimePosition}px`,
									transform: "translateX(-50%)",
								}}
							>
								{/* Horizontal marker on timeline axis */}
								<div className="absolute top-[75%] -translate-y-1/2 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-amber-400/40" />
								{/* Central dot on timeline */}
								<div className="absolute top-[75%] -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-400/50 rounded-full border border-amber-400/60" />
							</div>
						)}

						{/* Timeline cards - positioned horizontally, stacked when overlapping */}
						{(() => {
							// Group cards by overlapping horizontal positions
							const cardWidth = 160; // w-40 = 160px
							const overlapThreshold = cardWidth * 0.5; // Cards overlap if within 50% of card width (80px)
							
							// Calculate positions for all cards
							const cardPositions = timelineCards.map((card) => ({
								card,
								position: calculateTimelinePosition(card.timestamp, startTime),
							}));
							
							// Group overlapping cards
							const groups: Array<Array<typeof cardPositions[0]>> = [];
							const processed = new Set<number>();
							
							cardPositions.forEach((item, index) => {
								if (processed.has(index)) return;
								
								const group = [item];
								processed.add(index);
								
								// Find all cards that overlap with this one
								cardPositions.forEach((other, otherIndex) => {
									if (processed.has(otherIndex)) return;
									
									const distance = Math.abs(item.position - other.position);
									if (distance < overlapThreshold) {
										group.push(other);
										processed.add(otherIndex);
									}
								});
								
								// Sort group by position
								group.sort((a, b) => a.position - b.position);
								groups.push(group);
							});
							
							// Calculate vertical positions for each group
							const baseCardHeight = 256; // h-64 = 256px
							const minCardHeight = 120; // Minimum height when stacked
							const cardSpacing = 8; // Space between stacked cards
							const baseOffset = 20; // Distance from timeline
							
							return groups.flatMap((group, groupIndex) => {
								const stackHeight = group.length;
								const cardHeight = stackHeight > 1 
									? Math.max(minCardHeight, baseCardHeight / stackHeight)
									: baseCardHeight;
								
								return group.map((item, stackIndex) => {
									const card = item.card;
									const position = item.position;
									
									const isScheduled = card.type === "scheduled";
									const isRunning = card.type === "running";
									const isCompleted = card.type === "completed";
									const isError = card.type === "error";
									
									// Calculate vertical position - stack upward from timeline (timeline is at 75%)
									const verticalOffset = baseOffset + (stackIndex * (cardHeight + cardSpacing));
									const cardTop = `calc(75% - ${verticalOffset + cardHeight}px)`;
									const connectionLineHeight = verticalOffset;
									
									return { card, position, cardTop, connectionLineHeight, cardHeight, isScheduled, isRunning, isCompleted, isError };
								});
							});
						})().map(({ card, position, cardTop, connectionLineHeight, cardHeight, isScheduled, isRunning, isCompleted, isError }) => {

							return (
								<div
									key={card.id}
									className="absolute cursor-pointer z-20 group"
									style={{
										left: `${position}px`,
										top: cardTop,
										transform: "translateX(-50%)",
									}}
									onClick={() => {
										const run = runs.find((r) => r.id === card.id);
										if (run) {
											onRunSelect(run);
										}
									}}
								>
									{/* Connection line to timeline */}
									<div
										className={`absolute left-1/2 -translate-x-1/2 w-0.5 ${
											isScheduled
												? "bg-slate-500/50"
												: isRunning
													? "bg-sky-400/50"
													: isCompleted
														? "bg-emerald-400/50"
														: "bg-red-400/50"
										}`}
										style={{
											height: `${connectionLineHeight}px`,
											bottom: `-${connectionLineHeight}px`,
										}}
									/>

									{/* Card - Pokemon card style: tall and thin, height adjusts when stacked */}
									<div
										className={`w-40 rounded-xl border-2 transition-all shadow-xl hover:shadow-2xl hover:scale-105 backdrop-blur-sm flex flex-col ${
											isScheduled
												? "bg-slate-800/95 border-slate-600 border-dashed hover:border-slate-500"
												: isRunning
													? "bg-gradient-to-b from-sky-900/95 to-sky-800/95 border-sky-400 hover:border-sky-300 ring-2 ring-sky-500/30 animate-pulse"
													: isCompleted
														? "bg-gradient-to-b from-emerald-900/70 to-emerald-800/50 border-emerald-500 hover:border-emerald-400"
														: "bg-gradient-to-b from-red-900/70 to-red-800/50 border-red-500 hover:border-red-400"
										}`}
										style={{ height: `${cardHeight}px` }}
									>
										{/* Card header */}
										<div className="p-3 border-b border-slate-700/50">
											<div className="flex items-center justify-between mb-2">
												<span className="text-xs font-bold text-slate-100 truncate">
													{card.accountName}
												</span>
												{card.hasIssues && (
													<span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0 shadow-lg shadow-amber-400/50" />
												)}
											</div>
											{isRunning && (
												<span className="px-1.5 py-0.5 text-[9px] font-bold text-sky-100 bg-sky-500/40 rounded animate-pulse border border-sky-400/50">
													LIVE
												</span>
											)}
										</div>

										{/* Card body */}
										<div className="flex-1 p-3 flex flex-col">
											{isScheduled && card.countdown !== undefined && (
												<div className="text-center mb-3">
													<div className="text-[10px] text-slate-400 mb-1">⏰ Scheduled</div>
													<div className="text-lg font-mono font-bold text-slate-200">
														{formatDuration(card.countdown)}
													</div>
													<div className="text-[9px] text-slate-500 mt-1">until start</div>
												</div>
											)}
											{isRunning && card.elapsed !== undefined && (
												<div className="text-center mb-3">
													<div className="text-[10px] text-sky-400 mb-1 flex items-center justify-center gap-1">
														<span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
														<span>Running</span>
													</div>
													<div className="text-lg font-mono font-bold text-sky-200">
														{formatDuration(card.elapsed)}
													</div>
													<div className="text-[9px] text-sky-400/70 mt-1">elapsed</div>
												</div>
											)}
											{isCompleted && (
												<div className="text-center mb-3">
													<div className="text-2xl mb-2">✓</div>
													<div className="text-xs text-emerald-300 font-semibold">Completed</div>
												</div>
											)}
											{isError && (
												<div className="text-center mb-3">
													<div className="text-2xl mb-2">✗</div>
													<div className="text-xs text-red-300 font-semibold">Error</div>
												</div>
											)}

											{/* Thumbnail - only show if card is tall enough */}
											{card.thumbnail && cardHeight > 150 && (
												<div className="mt-auto rounded-lg overflow-hidden border border-slate-700/50 group-hover:border-slate-600 transition">
													<img
														src={`http://localhost:4000${card.thumbnail}`}
														alt="Thumbnail"
														className="w-full object-cover"
														style={{ height: `${Math.min(128, cardHeight * 0.5)}px` }}
														onError={(e) => {
															(e.target as HTMLImageElement).style.display = 'none';
														}}
													/>
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}

