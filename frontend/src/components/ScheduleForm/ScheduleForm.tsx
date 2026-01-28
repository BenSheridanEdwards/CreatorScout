import { apiFetch } from "../../utils/api";
import { useEffect, useState } from "react";
import type { ScheduledRun } from "../../types";

interface ScheduleFormProps {
	schedule?: ScheduledRun; // For edit mode
	onSuccess: () => void;
	onCancel: () => void;
	onError?: (error: string) => void;
}

const AVAILABLE_SCRIPTS = [
	{ value: "discover", label: "Discover - Find creators from following lists" },
	{
		value: "discover:dm",
		label: "Discover with DMs - Find and message creators",
	},
	{
		value: "cron:smart",
		label: "Smart Session - Automated session with fuzzy targets",
	},
	{
		value: "cron:session",
		label: "Session Runner - Standard scheduled session",
	},
	{
		value: "reanalyze",
		label: "Reanalyze Profile - Re-check profile classification",
	},
	{ value: "analyze", label: "Analyze Profile - Analyze a specific profile" },
];

export default function ScheduleForm({
	schedule,
	onSuccess,
	onCancel,
	onError,
}: ScheduleFormProps) {
	const [name, setName] = useState(schedule?.name || "");
	const [profileId, setProfileId] = useState(schedule?.profileId || "");
	const [scriptName, setScriptName] = useState(
		schedule?.scriptName || "discover",
	);

	// Default to 1 hour from now if creating new schedule
	const getDefaultTime = () => {
		if (schedule?.scheduledTime) {
			return new Date(schedule.scheduledTime).toISOString().slice(0, 16);
		}
		const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
		return oneHourFromNow.toISOString().slice(0, 16);
	};

	const [scheduledTime, setScheduledTime] = useState(getDefaultTime());
	const [accountName, setAccountName] = useState(schedule?.accountName || "");
	const [availableProfiles, setAvailableProfiles] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [errors, setErrors] = useState<Record<string, string>>({});

	// Load available profiles from schedule endpoint
	useEffect(() => {
		async function loadProfiles() {
			try {
				const res = await apiFetch("/api/schedule");
				if (res.ok) {
					const schedules = (await res.json()) as ScheduledRun[];
					const uniqueProfiles = [
						...new Set(schedules.map((s) => s.profileId)),
					];
					setAvailableProfiles(uniqueProfiles);

					// If editing and profileId not in list, add it
					if (
						schedule?.profileId &&
						!uniqueProfiles.includes(schedule.profileId)
					) {
						setAvailableProfiles([...uniqueProfiles, schedule.profileId]);
					}
				}
			} catch (error) {
				console.error("Failed to load profiles:", error);
			}
		}
		void loadProfiles();
	}, [schedule?.profileId]);

	// Pre-fill form if editing
	useEffect(() => {
		if (schedule) {
			setName(schedule.name || "");
			setProfileId(schedule.profileId);
			setScriptName(schedule.scriptName);
			setScheduledTime(
				new Date(schedule.scheduledTime).toISOString().slice(0, 16),
			);
			setAccountName(schedule.accountName || schedule.profileId);
		}
	}, [schedule]);

	const validate = (): boolean => {
		const newErrors: Record<string, string> = {};

		if (!profileId.trim()) {
			newErrors.profileId = "Profile is required";
		}

		if (!scriptName.trim()) {
			newErrors.scriptName = "Script is required";
		}

		if (!scheduledTime) {
			newErrors.scheduledTime = "Scheduled time is required";
		} else {
			const selectedDate = new Date(scheduledTime);
			if (Number.isNaN(selectedDate.getTime())) {
				newErrors.scheduledTime = "Invalid date/time";
			} else if (selectedDate.getTime() <= Date.now()) {
				newErrors.scheduledTime = "Scheduled time must be in the future";
			}
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validate()) {
			return;
		}

		setLoading(true);
		try {
			const scheduledTimeISO = new Date(scheduledTime).toISOString();
			const payload = {
				...(name && { name }),
				profileId,
				scriptName,
				scheduledTime: scheduledTimeISO,
				...(accountName && { accountName }),
			};

			const url = schedule ? `/api/schedule/${schedule.id}` : "/api/schedule";
			const method = schedule ? "PATCH" : "POST";

			const res = await fetch(url, {
				method,
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const errorData = (await res.json()) as { error?: string };
				throw new Error(
					errorData.error ||
						`Failed to ${schedule ? "update" : "create"} schedule`,
				);
			}

			onSuccess();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "An error occurred";
			setErrors({ submit: errorMessage });
			if (onError) {
				onError(errorMessage);
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-5">
			{/* Task Name */}
			<div>
				<label
					htmlFor="name"
					className="block text-sm font-semibold text-slate-200 mb-2 tracking-wide"
				>
					Task Name{" "}
					<span className="text-slate-500 text-xs font-normal">(Optional)</span>
				</label>
				<input
					id="name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g., Discovery - Night Session"
					className="w-full rounded-lg border-2 border-slate-700/50 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30 focus:bg-slate-900/80 transition-all backdrop-blur-sm"
					disabled={loading}
				/>
				<p className="mt-1.5 text-xs text-slate-500">
					Give this scheduled task a descriptive name (e.g., "Discovery - Night
					Session")
				</p>
			</div>

			{/* Profile Selection */}
			<div>
				<label
					htmlFor="profileId"
					className="block text-sm font-semibold text-slate-200 mb-2 tracking-wide"
				>
					Profile <span className="text-red-400">*</span>
				</label>
				{availableProfiles.length > 0 ? (
					<select
						id="profileId"
						value={profileId}
						onChange={(e) => {
							setProfileId(e.target.value);
							if (!accountName || accountName === profileId) {
								setAccountName(e.target.value);
							}
							setErrors({ ...errors, profileId: "" });
						}}
						className={`w-full rounded-lg border-2 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 transition-all backdrop-blur-sm ${
							errors.profileId
								? "border-red-500/60 focus:border-red-500/80 focus:ring-red-500/30"
								: "border-slate-700/50 focus:border-sky-500/60 focus:ring-sky-500/30 focus:bg-slate-900/80"
						}`}
						disabled={loading}
					>
						<option value="">Select a profile</option>
						{availableProfiles.map((profile) => (
							<option key={profile} value={profile}>
								{profile}
							</option>
						))}
					</select>
				) : (
					<input
						id="profileId"
						type="text"
						value={profileId}
						onChange={(e) => {
							setProfileId(e.target.value);
							if (!accountName || accountName === profileId) {
								setAccountName(e.target.value);
							}
							setErrors({ ...errors, profileId: "" });
						}}
						placeholder="Enter profile ID"
						className={`w-full rounded-lg border-2 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all backdrop-blur-sm ${
							errors.profileId
								? "border-red-500/60 focus:border-red-500/80 focus:ring-red-500/30"
								: "border-slate-700/50 focus:border-sky-500/60 focus:ring-sky-500/30 focus:bg-slate-900/80"
						}`}
						disabled={loading}
					/>
				)}
				{errors.profileId && (
					<p className="mt-1 text-xs text-red-400">{errors.profileId}</p>
				)}
			</div>

			{/* Account Name (Optional) */}
			<div>
				<label
					htmlFor="accountName"
					className="block text-sm font-semibold text-slate-200 mb-2 tracking-wide"
				>
					Account Name{" "}
					<span className="text-slate-500 text-xs font-normal">(Optional)</span>
				</label>
				<input
					id="accountName"
					type="text"
					value={accountName}
					onChange={(e) => setAccountName(e.target.value)}
					placeholder={profileId || "Display name"}
					className="w-full rounded-lg border-2 border-slate-700/50 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/30 focus:bg-slate-900/80 transition-all backdrop-blur-sm"
					disabled={loading}
				/>
				<p className="mt-1.5 text-xs text-slate-500">
					Display name for filtering (defaults to profile ID)
				</p>
			</div>

			{/* Script Selection */}
			<div>
				<label
					htmlFor="scriptName"
					className="block text-sm font-semibold text-slate-200 mb-2 tracking-wide"
				>
					Script <span className="text-red-400">*</span>
				</label>
				<select
					id="scriptName"
					value={scriptName}
					onChange={(e) => {
						setScriptName(e.target.value);
						setErrors({ ...errors, scriptName: "" });
					}}
					className={`w-full rounded-lg border-2 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 transition-all backdrop-blur-sm ${
						errors.scriptName
							? "border-red-500/60 focus:border-red-500/80 focus:ring-red-500/30"
							: "border-slate-700/50 focus:border-sky-500/60 focus:ring-sky-500/30 focus:bg-slate-900/80"
					}`}
					disabled={loading}
				>
					{AVAILABLE_SCRIPTS.map((script) => (
						<option key={script.value} value={script.value}>
							{script.label}
						</option>
					))}
				</select>
				{errors.scriptName && (
					<p className="mt-1 text-xs text-red-400">{errors.scriptName}</p>
				)}
			</div>

			{/* Scheduled Time */}
			<div>
				<label
					htmlFor="scheduledTime"
					className="block text-sm font-semibold text-slate-200 mb-2 tracking-wide"
				>
					Scheduled Time <span className="text-red-400">*</span>
				</label>
				<input
					id="scheduledTime"
					type="datetime-local"
					value={scheduledTime}
					onChange={(e) => {
						setScheduledTime(e.target.value);
						setErrors({ ...errors, scheduledTime: "" });
					}}
					min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
					className={`w-full rounded-lg border-2 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 transition-all backdrop-blur-sm ${
						errors.scheduledTime
							? "border-red-500/60 focus:border-red-500/80 focus:ring-red-500/30"
							: "border-slate-700/50 focus:border-sky-500/60 focus:ring-sky-500/30 focus:bg-slate-900/80"
					}`}
					disabled={loading}
				/>
				{errors.scheduledTime && (
					<p className="mt-1.5 text-xs text-red-400">{errors.scheduledTime}</p>
				)}
				<p className="mt-1.5 text-xs text-slate-500">
					Time is in your browser's local timezone
				</p>
			</div>

			{/* Submit Error */}
			{errors.submit && (
				<div className="rounded-lg bg-red-500/10 border-2 border-red-500/30 px-4 py-3 backdrop-blur-sm">
					<p className="text-sm text-red-400 font-medium">{errors.submit}</p>
				</div>
			)}

			{/* Actions */}
			<div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/50">
				<button
					type="button"
					onClick={onCancel}
					className="px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-slate-100 transition-all rounded-lg border-2 border-slate-700/50 hover:border-slate-600/60 bg-slate-950/50 hover:bg-slate-900/50 backdrop-blur-sm"
					disabled={loading}
				>
					Cancel
				</button>
				<button
					type="submit"
					className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 border border-sky-400/30"
					disabled={loading}
				>
					{loading
						? schedule
							? "Updating..."
							: "Creating..."
						: schedule
							? "Update Schedule"
							: "Create Schedule"}
				</button>
			</div>
		</form>
	);
}
