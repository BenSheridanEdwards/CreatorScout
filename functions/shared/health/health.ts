/**
 * Health check system for monitoring Scout's operational status.
 *
 * Provides comprehensive health metrics for:
 * - Database connectivity
 * - Browser availability
 * - Instagram API responsiveness
 * - System resource usage
 * - Queue status
 */

export enum HealthStatus {
	PASS = "pass",
	WARN = "warn",
	FAIL = "fail",
}

export interface HealthCheck {
	name: string;
	status: HealthStatus;
	message: string;
	duration: number; // milliseconds
	timestamp: string;
	details?: Record<string, unknown>;
}

export interface SystemHealth {
	status: HealthStatus;
	version: string;
	timestamp: string;
	uptime: number; // seconds
	checks: HealthCheck[];
	summary: {
		total: number;
		passing: number;
		warning: number;
		failing: number;
	};
}

import { createBrowser } from "../../navigation/browser/browser.ts";
import { getInstagramCircuitBreaker } from "../circuitBreaker/circuitBreaker.ts";
import { query } from "../database/database.ts";

const START_TIME = Date.now();
const VERSION = "1.0.0";

/**
 * Run all health checks
 */
export async function getSystemHealth(): Promise<SystemHealth> {
	const checks: HealthCheck[] = [];

	checks.push(await checkDatabase());
	checks.push(await checkBrowser());
	checks.push(await checkCircuitBreaker());
	checks.push(await checkSystemResources());
	checks.push(await checkQueueStatus());

	const passing = checks.filter((c) => c.status === HealthStatus.PASS).length;
	const warning = checks.filter((c) => c.status === HealthStatus.WARN).length;
	const failing = checks.filter((c) => c.status === HealthStatus.FAIL).length;
	const total = checks.length;

	let overallStatus = HealthStatus.PASS;
	if (failing > 0) overallStatus = HealthStatus.FAIL;
	else if (warning > 0) overallStatus = HealthStatus.WARN;

	return {
		status: overallStatus,
		version: VERSION,
		timestamp: new Date().toISOString(),
		uptime: Math.floor((Date.now() - START_TIME) / 1000),
		checks,
		summary: { total, passing, warning, failing },
	};
}

/**
 * Check database connectivity and basic operations
 */
async function checkDatabase(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const res = await query<{ count: string }>(
			"SELECT COUNT(*)::text as count FROM profiles",
		);
		const profileCount = Number.parseInt(res.rows[0]?.count ?? "0", 10);

		return {
			name: "database",
			status: HealthStatus.PASS,
			message: "Database connection healthy",
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { profileCount },
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name: "database",
			status: HealthStatus.FAIL,
			message: `Database check failed: ${errorMessage}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: errorMessage },
		};
	}
}

/**
 * Check browser availability and basic functionality
 */
async function checkBrowser(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const browser = await createBrowser({ headless: true });
		const page = await browser.newPage();

		await page.goto("data:text/html,<html><body>Test</body></html>");
		const title = await page.title();

		await browser.close();

		return {
			name: "browser",
			status: HealthStatus.PASS,
			message: "Browser functionality healthy",
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { pageTitle: title },
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name: "browser",
			status: HealthStatus.FAIL,
			message: `Browser check failed: ${errorMessage}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: errorMessage },
		};
	}
}

/**
 * Check circuit breaker status
 */
async function checkCircuitBreaker(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const breaker = getInstagramCircuitBreaker();
		const stats = breaker.getStats();

		let status = HealthStatus.PASS;
		let message = "Circuit breaker operational";

		if (stats.state === "CLOSED") {
			status = HealthStatus.WARN;
			message = "Circuit breaker is open - rate limiting detected";
		}

		return {
			name: "circuit_breaker",
			status,
			message,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: {
				state: stats.state,
				failures: stats.failures,
				successes: stats.successes,
				totalRequests: stats.totalRequests,
				totalFailures: stats.totalFailures,
				totalSuccesses: stats.totalSuccesses,
			},
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name: "circuit_breaker",
			status: HealthStatus.FAIL,
			message: `Circuit breaker check failed: ${errorMessage}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: errorMessage },
		};
	}
}

/**
 * Check system resources (memory, CPU if available)
 */
async function checkSystemResources(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const memUsage = process.memoryUsage();
		const memUsageMB = {
			rss: Math.round(memUsage.rss / 1024 / 1024),
			heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
			heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
			external: Math.round(memUsage.external / 1024 / 1024),
		};

		const cpuUsage = process.cpuUsage();
		const cpuUsageMs = {
			user: Math.round(cpuUsage.user / 1000),
			system: Math.round(cpuUsage.system / 1000),
		};

		let status = HealthStatus.PASS;
		let message = "System resources normal";

		if (memUsageMB.heapUsed > 500) {
			status = HealthStatus.WARN;
			message = "High memory usage detected";
		}

		return {
			name: "system_resources",
			status,
			message,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { memory: memUsageMB, cpu: cpuUsageMs },
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name: "system_resources",
			status: HealthStatus.FAIL,
			message: `System resources check failed: ${errorMessage}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: errorMessage },
		};
	}
}

