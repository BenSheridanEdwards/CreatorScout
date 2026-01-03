import { useCallback, useEffect, useRef, useState } from "react";
import type { RunMetadata, ScheduledRun, TimelineCard } from "../../types";
import { getImageUrl } from "../../utils/imageUrl";
import ScheduleModal from "../ScheduleModal/ScheduleModal";
import { ToastContainer, useToast } from "../Toast/Toast";

interface DeleteDialogProps {
	onClose: () => void;
	onConfirm: () => void;
}

function DeleteDialog({ onClose, onConfirm }: DeleteDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog && typeof dialog.showModal === "function") {
			dialog.showModal();
			const handleEscape = (e: Event) => {
				if ((e as KeyboardEvent).key === "Escape") {
					onClose();
				}
			};
			dialog.addEventListener("cancel", handleEscape);
			return () => {
				dialog.removeEventListener("cancel", handleEscape);
			};
		}
	}, [onClose]);

	const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
		if (e.target === dialogRef.current) {
			onClose();
		}
	};

	const handleBackdropKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
		if (e.key === "Escape" && e.target === dialogRef.current) {
			onClose();
		}
	};

	return (
		<dialog
			ref={dialogRef}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop:bg-black/50"
			onClick={handleBackdropClick}
			onKeyDown={handleBackdropKeyDown}
			aria-modal="true"
			aria-labelledby="delete-dialog-title"
		>
			<div className="bg-slate-900 rounded-lg border border-slate-700 p-6 max-w-sm w-full mx-4">
				<h3
					id="delete-dialog-title"
					className="text-lg font-semibold text-slate-200 mb-2"
				>
					Delete Schedule?
				</h3>
				<p className="text-sm text-slate-400 mb-4">
					Are you sure you want to delete this scheduled run? This action cannot
					be undone.
				</p>
				<div className="flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-slate-100 transition rounded-md border border-slate-700 hover:border-slate-600"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition"
					>
						Delete
					</button>
				</div>
			</div>
		</dialog>
	);
}

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

// Consistent scale: 2 pixels per minute = 120 pixels per hour
const PIXELS_PER_MINUTE = 2;

function calculateTimelinePosition(
	timestamp: string,
	startTime: number,
): number {
	const time = new Date(timestamp).getTime();
	return ((time - startTime) / (1000 * 60)) * PIXELS_PER_MINUTE;
}

