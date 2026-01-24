/**
 * Pre-flight Checks Module
 *
 * Validates system requirements before starting sessions:
 * - AdsPower API availability
 * - Display/VNC availability (for headed browsers)
 * - Daily progress to avoid over-running
 *
 * These checks prevent wasted resources and failed sessions.
 */

import { isAdsPowerApiAvailable } from "../navigation/browser/adsPowerConnector.ts";
import { createLogger } from "../shared/logger/logger.ts";
import { getProfileById } from "../shared/profiles/profileManager.ts";
import type { SessionType } from "./sessionPlanner.ts";

const logger = createLogger();

export interface PreflightResult {
	ready: boolean;
	checks: {
		adspower: { ok: boolean; message: string };
		display: { ok: boolean; message: string };
		dailyProgress: { ok: boolean; message: string; sessionsCompleted: number };
	};
	reason?: string;
}

/**
 * Check if AdsPower is running and API is available
 */
export async function checkAdsPower(): Promise<{
	ok: boolean;
	message: string;
}> {
	try {
		const available = await isAdsPowerApiAvailable();
		if (available) {
			return { ok: true, message: "AdsPower API is available" };
		}
		return {
			ok: false,
			message:
				"AdsPower API not responding. Ensure AdsPower is running with Local API enabled.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { ok: false, message: `AdsPower check failed: ${msg}` };
	}
}

/**
 * Check if a display is available (for headed browser sessions)
 *
 * On VPS, this checks for DISPLAY environment variable (X11/VNC)
 * On macOS/Windows, this always returns true (native display)
 */
export function checkDisplay(): { ok: boolean; message: string } {
	const platform = process.platform;

	// macOS and Windows always have display
	if (platform === "darwin" || platform === "win32") {
		return { ok: true, message: "Native display available" };
	}

	// Linux/VPS - check for DISPLAY env var
	const display = process.env.DISPLAY;
	if (display) {
		return { ok: true, message: `Display available: ${display}` };
	}

	return {
		ok: false,
		message:
			"No DISPLAY environment variable set. Start VNC or set DISPLAY=:0",
	};
}

/**
 * Calculate which sessions have been completed today based on DB records
 */
export async function getCompletedSessionsToday(
	profileId: string,
): Promise<{
	sessionsCompleted: number;
	completedTypes: SessionType[];
	dmsSentToday: number;
	dailyGoal: number;
}> {
	const profile = await getProfileById(profileId);

	if (!profile) {
		return {
			sessionsCompleted: 0,
			completedTypes: [],
			dmsSentToday: 0,
			dailyGoal: 0,
		};
	}

	const dmsSentToday = profile.counters.dmsToday;
	const dailyGoal = profile.limits.dmsPerDay;

	// Estimate completed sessions based on DMs sent
	// Morning ~20%, Afternoon ~50%, Evening ~30%
	const morningTarget = Math.floor(dailyGoal * 0.2);
	const afternoonTarget = Math.floor(dailyGoal * 0.5);

	const completedTypes: SessionType[] = [];
	let sessionsCompleted = 0;

	// If we've sent more than morning's worth, morning is done
	if (dmsSentToday >= morningTarget * 0.7) {
		// 70% threshold
		completedTypes.push("morning");
		sessionsCompleted++;
	}

	// If we've sent more than morning + afternoon's worth, afternoon is done
	if (dmsSentToday >= (morningTarget + afternoonTarget) * 0.7) {
		completedTypes.push("afternoon");
		sessionsCompleted++;
	}

	// If we've hit the daily goal, all sessions are done
	if (dmsSentToday >= dailyGoal * 0.9) {
		// 90% threshold
		if (!completedTypes.includes("evening")) {
			completedTypes.push("evening");
			sessionsCompleted = 3;
		}
	}

	return {
		sessionsCompleted,
		completedTypes,
		dmsSentToday,
		dailyGoal,
	};
}

/**
 * Check daily progress and determine if we should run more sessions
 */
export async function checkDailyProgress(profileId: string): Promise<{
	ok: boolean;
	message: string;
	sessionsCompleted: number;
	shouldSkipTypes: SessionType[];
}> {
	const progress = await getCompletedSessionsToday(profileId);

	if (progress.dailyGoal === 0) {
		return {
			ok: false,
			message: `Profile ${profileId} not found or has no daily goal`,
			sessionsCompleted: 0,
			shouldSkipTypes: [],
		};
	}

	const remaining = progress.dailyGoal - progress.dmsSentToday;
	const percentComplete = Math.round(
		(progress.dmsSentToday / progress.dailyGoal) * 100,
	);

	if (progress.dmsSentToday >= progress.dailyGoal) {
		return {
			ok: false,
			message: `Daily goal reached: ${progress.dmsSentToday}/${progress.dailyGoal} DMs (${percentComplete}%)`,
			sessionsCompleted: 3,
			shouldSkipTypes: ["morning", "afternoon", "evening"],
		};
	}

	return {
		ok: true,
		message: `Progress: ${progress.dmsSentToday}/${progress.dailyGoal} DMs (${percentComplete}%), ${remaining} remaining`,
		sessionsCompleted: progress.sessionsCompleted,
		shouldSkipTypes: progress.completedTypes,
	};
}

/**
 * Run all pre-flight checks before starting a session
 *
 * @param profileId - Profile to check
 * @param requireDisplay - Whether to require display (default: true for headed browsers)
 */
export async function runPreflightChecks(
	profileId: string,
	requireDisplay = true,
): Promise<PreflightResult> {
	logger.info("PREFLIGHT", `Running pre-flight checks for ${profileId}...`);

	// Run checks in parallel
	const [adspowerResult, progressResult] = await Promise.all([
		checkAdsPower(),
		checkDailyProgress(profileId),
	]);

	const displayResult = checkDisplay();

	const checks = {
		adspower: adspowerResult,
		display: displayResult,
		dailyProgress: {
			...progressResult,
			sessionsCompleted: progressResult.sessionsCompleted,
		},
	};

	// Determine overall readiness
	const failures: string[] = [];

	if (!checks.adspower.ok) {
		failures.push(`AdsPower: ${checks.adspower.message}`);
	}

	if (requireDisplay && !checks.display.ok) {
		failures.push(`Display: ${checks.display.message}`);
	}

	if (!checks.dailyProgress.ok) {
		failures.push(`Progress: ${checks.dailyProgress.message}`);
	}

	const ready = failures.length === 0;

	if (ready) {
		logger.info("PREFLIGHT", "✓ All pre-flight checks passed");
	} else {
		logger.warn("PREFLIGHT", `✗ Pre-flight checks failed: ${failures.join("; ")}`);
	}

	return {
		ready,
		checks,
		reason: failures.length > 0 ? failures.join("; ") : undefined,
	};
}

/**
 * Determine which sessions should actually be caught up after a restart
 *
 * This is smarter than just running all missed sessions - it considers:
 * - How many DMs have already been sent today
 * - Which session windows have passed
 * - Whether we're past the point where catch-up makes sense
 *
 * @param profileId - Profile to check
 * @param missedTypes - Session types that were missed
 * @returns Session types that should actually be run
 */
export async function filterCatchUpSessions(
	profileId: string,
	missedTypes: SessionType[],
): Promise<SessionType[]> {
	const progress = await getCompletedSessionsToday(profileId);
	const now = new Date();
	const currentHour = now.getHours();

	// Filter out sessions that are effectively completed based on DM progress
	const remaining = missedTypes.filter(
		(type) => !progress.completedTypes.includes(type),
	);

	if (remaining.length === 0) {
		logger.info(
			"PREFLIGHT",
			`No catch-up needed: ${progress.dmsSentToday}/${progress.dailyGoal} DMs already sent`,
		);
		return [];
	}

	// Don't catch up if we're past reasonable hours (after 22:00)
	if (currentHour >= 22) {
		logger.info("PREFLIGHT", "Too late for catch-up sessions (after 22:00)");
		return [];
	}

	// If we've hit 80%+ of daily goal, don't bother catching up
	const percentComplete = progress.dmsSentToday / progress.dailyGoal;
	if (percentComplete >= 0.8) {
		logger.info(
			"PREFLIGHT",
			`Catch-up skipped: ${Math.round(percentComplete * 100)}% of daily goal already reached`,
		);
		return [];
	}

	// Determine which sessions make sense based on time of day
	const sensibleSessions: SessionType[] = [];

	for (const type of remaining) {
		// Morning makes sense before 12:00
		if (type === "morning" && currentHour < 12) {
			sensibleSessions.push(type);
		}
		// Afternoon makes sense between 12:00-18:00
		else if (type === "afternoon" && currentHour >= 12 && currentHour < 18) {
			sensibleSessions.push(type);
		}
		// Evening makes sense after 17:00
		else if (type === "evening" && currentHour >= 17) {
			sensibleSessions.push(type);
		}
		// If the window passed, consider running the NEXT appropriate session
		else if (type === "morning" && currentHour >= 12 && currentHour < 18) {
			// Morning missed but we're in afternoon window - run afternoon instead if not already planned
			if (
				!sensibleSessions.includes("afternoon") &&
				!progress.completedTypes.includes("afternoon")
			) {
				sensibleSessions.push("afternoon");
			}
		} else if (type === "afternoon" && currentHour >= 18) {
			// Afternoon missed but we're in evening window - run evening instead if not already planned
			if (
				!sensibleSessions.includes("evening") &&
				!progress.completedTypes.includes("evening")
			) {
				sensibleSessions.push("evening");
			}
		}
	}

	// Remove duplicates and sort by time
	const uniqueSessions = [...new Set(sensibleSessions)];
	const order: SessionType[] = ["morning", "afternoon", "evening"];
	uniqueSessions.sort((a, b) => order.indexOf(a) - order.indexOf(b));

	logger.info(
		"PREFLIGHT",
		`Catch-up sessions to run: ${uniqueSessions.join(", ") || "none"} (missed: ${missedTypes.join(", ")})`,
	);

	return uniqueSessions;
}