/**
 * Check queue status and processing health
 */
async function checkQueueStatus(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const queueRes = await query<{
			total: string;
			high_priority: string;
			medium_priority: string;
			low_priority: string;
		}>(
			`SELECT
				COUNT(*)::text as total,
				COALESCE(SUM(CASE WHEN priority >= 80 THEN 1 ELSE 0 END), 0)::text as high_priority,
				COALESCE(SUM(CASE WHEN priority >= 50 AND priority < 80 THEN 1 ELSE 0 END), 0)::text as medium_priority,
				COALESCE(SUM(CASE WHEN priority < 50 THEN 1 ELSE 0 END), 0)::text as low_priority
			FROM queue`,
		);

		const queueStatsRow = queueRes.rows[0] ?? {
			total: "0",
			high_priority: "0",
			medium_priority: "0",
			low_priority: "0",
		};

		const queueStats = {
			total: Number.parseInt(queueStatsRow.total, 10),
			high_priority: Number.parseInt(queueStatsRow.high_priority, 10),
			medium_priority: Number.parseInt(queueStatsRow.medium_priority, 10),
			low_priority: Number.parseInt(queueStatsRow.low_priority, 10),
		};

		const recentRes = await query<{
			recent_profiles: string;
			avg_processing_time: string | null;
		}>(
			`SELECT
				COUNT(*)::text as recent_profiles,
				COALESCE(AVG(processing_time_seconds), 0)::text as avg_processing_time
			FROM profiles
			WHERE visited_at > (NOW() - INTERVAL '1 hour')`,
		);

		const recentRow = recentRes.rows[0] ?? {
			recent_profiles: "0",
			avg_processing_time: "0",
		};

		const recentStats = {
			recent_profiles: Number.parseInt(recentRow.recent_profiles, 10),
			avg_processing_time: Number(recentRow.avg_processing_time ?? 0),
		};

		let status = HealthStatus.PASS;
		let message = "Queue processing normal";

		if (queueStats.total > 1000) {
			status = HealthStatus.WARN;
			message = "Large queue backlog detected";
		}

		return {
			name: "queue_status",
			status,
			message,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: {
				queue: queueStats,
				recentActivity: recentStats,
			},
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			name: "queue_status",
			status: HealthStatus.FAIL,
			message: `Queue status check failed: ${errorMessage}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: errorMessage },
		};
	}
}

/**
 * Format health status for display
 */
export function formatHealthStatus(health: SystemHealth): string {
	const statusEmoji = {
		[HealthStatus.PASS]: "✅",
		[HealthStatus.WARN]: "⚠️",
		[HealthStatus.FAIL]: "❌",
	};

	let output = `${statusEmoji[health.status]} Scout Health Status: ${health.status.toUpperCase()}\n`;
	output += `Version: ${health.version} | Uptime: ${Math.floor(health.uptime / 60)}m ${health.uptime % 60}s\n`;
	output += `Checks: ${health.summary.passing}/${health.summary.total} passing\n\n`;

	for (const check of health.checks) {
		const checkEmoji = statusEmoji[check.status];
		output += `${checkEmoji} ${check.name}: ${check.message}\n`;

		if (check.details) {
			const details = Object.entries(check.details)
				.map(([key, value]) => `  ${key}: ${value}`)
				.join("\n");
			output += `${details}\n`;
		}
		output += "\n";
	}

	return output;
}
