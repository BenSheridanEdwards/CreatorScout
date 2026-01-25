/**
 * Health Monitor
 *
 * Monitors system health and provides alerting for:
 * - Missed sessions
 * - Failed jobs
 * - High proxy usage
 * - Database connectivity
 * - API errors
 *
 * Can send alerts via webhook (Discord, Slack, etc.)
 */

import { getPrismaClient } from "../database/database.ts";
import { createLogger } from "../logger/logger.ts";
import { getNodeScheduler } from "../../scheduling/nodeScheduler.ts";
import { estimateMonthlyProxyCost, getTodayProxyUsage } from "../proxy/proxyOptimizer.ts";
import { checkAdsPower, checkDisplay } from "../../scheduling/preflightChecks.ts";
import { ADSPOWER_API_KEY, LOCAL_BROWSER } from "../config/config.ts";

const logger = createLogger();

export interface HealthStatus {
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

export interface CheckResult {
	status: "ok" | "warning" | "error";
	message: string;
	details?: Record<string, unknown>;
}

export interface Alert {
	level: "info" | "warning" | "error";
	message: string;
	timestamp: string;
}

// Track startup time for uptime calculation
const startupTime = Date.now();

// Alert history (in-memory, cleared on restart)
const alertHistory: Alert[] = [];

/**
 * Perform a health check
 */
export async function checkHealth(): Promise<HealthStatus> {
	const alerts: Alert[] = [];

	// Check database
	const dbCheck = await checkDatabase();
	if (dbCheck.status === "error") {
		alerts.push({
			level: "error",
			message: `Database error: ${dbCheck.message}`,
			timestamp: new Date().toISOString(),
		});
	}

	// Check scheduler
	const schedulerCheck = checkScheduler();
	if (schedulerCheck.status === "error") {
		alerts.push({
			level: "error",
			message: `Scheduler error: ${schedulerCheck.message}`,
			timestamp: new Date().toISOString(),
		});
	}

	// Check sessions
	const sessionCheck = await checkSessions();
	if (sessionCheck.status === "warning" || sessionCheck.status === "error") {
		alerts.push({
			level: sessionCheck.status === "error" ? "error" : "warning",
			message: sessionCheck.message,
			timestamp: new Date().toISOString(),
		});
	}

	// Check proxy usage
	const proxyCheck = await checkProxyUsage();
	if (proxyCheck.status === "warning") {
		alerts.push({
			level: "warning",
			message: proxyCheck.message,
			timestamp: new Date().toISOString(),
		});
	}

	// Check AdsPower (if configured)
	let adspowerCheck: CheckResult | undefined;
	if (ADSPOWER_API_KEY) {
		try {
			const adspowerResult = await checkAdsPower();
			adspowerCheck = {
				status: adspowerResult.ok ? "ok" : "error",
				message: adspowerResult.message,
			};
			if (!adspowerResult.ok) {
				alerts.push({
					level: "error",
					message: `AdsPower: ${adspowerResult.message}`,
					timestamp: new Date().toISOString(),
				});
			}
		} catch (error) {
			adspowerCheck = {
				status: "error",
				message: `AdsPower check failed: ${error}`,
			};
			alerts.push({
				level: "error",
				message: `AdsPower check failed: ${error}`,
				timestamp: new Date().toISOString(),
			});
		}
	}

	// Check display
	const displayResult = checkDisplay();
	const displayCheck: CheckResult = {
		status: displayResult.ok ? "ok" : "warning",
		message: displayResult.message,
	};
	if (!displayResult.ok) {
		alerts.push({
			level: "warning",
			message: `Display: ${displayResult.message}`,
			timestamp: new Date().toISOString(),
		});
	}

	// System info
	const memUsage = process.memoryUsage();
	const systemCheck: CheckResult = {
		status: "ok",
		message: `Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
		details: {
			heapUsed: memUsage.heapUsed,
			heapTotal: memUsage.heapTotal,
			rss: memUsage.rss,
			external: memUsage.external,
		},
	};

	// Store new alerts
	for (const alert of alerts) {
		alertHistory.push(alert);
	}

	// Keep only last 100 alerts
	while (alertHistory.length > 100) {
		alertHistory.shift();
	}

	const healthy =
		dbCheck.status === "ok" &&
		schedulerCheck.status === "ok" &&
		sessionCheck.status !== "error" &&
		(!adspowerCheck || adspowerCheck.status === "ok");

	// Determine browser provider
	let browserProvider = "unknown";
	if (LOCAL_BROWSER) {
		browserProvider = "local";
	} else if (ADSPOWER_API_KEY) {
		browserProvider = "adspower";
	}

	return {
		healthy,
		timestamp: new Date().toISOString(),
		uptime: Math.floor((Date.now() - startupTime) / 1000),
		checks: {
			database: dbCheck,
			scheduler: schedulerCheck,
			sessions: sessionCheck,
			proxy: proxyCheck,
			adspower: adspowerCheck,
			display: displayCheck,
			system: systemCheck,
		},
		alerts,
		systemInfo: {
			platform: process.platform,
			nodeVersion: process.version,
			memoryUsage: {
				used: memUsage.heapUsed,
				total: memUsage.heapTotal,
				percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
			},
			display: process.env.DISPLAY || undefined,
			browserProvider,
		},
	};
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<CheckResult> {
	try {
		const prisma = getPrismaClient();
		await prisma.$queryRaw`SELECT 1`;
		return {
			status: "ok",
			message: "Database connected",
		};
	} catch (error) {
		return {
			status: "error",
			message: `Database connection failed: ${error}`,
		};
	}
}

/**
 * Check scheduler status
 */
function checkScheduler(): CheckResult {
	try {
		const scheduler = getNodeScheduler();
		const status = scheduler.getStatus();

		if (!status.isRunning) {
			return {
				status: "error",
				message: "Scheduler is not running",
				details: status,
			};
		}

		return {
			status: "ok",
			message: `Scheduler running: ${status.pendingJobs} pending, ${status.completedToday} completed today`,
			details: status,
		};
	} catch {
		return {
			status: "warning",
			message: "Scheduler not initialized",
		};
	}
}

/**
 * Check session health
 * Checks both scheduledJob table AND runs to get accurate session status
 */
async function checkSessions(): Promise<CheckResult> {
	try {
		const prisma = getPrismaClient();
		const now = new Date();
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);

		// Check completed sessions today from scheduledJob table
		const completedJobsToday = await prisma.scheduledJob.count({
			where: {
				scheduledTime: { gte: today },
				status: "completed",
			},
		});

		// Also check runs table for completed sessions today (in case scheduledJob isn't updated)
		const { getAllRuns } = await import("../runs/runs.ts");
		const allRuns = await getAllRuns();
		const completedRunsToday = allRuns.filter(
			(run) =>
				run.status === "completed" &&
				run.endTime &&
				new Date(run.endTime) >= today,
		).length;

		// Use the higher of the two counts (they should match, but runs is more reliable)
		const completedToday = Math.max(completedJobsToday, completedRunsToday);

		// Check for failed jobs today
		const failedJobs = await prisma.scheduledJob.count({
			where: {
				scheduledTime: { gte: today },
				status: "failed",
			},
		});

		// Also check runs for failed/error status
		const failedRunsToday = allRuns.filter(
			(run) =>
				(run.status === "error" || run.status === "failed") &&
				run.endTime &&
				new Date(run.endTime) >= today,
		).length;

		const totalFailed = Math.max(failedJobs, failedRunsToday);

		// If we have completed sessions today, we're good (unless there are failures)
		if (completedToday > 0) {
			if (totalFailed > 0) {
				return {
					status: "warning",
					message: `${completedToday} session(s) completed today, but ${totalFailed} failed`,
					details: { completedToday, failedJobs: totalFailed },
				};
			}
			return {
				status: "ok",
				message: `${completedToday} session(s) completed today`,
				details: { completedToday, failedJobs: totalFailed },
			};
		}

		// No sessions completed today - check hours since last completed session
		// Check both scheduledJob and runs
		const lastScheduledJob = await prisma.scheduledJob.findFirst({
			where: { status: "completed" },
			orderBy: { completedAt: "desc" },
		});

		const lastCompletedRun = allRuns
			.filter((r) => r.status === "completed" && r.endTime)
			.sort((a, b) => new Date(b.endTime!).getTime() - new Date(a.endTime!).getTime())[0];

		// Use the most recent of the two
		let lastSessionTime: Date | null = null;
		if (lastScheduledJob?.completedAt) {
			lastSessionTime = lastScheduledJob.completedAt;
		}
		if (lastCompletedRun?.endTime) {
			const runTime = new Date(lastCompletedRun.endTime);
			if (!lastSessionTime || runTime > lastSessionTime) {
				lastSessionTime = runTime;
			}
		}

		if (lastSessionTime) {
			const hoursSinceLastSession =
				(now.getTime() - lastSessionTime.getTime()) / (60 * 60 * 1000);

			// Only warn if it's been > 8 hours AND no sessions completed today
			if (hoursSinceLastSession > 8) {
				return {
					status: "warning",
					message: `No sessions completed today (last: ${hoursSinceLastSession.toFixed(1)} hours ago)`,
					details: {
						hoursSinceLastSession,
						lastSession: lastSessionTime,
						completedToday: 0,
					},
				};
			}
		} else {
			// No completed sessions ever
			return {
				status: "warning",
				message: "No sessions completed yet",
				details: { completedToday: 0, failedJobs: totalFailed },
			};
		}

		// If we get here, last session was recent (< 8 hours) but none today
		// This is OK if we're early in the day
		const hoursSince = lastSessionTime
			? ((now.getTime() - lastSessionTime.getTime()) / (60 * 60 * 1000)).toFixed(1)
			: "N/A";
		return {
			status: "ok",
			message: `No sessions completed today yet (last: ${hoursSince} hours ago)`,
			details: {
				completedToday: 0,
				failedJobs: totalFailed,
				lastSession: lastSessionTime,
			},
		};
	} catch (error) {
		return {
			status: "error",
			message: `Failed to check sessions: ${error}`,
		};
	}
}

/**
 * Check proxy usage
 */
async function checkProxyUsage(): Promise<CheckResult> {
	try {
		const today = await getTodayProxyUsage();
		const monthly = await estimateMonthlyProxyCost();

		// Warn if projected monthly cost exceeds $50
		if (monthly.projectedCost > 50) {
			return {
				status: "warning",
				message: `High proxy usage: projected $${monthly.projectedCost.toFixed(2)}/month`,
				details: {
					todayMB: today.totalMB,
					projectedMonthMB: monthly.projectedMonthMB,
					projectedCost: monthly.projectedCost,
				},
			};
		}

		return {
			status: "ok",
			message: `Proxy usage: ${today.totalMB.toFixed(1)}MB today, ~$${monthly.projectedCost.toFixed(2)}/month`,
			details: {
				todayMB: today.totalMB,
				projectedMonthMB: monthly.projectedMonthMB,
				projectedCost: monthly.projectedCost,
			},
		};
	} catch {
		return {
			status: "ok",
			message: "Proxy usage tracking not available",
		};
	}
}

/**
 * Get recent alerts
 */
export function getRecentAlerts(limit = 20): Alert[] {
	return alertHistory.slice(-limit);
}

/**
 * Send alert to webhook (Discord, Slack, etc.)
 */
export async function sendWebhookAlert(
	webhookUrl: string,
	alert: Alert
): Promise<boolean> {
	try {
		const color = alert.level === "error" ? 0xff0000 : alert.level === "warning" ? 0xffaa00 : 0x00ff00;
		const emoji = alert.level === "error" ? "🚨" : alert.level === "warning" ? "⚠️" : "ℹ️";

		// Discord webhook format
		const payload = {
			embeds: [
				{
					title: `${emoji} Scout Alert`,
					description: alert.message,
					color,
					timestamp: alert.timestamp,
					footer: {
						text: `Level: ${alert.level.toUpperCase()}`,
					},
				},
			],
		};

		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		return response.ok;
	} catch (error) {
		logger.error("HEALTH", `Failed to send webhook alert: ${error}`);
		return false;
	}
}

/**
 * Start health monitoring loop
 */
export function startHealthMonitoring(
	intervalMinutes = 5,
	webhookUrl?: string
): NodeJS.Timeout {
	logger.info("HEALTH", `Starting health monitoring (every ${intervalMinutes} min)`);

	const interval = setInterval(async () => {
		const health = await checkHealth();

		// Log status
		if (health.healthy) {
			logger.debug("HEALTH", "Health check passed");
		} else {
			logger.warn("HEALTH", `Health check failed: ${health.alerts.length} alerts`);
		}

		// Send alerts to webhook if configured
		if (webhookUrl && health.alerts.length > 0) {
			for (const alert of health.alerts) {
				await sendWebhookAlert(webhookUrl, alert);
			}
		}
	}, intervalMinutes * 60 * 1000);

	return interval;
}
