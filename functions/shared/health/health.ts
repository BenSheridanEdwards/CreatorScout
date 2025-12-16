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
	details?: Record<string, any>;
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

import { getDb } from "../database/database.ts";
import { createBrowser } from "../../navigation/browser/browser.ts";
import { getInstagramCircuitBreaker } from "../circuitBreaker/circuitBreaker.ts";

const START_TIME = Date.now();
const VERSION = "1.0.0";

/**
 * Run all health checks
 */
export async function getSystemHealth(): Promise<SystemHealth> {
	const checks: HealthCheck[] = [];
	const startTime = Date.now();

	// Run all checks
	checks.push(await checkDatabase());
	checks.push(await checkBrowser());
	checks.push(await checkCircuitBreaker());
	checks.push(await checkSystemResources());
	checks.push(await checkQueueStatus());

	// Calculate summary
	const passing = checks.filter((c) => c.status === HealthStatus.PASS).length;
	const warning = checks.filter((c) => c.status === HealthStatus.WARN).length;
	const failing = checks.filter((c) => c.status === HealthStatus.FAIL).length;
	const total = checks.length;

	// Overall status is the worst status
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
		const db = getDb();

		// Test basic query
		const result = db
			.prepare("SELECT COUNT(*) as count FROM profiles")
			.get() as { count: number };

		return {
			name: "database",
			status: HealthStatus.PASS,
			message: "Database connection healthy",
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { profileCount: result.count },
		};
	} catch (error) {
		return {
			name: "database",
			status: HealthStatus.FAIL,
			message: `Database check failed: ${error.message}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: error.message },
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

		// Test basic page navigation
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
	} catch (error) {
		return {
			name: "browser",
			status: HealthStatus.FAIL,
			message: `Browser check failed: ${error.message}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: error.message },
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

		// Determine status based on circuit state
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
			details: stats,
		};
	} catch (error) {
		return {
			name: "circuit_breaker",
			status: HealthStatus.FAIL,
			message: `Circuit breaker check failed: ${error.message}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: error.message },
		};
	}
}

/**
 * Check system resources (memory, CPU if available)
 */
async function checkSystemResources(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		// Memory usage
		const memUsage = process.memoryUsage();
		const memUsageMB = {
			rss: Math.round(memUsage.rss / 1024 / 1024),
			heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
			heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
			external: Math.round(memUsage.external / 1024 / 1024),
		};

		// CPU usage (basic)
		const cpuUsage = process.cpuUsage();
		const cpuUsageMs = {
			user: Math.round(cpuUsage.user / 1000),
			system: Math.round(cpuUsage.system / 1000),
		};

		// Warn if memory usage is high
		let status = HealthStatus.PASS;
		let message = "System resources normal";

		if (memUsageMB.heapUsed > 500) {
			// Over 500MB heap usage
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
	} catch (error) {
		return {
			name: "system_resources",
			status: HealthStatus.FAIL,
			message: `System resources check failed: ${error.message}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: error.message },
		};
	}
}

/**
 * Check queue status and processing health
 */
async function checkQueueStatus(): Promise<HealthCheck> {
	const startTime = Date.now();

	try {
		const db = getDb();

		// Get queue statistics
		const queueStats = db
			.prepare(`
			SELECT
				COUNT(*) as total,
				SUM(CASE WHEN priority >= 80 THEN 1 ELSE 0 END) as high_priority,
				SUM(CASE WHEN priority >= 50 AND priority < 80 THEN 1 ELSE 0 END) as medium_priority,
				SUM(CASE WHEN priority < 50 THEN 1 ELSE 0 END) as low_priority
			FROM queue
		`)
			.get() as {
			total: number;
			high_priority: number;
			medium_priority: number;
			low_priority: number;
		};

		// Get recent processing stats
		const recentStats = db
			.prepare(`
			SELECT
				COUNT(*) as recent_profiles,
				AVG(processing_time_seconds) as avg_processing_time
			FROM profiles
			WHERE visited_at > datetime('now', '-1 hour')
		`)
			.get() as {
			recent_profiles: number;
			avg_processing_time: number | null;
		};

		let status = HealthStatus.PASS;
		let message = "Queue processing normal";

		// Warn if queue is getting backed up
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
	} catch (error) {
		return {
			name: "queue_status",
			status: HealthStatus.FAIL,
			message: `Queue status check failed: ${error.message}`,
			duration: Date.now() - startTime,
			timestamp: new Date().toISOString(),
			details: { error: error.message },
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
