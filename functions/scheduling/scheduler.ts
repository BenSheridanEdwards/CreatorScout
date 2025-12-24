/**
 * Session Scheduler
 *
 * Manages 15-20 minute session bursts across multiple profiles.
 * Stagger sessions by 5-15 min between profiles.
 * 2-3 sessions per day per profile, 35-45 min total per account.
 */

import {
	SESSION_DURATION_MAX,
	SESSION_DURATION_MIN,
	SESSION_STAGGER_MINUTES,
	SESSIONS_PER_DAY,
	TOTAL_SESSION_TIME_PER_DAY,
} from "../shared/config/config.ts";
import { getPrismaClient } from "../shared/database/database.ts";
import { createLogger } from "../shared/logger/logger.ts";

const logger = createLogger();

export type SessionType = "morning" | "afternoon" | "evening";

export interface ScheduledSession {
	profileId: string;
	sessionType: SessionType;
	startTime: Date;
	durationMinutes: number;
}

export interface SessionSchedule {
	sessions: ScheduledSession[];
	nextSession: ScheduledSession | null;
	totalMinutesToday: number;
}

/**
 * Session Scheduler class
 */
export class SessionScheduler {
	private sessionLog = new Map<string, Date[]>();

	/**
	 * Get random session duration within configured range
	 */
	getSessionDuration(): number {
		return (
			SESSION_DURATION_MIN +
			Math.floor(
				Math.random() * (SESSION_DURATION_MAX - SESSION_DURATION_MIN + 1),
			)
		);
	}

	/**
	 * Schedule a session for a profile
	 */
	async scheduleSession(
		profileId: string,
		durationMinutes: number,
	): Promise<string> {
		try {
			const prisma = getPrismaClient();
			const session = await prisma.profileSession.create({
				data: {
					profileId,
					sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
					durationMinutes,
				},
			});

			// Track in memory
			if (!this.sessionLog.has(profileId)) {
				this.sessionLog.set(profileId, []);
			}
			this.sessionLog.get(profileId)?.push(new Date());

			logger.info(
				"SCHEDULER",
				`Scheduled ${durationMinutes} min session for profile ${profileId}`,
			);

			return session.sessionId;
		} catch (error) {
			logger.error("SCHEDULER", `Failed to schedule session: ${error}`);
			throw error;
		}
	}

	/**
	 * End a session
	 */
	async endSession(
		sessionId: string,
		actions?: Record<string, number>,
	): Promise<void> {
		try {
			const prisma = getPrismaClient();
			await prisma.profileSession.updateMany({
				where: { sessionId },
				data: {
					endedAt: new Date(),
					actions: actions || undefined,
				},
			});

			logger.info("SCHEDULER", `Ended session ${sessionId}`);
		} catch (error) {
			logger.error("SCHEDULER", `Failed to end session: ${error}`);
		}
	}

	/**
	 * Get next session time for a profile
	 */
	getNextSessionTime(profileId: string): Date | null {
		const today = new Date();
		const sessionsToday = this.sessionLog.get(profileId) || [];
		const todaySessions = sessionsToday.filter(
			(d) => d.toDateString() === today.toDateString(),
		);

		if (todaySessions.length >= SESSIONS_PER_DAY) {
			return null; // No more sessions today
		}

		// Calculate next session time based on session type
		const hour = today.getHours();
		let nextTime: Date;

		if (hour < 9) {
			// Morning session at 9 AM
			nextTime = new Date(today.setHours(9, 0, 0, 0));
		} else if (hour < 14) {
			// Afternoon session at 2 PM
			nextTime = new Date(today.setHours(14, 0, 0, 0));
		} else if (hour < 17) {
			// Evening session at 5 PM
			nextTime = new Date(today.setHours(17, 0, 0, 0));
		} else {
			// Tomorrow morning
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			nextTime = new Date(tomorrow.setHours(9, 0, 0, 0));
		}

		return nextTime;
	}

	/**
	 * Stagger profiles for a session window
	 * Returns start times for each profile, staggered by configured minutes
	 */
	staggerProfiles(
		profileIds: string[],
		startTime: Date = new Date(),
		staggerMinutes: number = SESSION_STAGGER_MINUTES,
	): Map<string, Date> {
		const schedule = new Map<string, Date>();

		profileIds.forEach((profileId, index) => {
			const profileStartTime = new Date(
				startTime.getTime() + index * staggerMinutes * 60 * 1000,
			);
			schedule.set(profileId, profileStartTime);
		});

		return schedule;
	}

	/**
	 * Check if a profile can have another session today
	 */
	async canHaveSession(profileId: string): Promise<boolean> {
		try {
			const prisma = getPrismaClient();
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const sessionsToday = await prisma.profileSession.count({
				where: {
					profileId,
					startedAt: {
						gte: today,
					},
				},
			});

			return sessionsToday < SESSIONS_PER_DAY;
		} catch {
			return true; // Allow if we can't check
		}
	}

	/**
	 * Get total session time for a profile today
	 */
	async getTotalSessionTimeToday(profileId: string): Promise<number> {
		try {
			const prisma = getPrismaClient();
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			const sessions = await prisma.profileSession.findMany({
				where: {
					profileId,
					startedAt: {
						gte: today,
					},
				},
				select: {
					durationMinutes: true,
				},
			});

			return sessions.reduce((total, s) => total + (s.durationMinutes || 0), 0);
		} catch {
			return 0;
		}
	}

	/**
	 * Check if profile has remaining session time today
	 */
	async hasRemainingSessionTime(profileId: string): Promise<boolean> {
		const usedTime = await this.getTotalSessionTimeToday(profileId);
		return usedTime < TOTAL_SESSION_TIME_PER_DAY;
	}

	/**
	 * Get remaining session time for a profile today
	 */
	async getRemainingSessionTime(profileId: string): Promise<number> {
		const usedTime = await this.getTotalSessionTimeToday(profileId);
		return Math.max(0, TOTAL_SESSION_TIME_PER_DAY - usedTime);
	}
}

/**
 * Get session type based on current hour
 */
export function getCurrentSessionType(): SessionType {
	const hour = new Date().getHours();

	if (hour >= 5 && hour < 12) {
		return "morning";
	} else if (hour >= 12 && hour < 17) {
		return "afternoon";
	} else {
		return "evening";
	}
}

/**
 * Get session window for a session type
 */
export function getSessionWindow(type: SessionType): {
	start: number;
	end: number;
} {
	switch (type) {
		case "morning":
			return { start: 9, end: 10 };
		case "afternoon":
			return { start: 14, end: 15 };
		case "evening":
			return { start: 17, end: 18 };
	}
}

// Global scheduler instance
let globalScheduler: SessionScheduler | null = null;

export function getGlobalScheduler(): SessionScheduler {
	if (!globalScheduler) {
		globalScheduler = new SessionScheduler();
	}
	return globalScheduler;
}
