/**
 * Node-native Session Scheduler
 *
 * Replaces OS-level cron with an in-app scheduler that:
 * - Survives container restarts (persists state to DB)
 * - Is timezone-aware
 * - Has retry logic for failed sessions
 * - Supports catch-up for missed sessions
 * - Minimizes proxy bandwidth by batching intelligently
 *
 * Usage:
 *   import { NodeScheduler } from './nodeScheduler';
 *   const scheduler = new NodeScheduler();
 *   await scheduler.start();
 */

import { getPrismaClient } from "../shared/database/database.ts";
import { createLogger } from "../shared/logger/logger.ts";
import { getActiveProfiles } from "../shared/profiles/profileManager.ts";
import type { ProfileConfig } from "../shared/profiles/profileConfig.ts";

const logger = createLogger();

// Session time windows (hour ranges in 24h format)
const SESSION_WINDOWS = {
	morning: { start: 8, end: 10 },
	afternoon: { start: 14, end: 16 },
	evening: { start: 19, end: 21 },
} as const;

export type SessionType = "morning" | "afternoon" | "evening";

export interface ScheduledJob {
	id: string;
	profileId: string;
	sessionType: SessionType;
	scheduledTime: Date;
	status: "pending" | "running" | "completed" | "failed" | "skipped";
	attempts: number;
	lastAttemptAt?: Date;
	completedAt?: Date;
	error?: string;
	_dirty?: boolean; // Internal: only persist when true
}

export interface SchedulerConfig {
	timezone: string;
	enabled: boolean;
	maxRetries: number;
	retryDelayMinutes: number;
	retryJitterMinutes: number; // Random jitter to avoid robotic patterns
	catchUpMissedSessions: boolean;
	proxyWarmupMinutes: number; // Time before session to establish proxy
	checkIntervalMinutes: number; // How often to poll for due jobs
}

const DEFAULT_CONFIG: SchedulerConfig = {
	timezone: "Europe/London",
	enabled: true,
	maxRetries: 2,
	retryDelayMinutes: 30,
	retryJitterMinutes: 5, // Add 0-5 min random jitter on retries
	catchUpMissedSessions: true,
	proxyWarmupMinutes: 2,
	checkIntervalMinutes: 5, // Poll every 5 min, not every minute
};

/**
 * Node-native scheduler for Instagram sessions
 */
export class NodeScheduler {
	private config: SchedulerConfig;
	private checkInterval: NodeJS.Timeout | null = null;
	private runningJobs: Map<string, ScheduledJob> = new Map();
	private jobQueue: ScheduledJob[] = [];
	private isRunning = false;

	constructor(config: Partial<SchedulerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Start the scheduler
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			logger.warn("SCHEDULER", "Scheduler is already running");
			return;
		}

		logger.info(
			"SCHEDULER",
			`Starting Node scheduler (TZ: ${this.config.timezone})`,
		);
		this.isRunning = true;

		// Load persisted jobs from database
		await this.loadPersistedJobs();

		// Generate today's schedule if needed
		await this.generateDailySchedule();

		// Check for missed sessions to catch up
		if (this.config.catchUpMissedSessions) {
			await this.checkMissedSessions();
		}

		// Start the check loop (configurable, default 5 min)
		const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
		this.checkInterval = setInterval(() => {
			void this.checkAndRunJobs();
		}, intervalMs);

		// Run initial check
		await this.checkAndRunJobs();