export default function TimelineCarousel({
	onRunSelect,
	selectedAccount = "all",
}: TimelineCarouselProps) {
	const [runs, setRuns] = useState<RunMetadata[]>([]);
	const [scheduledRuns, setScheduledRuns] = useState<ScheduledRun[]>([]);
	const [loading, setLoading] = useState(false);
	const [currentTime, setCurrentTime] = useState(Date.now());
	const [userHasScrolled, setUserHasScrolled] = useState(false);
	const [showPastRuns, setShowPastRuns] = useState(false);
	const isProgrammaticScrollRef = useRef(false);
	const timelineRef = useRef<HTMLDivElement>(null);
	const timelineContentRef = useRef<HTMLDivElement>(null);
	const currentTimeLineRef = useRef<HTMLDivElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const [wsConnected, setWsConnected] = useState(false);
	const [timelineWidth, setTimelineWidth] = useState(2000);
	const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<
		ScheduledRun | undefined
	>();
	const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(
		null,
	);
	const toast = useToast();
	const toastRef = useRef(toast);
	toastRef.current = toast;
	const [timezone, setTimezone] = useState<string>("UTC");
	const [, setErrorShown] = useState<Set<string>>(new Set());

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
				// Clear error flag on success
				setErrorShown((prev) => {
					const next = new Set(prev);
					next.delete("runs");
					return next;
				});
			} else {
				const errorText =
					runsRes.status === 404
						? "Runs endpoint not available"
						: `Failed to load runs (${runsRes.status})`;
				console.error(errorText);
				if (runsRes.status !== 404) {
					setErrorShown((prev) => {
						if (!prev.has("runs")) {
							toastRef.current.error(errorText);
							return new Set(prev).add("runs");
						}
						return prev;
					});
				}
			}

			// Load scheduled runs (gracefully handle failures)
			try {
				const scheduleRes = await fetch("/api/schedule");
				if (scheduleRes.ok) {
					const scheduleData = (await scheduleRes.json()) as ScheduledRun[];
					setScheduledRuns(scheduleData);
					// Clear error flag on success
					setErrorShown((prev) => {
						const next = new Set(prev);
						next.delete("schedule");
						return next;
					});
				} else if (scheduleRes.status !== 404) {
					console.warn("Failed to load schedule:", scheduleRes.status);
					setErrorShown((prev) => {
						if (!prev.has("schedule")) {
							toastRef.current.warning("Failed to load scheduled runs");
							return new Set(prev).add("schedule");
						}
						return prev;
					});
				}
				// 404 is OK - means no schedule endpoint or no scheduled runs
			} catch (scheduleError) {
				console.warn("Schedule endpoint not available:", scheduleError);
				// Continue without scheduled runs - this is expected in some setups
				// Don't show toast for network errors on schedule endpoint
			}

			// Load timezone from config (if available)
			try {
				const configRes = await fetch("/api/schedule/config");
				if (configRes.ok) {
					const config = (await configRes.json()) as { timezone?: string };
					if (config.timezone) {
						setTimezone(config.timezone);
					}
				}
			} catch {
				// Use browser timezone as fallback
				try {
					const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
					setTimezone(browserTz);
				} catch {
					setTimezone("UTC");
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to load timeline data";
			console.error(errorMessage, error);
			// Only show network error once, and only if it's a real network error
			if (!(error instanceof TypeError && error.message.includes("fetch"))) {
				setErrorShown((prev) => {
					if (!prev.has("network")) {
						toastRef.current.error(`Network error: ${errorMessage}`);
						return new Set(prev).add("network");
					}
					return prev;
				});
			}
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
										profilesProcessed:
											message.data.metrics?.profilesProcessed ||
											run.profilesProcessed,
										creatorsFound:
											message.data.metrics?.creatorsFound || run.creatorsFound,
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
										screenshots: [
											...run.screenshots,
											message.data.thumbnailPath,
										],
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
					if (
						data.thumbnail &&
						!runningRun.screenshots.includes(data.thumbnail)
					) {
						setRuns((prevRuns) =>
							prevRuns.map((run) =>
								run.id === runningRun.id
									? {
											...run,
											finalScreenshot: data.thumbnail,
											screenshots: data.thumbnail
												? [...run.screenshots, data.thumbnail]
												: run.screenshots,
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
	const allTimelineCards: TimelineCard[] = [
		...filteredRuns.map((run) => ({
			id: run.id,
			type: run.status as "scheduled" | "running" | "completed" | "error",
			profileId: run.profileId || run.scriptName || "unknown",
			accountName: run.profileId || run.scriptName || "unknown",
			timestamp: run.startTime,
			thumbnail:
				run.finalScreenshot ||
				(run.screenshots && run.screenshots.length > 0
					? run.screenshots[run.screenshots.length - 1]
					: undefined),
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
			name: scheduled.name,
			scriptName: scheduled.scriptName,
			countdown: Math.max(
				0,
				Math.floor(
					(new Date(scheduled.scheduledTime).getTime() - currentTime) / 1000,
				),
			),
		})),
	].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	// Filter out past runs if toggle is off (but always show scheduled runs)
	const timelineCards = showPastRuns
		? allTimelineCards
		: allTimelineCards.filter(
				(card) =>
					card.type === "scheduled" ||
					new Date(card.timestamp).getTime() >= currentTime,
			);

	// Calculate timeline bounds - center on current time
	const allTimestamps = timelineCards.map((card) =>
		new Date(card.timestamp).getTime(),
	);

	// Determine how far cards extend from current time
	const dataStart =
		allTimestamps.length > 0 ? Math.min(...allTimestamps) : currentTime;
	const dataEnd =
		allTimestamps.length > 0 ? Math.max(...allTimestamps) : currentTime;
	const pastExtent = currentTime - dataStart;
	const futureExtent = dataEnd - currentTime;
	const maxExtent = Math.max(pastExtent, futureExtent);

	// Ensure minimum 4-hour window (2 hours each side), centered on current time
	const minWindow = 4 * 60 * 60 * 1000; // 4 hours total
	const halfWindow = Math.max(minWindow / 2, maxExtent + 60 * 60 * 1000); // At least 1 hour padding beyond cards

	const startTime = currentTime - halfWindow;
	const endTime = currentTime + halfWindow;

	// Track manual scrolling (only user-initiated, not programmatic)
	useEffect(() => {
		const timeline = timelineRef.current;
		if (!timeline) return;

		const handleScroll = () => {
			// Only mark as user-scrolled if it wasn't a programmatic scroll
			if (!isProgrammaticScrollRef.current) {
				setUserHasScrolled(true);
			}
		};

		// Track user input events to detect manual scrolling
		const handleUserInput = () => {
			setUserHasScrolled(true);
		};

		timeline.addEventListener("scroll", handleScroll);
		timeline.addEventListener("mousedown", handleUserInput);
		timeline.addEventListener("touchstart", handleUserInput);
		timeline.addEventListener("wheel", handleUserInput);

		return () => {
			timeline.removeEventListener("scroll", handleScroll);
			timeline.removeEventListener("mousedown", handleUserInput);
			timeline.removeEventListener("touchstart", handleUserInput);
			timeline.removeEventListener("wheel", handleUserInput);
		};
	}, []);

	// Auto-scroll to center timeline on current time (only if user hasn't manually scrolled)
	useEffect(() => {
		if (!userHasScrolled && timelineRef.current) {
			const currentTimePos = calculateTimelinePosition(
				new Date(currentTime).toISOString(),
				startTime,
			);

			// Center the current time line in the viewport
			const scrollPosition = Math.max(
				0,
				currentTimePos - timelineRef.current.clientWidth / 2,
			);

			// Mark that we're doing a programmatic scroll
			isProgrammaticScrollRef.current = true;

			// Use requestAnimationFrame to ensure DOM is ready
			requestAnimationFrame(() => {
				if (timelineRef.current) {
					timelineRef.current.scrollTo({
						left: scrollPosition,
						behavior: "smooth",
					});
				}
			});

			// Reset the flag after scroll completes
			setTimeout(() => {
				isProgrammaticScrollRef.current = false;
			}, 500);
		}
	}, [currentTime, startTime, userHasScrolled]);

	const currentTimePosition = calculateTimelinePosition(
		new Date(currentTime).toISOString(),
		startTime,
	);

	// Debug logging
	const scheduledCount = allTimelineCards.filter(
		(c) => c.type === "scheduled",
	).length;
	const runCount = allTimelineCards.filter(
		(c) => c.type !== "scheduled",
	).length;
	useEffect(() => {
		console.log("=== Timeline Debug ===");
		console.log(`Total scheduled runs loaded: ${filteredScheduled.length}`);
		console.log(
			`All timeline cards: ${allTimelineCards.length} (${scheduledCount} scheduled, ${runCount} runs)`,
		);
		console.log(`Showing after filter: ${timelineCards.length}`);
		console.log(`Show past runs: ${showPastRuns}`);
		console.log(`Current time: ${new Date(currentTime).toISOString()}`);

		if (filteredScheduled.length > 0) {
			console.log(
				"Scheduled runs details:",
				filteredScheduled.map((s) => ({
					id: s.id,
					name: s.name,
					accountName: s.accountName,
					scheduledTime: s.scheduledTime,
					scheduledTimeISO: new Date(s.scheduledTime).toISOString(),
					isPast: new Date(s.scheduledTime).getTime() < currentTime,
					countdown: Math.floor(
						(new Date(s.scheduledTime).getTime() - currentTime) / 1000,
					),
				})),
			);
		}

		const scheduledCards = allTimelineCards.filter(
			(c) => c.type === "scheduled",
		);
		if (scheduledCards.length > 0) {
			console.log(
				"Scheduled timeline cards:",
				scheduledCards.map((c) => ({
					id: c.id,
					timestamp: c.timestamp,
					timestampISO: new Date(c.timestamp).toISOString(),
					isPast: new Date(c.timestamp).getTime() < currentTime,
					willShow:
						showPastRuns || new Date(c.timestamp).getTime() >= currentTime,
				})),
			);
		}
	}, [
		allTimelineCards,
		timelineCards.length,
		scheduledCount,
		runCount,
		filteredScheduled,
		currentTime,
		showPastRuns,
	]);

	// Update timeline width when content changes
	useEffect(() => {
		const updateWidth = () => {
			if (timelineContentRef.current) {
				const width =
					timelineContentRef.current.scrollWidth ||
					timelineContentRef.current.offsetWidth;
				setTimelineWidth(
					Math.max(
						width,
						Math.max(
							2000,
							((endTime - startTime) / (1000 * 60)) * PIXELS_PER_MINUTE,
						),
					),
				);
			}
		};

		updateWidth();
		const resizeObserver = new ResizeObserver(updateWidth);
		if (timelineContentRef.current) {
			resizeObserver.observe(timelineContentRef.current);
		}

		return () => resizeObserver.disconnect();
	}, [endTime, startTime]);

	return (
		<section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
			<header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
				<div>
					<h2 className="text-sm font-semibold text-slate-200">Run Timeline</h2>
					<p className="text-[11px] text-slate-400 mt-0.5">
						Horizontal timeline of scheduled, live, and completed runs
						{timezone && timezone !== "UTC" && (
							<span className="ml-2 text-slate-500">({timezone})</span>
						)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => {
							setShowPastRuns(!showPastRuns);
							setUserHasScrolled(false); // Reset scroll state to allow re-centering
						}}
						className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
							showPastRuns
								? "border-sky-600 bg-sky-600/20 text-sky-300 hover:bg-sky-600/30"
								: "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
						}`}
						aria-pressed={showPastRuns}
					>
						{showPastRuns ? "Hide Past" : "Show Past"}
					</button>
					<button
						onClick={() => {
							setEditingSchedule(undefined);
							setScheduleModalOpen(true);
						}}
						type="button"
						className="rounded-md border border-sky-600 bg-sky-600/20 px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-600/30 transition"
					>
						Schedule Run
					</button>
					<button
						onClick={loadData}
						type="button"
						className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60"
						disabled={loading}
					>
						{loading ? "Loading..." : "Refresh"}
					</button>
				</div>
			</header>
			<div
				ref={timelineRef}
				className="relative flex-1 overflow-x-auto overflow-y-visible bg-gradient-to-b from-slate-950/60 to-slate-950/40"
				style={{ height: "600px", minHeight: "600px" }}
			>
				<div
					ref={timelineContentRef}
					className="relative h-full"
					style={{
						minWidth: `${Math.max(2000, ((endTime - startTime) / (1000 * 60)) * PIXELS_PER_MINUTE)}px`,
						paddingTop: "100px",
						paddingBottom: "100px",
					}}
				>
					{/* Timeline axis line - positioned lower to give more space for cards above */}
					<div
						className="absolute h-1 bg-gradient-to-r from-transparent via-slate-600/60 to-transparent z-0"
						style={{
							top: "75%",
							left: 0,
							width: `${timelineWidth}px`,
							transform: "translateY(-50%)",
						}}
					/>

					{/* Time markers - show scheduled time for each run */}
					<ul
						className="absolute z-0"
						style={{ top: "75%", left: 0, width: "100%" }}
					>
						{timelineCards.map((card) => {
							const markerPosition = calculateTimelinePosition(
								card.timestamp,
								startTime,
							);
							const maxPosition =
								((endTime - startTime) / (1000 * 60)) * PIXELS_PER_MINUTE;
							if (markerPosition < 0 || markerPosition > maxPosition)
								return null;

							const markerTime = new Date(card.timestamp);
							return (
								<li
									key={`marker-${card.id}`}
									className="absolute z-0"
									style={{
										left: `${markerPosition}px`,
										top: "75%",
										transform: "translate(-50%, -50%)",
									}}
									title={markerTime.toLocaleString([], {
										timeZone: timezone,
										year: "numeric",
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
										timeZoneName: "short",
									})}
								>
									<div
										className="w-0.5 h-4 bg-slate-600/40"
										aria-hidden="true"
									/>
									<time
										dateTime={card.timestamp}
										className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-500 whitespace-nowrap font-mono"
									>
										{markerTime.toLocaleTimeString([], {
											timeZone: timezone,
											hour: "2-digit",
											minute: "2-digit",
										})}
									</time>
								</li>
							);
						})}
					</ul>

					{/* Current-time line */}
					{currentTimePosition >= 0 && (
						<div
							ref={currentTimeLineRef}
							className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-transparent via-amber-400/60 to-transparent z-30 pointer-events-none"
							style={{
								left: `${currentTimePosition}px`,
								transform: "translateX(-50%)",
							}}
						>
							{/* Horizontal marker on timeline axis */}
							<div className="absolute top-[75%] -translate-y-1/2 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-amber-400/80" />
							{/* Central dot on timeline */}
							<div className="absolute top-[75%] -translate-y-1/2 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 rounded-full border-2 border-amber-300 shadow-lg shadow-amber-400/50" />
							{/* Current time label */}
							<time
								dateTime={new Date(currentTime).toISOString()}
								className="absolute top-[75%] mt-5 left-1/2 -translate-x-1/2 text-xs text-amber-400 whitespace-nowrap font-mono font-bold bg-slate-900/80 px-2 py-0.5 rounded"
							>
								{new Date(currentTime).toLocaleTimeString([], {
									timeZone: timezone,
									hour: "2-digit",
									minute: "2-digit",
								})}
							</time>
						</div>
					)}

					{/* Timeline cards - positioned horizontally, stacked when overlapping */}
					<ul
						className="absolute z-20"
						style={{ top: 0, left: 0, width: "100%", height: "100%" }}
					>
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
							const groups: Array<Array<(typeof cardPositions)[0]>> = [];
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

							return groups.flatMap((group) => {
								const stackHeight = group.length;
								const cardHeight =
									stackHeight > 1
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
									const verticalOffset =
										baseOffset + stackIndex * (cardHeight + cardSpacing);
									const cardTop = `calc(75% - ${verticalOffset + cardHeight}px)`;
									const connectionLineHeight = verticalOffset;

									return {
										card,
										position,
										cardTop,
										connectionLineHeight,
										cardHeight,
										isScheduled,
										isRunning,
										isCompleted,
										isError,
									};
								});
							});
						})().map(
							({
								card,
								position,
								cardTop,
								connectionLineHeight,
								cardHeight,
								isScheduled,
								isRunning,
								isCompleted,
								isError,
							}) => {
								const cardTypeLabel = isScheduled
									? "scheduled"
									: isRunning
										? "running"
										: isCompleted
											? "completed"
											: "error";
								return (
									<li
										key={card.id}
										className="absolute z-20"
										style={{
											left: `${position}px`,
											top: cardTop,
											transform: "translateX(-50%)",
										}}
									>
										<button
											type="button"
											className="cursor-pointer group border-0 bg-transparent p-0 w-full"
											aria-label={`${cardTypeLabel} run for ${card.accountName}`}
											onClick={(e) => {
												// Don't trigger run select if clicking on action menu
												if (
													(e.target as HTMLElement).closest(".schedule-actions")
												) {
													return;
												}
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
												<header className="p-3 border-b border-slate-700/50">
													{card.name && (
														<h3
															className="text-[10px] font-semibold text-slate-300 mb-1.5 truncate capitalize"
															title={card.name}
														>
															{card.name}
														</h3>
													)}
													<div className="flex items-center justify-between mb-2">
														<span className="text-xs font-bold text-slate-100 truncate">
															{card.accountName}
														</span>
														<div className="flex items-center gap-1">
															{card.hasIssues && (
																<span className="w-2 h-2 bg-amber-400 rounded-full flex-shrink-0 shadow-lg shadow-amber-400/50" />
															)}
															{isScheduled && (
																<div className="schedule-actions relative">
																	<button
																		type="button"
																		onClick={(e) => {
																			e.stopPropagation();
																			const schedule = scheduledRuns.find(
																				(s) => s.id === card.id,
																			);
																			if (
																				schedule &&
																				!schedule.id.startsWith("scheduled_")
																			) {
																				setEditingSchedule(schedule);
																				setScheduleModalOpen(true);
																			} else {
																				toast.warning(
																					"Cannot edit cron schedules via UI",
																				);
																			}
																		}}
																		className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition"
																		title="Edit schedule"
																	>
																		<svg
																			className="w-3 h-3"
																			fill="none"
																			stroke="currentColor"
																			viewBox="0 0 24 24"
																			aria-hidden="true"
																		>
																			<path
																				strokeLinecap="round"
																				strokeLinejoin="round"
																				strokeWidth={2}
																				d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
																			/>
																		</svg>
																	</button>
																</div>
															)}
														</div>
													</div>
													{isRunning && (
														<span className="px-1.5 py-0.5 text-[9px] font-bold text-sky-100 bg-sky-500/40 rounded animate-pulse border border-sky-400/50">
															LIVE
														</span>
													)}
												</header>

												{/* Card body */}
												<div className="flex-1 p-3 flex flex-col">
													{isScheduled && card.countdown !== undefined && (
														<div className="text-center mb-3">
															<p className="text-[10px] text-slate-400 mb-1">
																<span aria-hidden="true">⏰</span> Scheduled
															</p>
															<time
																dateTime={`PT${card.countdown}S`}
																className="text-lg font-mono font-bold text-slate-200"
															>
																{formatDuration(card.countdown)}
															</time>
															<p className="text-[9px] text-slate-500 mt-1">
																until start
															</p>
															{card.scriptName && (
																<span className="text-[10px] font-bold text-slate-200 uppercase mt-3 px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-md tracking-wide">
																	{card.scriptName}
																</span>
															)}
														</div>
													)}
													{/* Action buttons for scheduled runs */}
													{isScheduled && !card.id.startsWith("scheduled_") && (
														<div className="mt-auto pt-2 border-t border-slate-700/50 schedule-actions">
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	setDeletingScheduleId(card.id);
																}}
																className="w-full px-2 py-1 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition"
															>
																Delete
															</button>
														</div>
													)}
													{isRunning && card.elapsed !== undefined && (
														<div className="text-center mb-3">
															<p className="text-[10px] text-sky-400 mb-1 flex items-center justify-center gap-1">
																<span
																	className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse"
																	aria-hidden="true"
																/>
																<span>Running</span>
															</p>
															<time
																dateTime={`PT${card.elapsed}S`}
																className="text-lg font-mono font-bold text-sky-200"
															>
																{formatDuration(card.elapsed)}
															</time>
															<p className="text-[9px] text-sky-400/70 mt-1">
																elapsed
															</p>
														</div>
													)}
													{isCompleted && (
														<div className="text-center mb-3">
															<span
																className="text-2xl mb-2"
																aria-hidden="true"
															>
																✓
															</span>
															<p className="text-xs text-emerald-300 font-semibold">
																Completed
															</p>
														</div>
													)}
													{isError && (
														<div className="text-center mb-3">
															<span
																className="text-2xl mb-2"
																aria-hidden="true"
															>
																✗
															</span>
															<p className="text-xs text-red-300 font-semibold">
																Error
															</p>
														</div>
													)}

													{/* Thumbnail - only show if card is tall enough */}
													{card.thumbnail && cardHeight > 150 && (
														<div className="mt-auto rounded-lg overflow-hidden border border-slate-700/50 group-hover:border-slate-600 transition">
															<img
																src={getImageUrl(card.thumbnail)}
																alt="Thumbnail"
																className="w-full object-cover"
																style={{
																	height: `${Math.min(128, cardHeight * 0.5)}px`,
																}}
																onError={(e) => {
																	(e.target as HTMLImageElement).style.display =
																		"none";
																}}
															/>
														</div>
													)}
												</div>
											</div>
										</button>
									</li>
								);
							},
						)}
					</ul>

					{/* Empty state overlay */}
					{timelineCards.length === 0 && !loading && (
						<div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
							<p className="text-sm mb-2">No runs scheduled or completed yet</p>
							<p className="text-xs text-slate-600">
								Click "Schedule Run" to create a scheduled run
							</p>
						</div>
					)}
				</div>
			</div>
			<ScheduleModal
				open={scheduleModalOpen}
				onOpenChange={setScheduleModalOpen}
				schedule={editingSchedule}
				onSuccess={() => {
					toast.success(
						editingSchedule
							? "Schedule updated successfully"
							: "Schedule created successfully",
					);
					void loadData();
				}}
			/>

			{/* Delete Confirmation Dialog */}
			{deletingScheduleId && (
				<DeleteDialog
					onClose={() => setDeletingScheduleId(null)}
					onConfirm={async () => {
						try {
							const res = await fetch(`/api/schedule/${deletingScheduleId}`, {
								method: "DELETE",
							});
							if (res.ok) {
								toast.success("Schedule deleted successfully");
								setDeletingScheduleId(null);
								void loadData();
							} else {
								const error = (await res.json()) as { error?: string };
								toast.error(error.error || "Failed to delete schedule");
							}
						} catch {
							toast.error("Failed to delete schedule");
						}
					}}
				/>
			)}

			{/* Toast Container */}
			<ToastContainer toasts={toast.toasts} onDismiss={toast.dismissToast} />
		</section>
	);
}