		logger.info(
			"SCHEDULER",
			`Scheduler started (polling every ${this.config.checkIntervalMinutes} min)`,
		);
	}

	/**
	 * Stop the scheduler gracefully
	 */
	async stop(): Promise<void> {
		logger.info("SCHEDULER", "Stopping scheduler...");
		this.isRunning = false;

		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}

		// Wait for running jobs to complete (max 5 minutes)
		const maxWait = 5 * 60 * 1000;
		const startTime = Date.now();
		while (this.runningJobs.size > 0 && Date.now() - startTime < maxWait) {
			logger.info(
				"SCHEDULER",
				`Waiting for ${this.runningJobs.size} running jobs to complete...`,
			);
			await new Promise((r) => setTimeout(r, 10000));
		}

		logger.info("SCHEDULER", "Scheduler stopped");
	}

	/**
	 * Generate daily schedule for all active profiles
	 */
	async generateDailySchedule(): Promise<void> {
		const profiles = await getActiveProfiles();
		const today = this.getDateInTimezone();

		logger.info(
			"SCHEDULER",
			`Generating schedule for ${profiles.length} profiles`,
		);

		for (const profile of profiles) {
			await this.generateProfileSchedule(profile, today);
		}

		// Sort queue by scheduled time
		this.jobQueue.sort(
			(a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime(),
		);

		logger.info(
			"SCHEDULER",
			`Generated ${this.jobQueue.length} jobs for today`,
		);
	}

	/**
	 * Generate schedule for a single profile
	 * Schedules all 3 sessions (morning, afternoon, evening) per profile
	 */
	private async generateProfileSchedule(
		profile: ProfileConfig,
		date: Date,
	): Promise<void> {
		const sessionTypes: SessionType[] = ["morning", "afternoon", "evening"];

		for (const sessionType of sessionTypes) {
			// Check if we already have this job scheduled
			const existingJob = this.jobQueue.find(
				(j) =>
					j.profileId === profile.id &&
					j.sessionType === sessionType &&
					this.isSameDay(j.scheduledTime, date),
			);

			if (existingJob) {
				continue; // Already scheduled
			}

			// Generate scheduled time with variance
			const scheduledTime = this.calculateSessionTime(
				date,
				sessionType,
				profile.id,
			);
			const job: ScheduledJob = {
				id: `${profile.id}_${sessionType}_${date.toISOString().split("T")[0]}`,
				profileId: profile.id,
				sessionType,
				scheduledTime,
				status: "pending",
				attempts: 0,
				_dirty: true, // New job, needs persisting
			};

			this.jobQueue.push(job);
			await this.flushDirtyJob(job);
		}
	}

	/**
	 * Calculate session time with natural variance
	 */
	private calculateSessionTime(
		date: Date,
		sessionType: SessionType,
		profileId: string,
	): Date {
		const window = SESSION_WINDOWS[sessionType];

		// Base hour from window
		const baseHour = window.start;

		// Add profile-based offset (stagger profiles by 5-15 min)
		const profileHash = this.hashString(profileId);
		const profileOffset = (profileHash % 12) * 5; // 0-55 minutes

		// Add daily variance (±10 minutes)
		const dayHash = this.hashString(
			date.toISOString().split("T")[0] + profileId,
		);
		const dailyVariance = (dayHash % 21) - 10; // -10 to +10 minutes

		const totalMinutes = profileOffset + dailyVariance;
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		const scheduledTime = new Date(date);
		scheduledTime.setHours(baseHour + hours, minutes, 0, 0);

		return scheduledTime;
	}

	/**
	 * Simple string hash for deterministic variance
	 */
	private hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	}

	/**
	 * Check for jobs that need to run and execute them
	 */
	private async checkAndRunJobs(): Promise<void> {
		if (!this.isRunning) return;

		const now = new Date();
		const jobsToRun = this.jobQueue.filter(
			(job) =>
				job.status === "pending" &&
				job.scheduledTime <= now &&
				job.attempts < this.config.maxRetries + 1,
		);

		for (const job of jobsToRun) {
			// Don't run if we already have a job running for this profile
			const runningForProfile = Array.from(this.runningJobs.values()).find(
				(j) => j.profileId === job.profileId,
			);

			if (runningForProfile) {
				logger.debug(
					"SCHEDULER",
					`Skipping ${job.id} - profile ${job.profileId} already has a running job`,
				);
				continue;
			}

			// Run the job
			void this.runJob(job);
		}
	}

	/**
	 * Run a scheduled job
	 * @param sendDMs If true, send DMs to discovered creators (default: false = discovery only)
	 */
	private async runJob(job: ScheduledJob, sendDMs = false): Promise<void> {
		const mode = sendDMs ? " [with DMs]" : " [discovery-only]";
		logger.info(
			"SCHEDULER",
			`Running job ${job.id}${mode} (attempt ${job.attempts + 1})`,
		);

		const prevStatus = job.status;
		job.status = "running";
		job.attempts++;
		job.lastAttemptAt = new Date();
		job._dirty = prevStatus !== "running"; // Only dirty if status changed
		this.runningJobs.set(job.id, job);
		await this.flushDirtyJob(job);

		try {
			// Import and run the smart session runner
			const { runSmartSessionDirect } = await import("./sessionExecutor.ts");

			const result = await runSmartSessionDirect({
				profileId: job.profileId,
				sessionType: job.sessionType,
				dryRun: !sendDMs, // dryRun=true means no DMs (discovery only)
			});

			// Check if session actually succeeded (it returns success: false on error)
			if (result && result.success === false) {
				throw new Error(result.error || "Session failed");
			}

			// Success
			job.status = "completed";
			job.completedAt = new Date();
			job._dirty = true;
			logger.info("SCHEDULER", `✓ Job ${job.id} completed successfully`);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error("SCHEDULER", `✗ Job ${job.id} failed: ${errorMessage}`);

			if (job.attempts < this.config.maxRetries + 1) {
				// Schedule retry with jitter to avoid hammering same proxy/IP
				const jitter = Math.random() * this.config.retryJitterMinutes;
				const delayMs = (this.config.retryDelayMinutes + jitter) * 60 * 1000;
				job.status = "pending";
				job.scheduledTime = new Date(Date.now() + delayMs);
				job.error = errorMessage;
				job._dirty = true;
				logger.info(
					"SCHEDULER",
					`Scheduling retry for ${job.id} at ${job.scheduledTime.toISOString()} (+${jitter.toFixed(1)}min jitter)`,
				);
			} else {
				// Max retries exceeded
				job.status = "failed";
				job.error = errorMessage;
				job._dirty = true;
				logger.error(
					"SCHEDULER",
					`Job ${job.id} failed after ${job.attempts} attempts`,
				);
			}
		} finally {
			this.runningJobs.delete(job.id);
			await this.flushDirtyJob(job);
		}
	}

	/**
	 * Check for missed sessions that should have run today
	 */
	private async checkMissedSessions(): Promise<void> {
		const now = new Date();
		const today = this.getDateInTimezone();

		// Find pending jobs that were scheduled in the past
		const missedJobs = this.jobQueue.filter(
			(job) =>
				job.status === "pending" &&
				job.scheduledTime < now &&
				this.isSameDay(job.scheduledTime, today),
		);

		if (missedJobs.length === 0) {
			return;
		}

		logger.info(
			"SCHEDULER",
			`Found ${missedJobs.length} missed sessions to catch up`,
		);

		// Stagger catch-up sessions by 10 minutes each
		for (let i = 0; i < missedJobs.length; i++) {
			const job = missedJobs[i];
			job.scheduledTime = new Date(now.getTime() + i * 10 * 60 * 1000);
			job._dirty = true;
			await this.flushDirtyJob(job);
			logger.info(
				"SCHEDULER",
				`Rescheduled missed job ${job.id} to ${job.scheduledTime.toISOString()}`,
			);
		}
	}

	/**
	 * Get current date in configured timezone
	 */
	private getDateInTimezone(): Date {
		const now = new Date();
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: this.config.timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const dateStr = formatter.format(now);
		return new Date(dateStr);
	}

	/**
	 * Check if two dates are on the same day
	 */
	private isSameDay(date1: Date, date2: Date): boolean {
		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		);
	}

	/**
	 * Flush job to database only if dirty
	 */
	private async flushDirtyJob(job: ScheduledJob): Promise<void> {
		if (!job._dirty) return;
		await this.persistJob(job);
		job._dirty = false;
	}

	/**
	 * Persist job state to database (internal, use flushDirtyJob for efficiency)
	 * Note: Requires `npx prisma migrate deploy` to create ScheduledJob table
	 */
	private async persistJob(job: ScheduledJob): Promise<void> {
		try {
			const prisma = getPrismaClient();
			// @ts-expect-error - ScheduledJob table created by migration
			await prisma.scheduledJob.upsert({
				where: { id: job.id },
				update: {
					status: job.status,
					attempts: job.attempts,
					lastAttemptAt: job.lastAttemptAt,
					completedAt: job.completedAt,
					error: job.error,
					scheduledTime: job.scheduledTime,
				},
				create: {
					id: job.id,
					profileId: job.profileId,
					sessionType: job.sessionType,
					scheduledTime: job.scheduledTime,
					status: job.status,
					attempts: job.attempts,
					lastAttemptAt: job.lastAttemptAt,
					completedAt: job.completedAt,
					error: job.error,
				},
			});
		} catch {
			logger.warn(
				"SCHEDULER",
				"DB write failed—run: npx prisma migrate deploy",
			);
		}
	}

	/**
	 * Load persisted jobs from database
	 * Note: Requires `npx prisma migrate deploy` to create ScheduledJob table
	 */
	private async loadPersistedJobs(): Promise<void> {
		try {
			const prisma = getPrismaClient();
			const today = this.getDateInTimezone();
			today.setHours(0, 0, 0, 0);

			// @ts-expect-error - ScheduledJob table created by migration
			const jobs = await prisma.scheduledJob.findMany({
				where: {
					scheduledTime: { gte: today },
					status: { in: ["pending", "running"] },
				},
			});

			for (const dbJob of jobs) {
				const job: ScheduledJob = {
					id: dbJob.id,
					profileId: dbJob.profileId,
					sessionType: dbJob.sessionType as SessionType,
					scheduledTime: dbJob.scheduledTime,
					status: dbJob.status as ScheduledJob["status"],
					attempts: dbJob.attempts,
					lastAttemptAt: dbJob.lastAttemptAt || undefined,
					completedAt: dbJob.completedAt || undefined,
					error: dbJob.error || undefined,
				};

				// Reset "running" jobs to "pending" (server might have crashed)
				if (job.status === "running") {
					job.status = "pending";
				}

				this.jobQueue.push(job);
			}

			logger.info("SCHEDULER", `Loaded ${jobs.length} persisted jobs`);
		} catch {
			logger.warn("SCHEDULER", "DB read failed—run: npx prisma migrate deploy");
		}
	}

	/**
	 * Get scheduler status
	 */
	getStatus(): {
		isRunning: boolean;
		pendingJobs: number;
		runningJobs: number;
		completedToday: number;
		failedToday: number;
		nextJob: ScheduledJob | null;
	} {
		const today = this.getDateInTimezone();
		const todayJobs = this.jobQueue.filter((j) =>
			this.isSameDay(j.scheduledTime, today),
		);

		const pending = todayJobs.filter((j) => j.status === "pending");
		const completed = todayJobs.filter((j) => j.status === "completed");
		const failed = todayJobs.filter((j) => j.status === "failed");

		// Find next pending job
		const nextJob =
			pending.sort(
				(a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime(),
			)[0] || null;

		return {
			isRunning: this.isRunning,
			pendingJobs: pending.length,
			runningJobs: this.runningJobs.size,
			completedToday: completed.length,
			failedToday: failed.length,
			nextJob,
		};
	}

	/**
	 * Get all jobs for today
	 */
	getTodayJobs(): ScheduledJob[] {
		const today = this.getDateInTimezone();
		return this.jobQueue
			.filter((j) => this.isSameDay(j.scheduledTime, today))
			.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
	}

	/**
	 * Force run a specific job now (for testing/manual triggers)
	 * @param sendDMs If true, send DMs to discovered creators (default: false = discovery only)
	 */
	async forceRunJob(
		profileId: string,
		sessionType: SessionType,
		sendDMs = false,
	): Promise<void> {
		const job: ScheduledJob = {
			id: `force_${profileId}_${sessionType}_${Date.now()}`,
			profileId,
			sessionType,
			scheduledTime: new Date(),
			status: "pending",
			attempts: 0,
			_dirty: true,
		};

		// Log override so we know why a job fired outside normal schedule
		const mode = sendDMs ? " [WITH DMs]" : " [DISCOVERY-ONLY]";
		logger.warn(
			"SCHEDULER",
			`⚡ Forced job ${job.id}${mode} - manual override at ${new Date().toISOString()}`,
		);

		this.jobQueue.push(job);
		await this.runJob(job, sendDMs);
	}
}

// Global scheduler instance
let globalScheduler: NodeScheduler | null = null;

export function getNodeScheduler(): NodeScheduler {
	if (!globalScheduler) {
		globalScheduler = new NodeScheduler();
	}
	return globalScheduler;
}

export async function startScheduler(
	config?: Partial<SchedulerConfig>,
): Promise<NodeScheduler> {
	const scheduler = new NodeScheduler(config);
	await scheduler.start();
	globalScheduler = scheduler;
	return scheduler;
}
