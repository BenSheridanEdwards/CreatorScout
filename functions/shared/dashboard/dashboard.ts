/**
 * Real-time metrics dashboard for Scout operations.
 *
 * Provides live metrics visualization and operational insights:
 * - Processing rates and performance
 * - Creator discovery trends
 * - Rate limiting and error patterns
 * - Cost analysis and efficiency metrics
 */

export interface DashboardMetrics {
	// Real-time stats
	current: {
		queueSize: number;
		activeSessions: number;
		processingRate: number; // profiles per minute
		errorRate: number; // errors per minute
	};

	// Historical data (last 24 hours)
	historical: {
		profilesProcessed: number;
		creatorsFound: number;
		dmsSent: number;
		followsCompleted: number;
		avgProcessingTime: number;
		visionApiCost: number;
		totalErrors: number;
	};

	// Efficiency metrics
	efficiency: {
		creatorDiscoveryRate: number; // creators found per 100 profiles
		dmConversionRate: number; // DMs sent per creator found
		visionEfficiency: number; // profiles analyzed per vision call
		costPerCreator: number; // total cost per confirmed creator
	};

	// System health
	health: {
		circuitBreakerState: string;
		rateLimitHits: number;
		avgResponseTime: number;
		memoryUsage: number;
	};

	// Recent activity
	recentActivity: Array<{
		timestamp: string;
		action: string;
		username: string;
		status: "success" | "error" | "warning";
		details?: string;
	}>;
}

import { getInstagramCircuitBreaker } from "../circuitBreaker/circuitBreaker.ts";
import { query } from "../database/database.ts";

const ACTIVITY_LOG_SIZE = 50;
let recentActivity: DashboardMetrics["recentActivity"] = [];

/**
 * Get comprehensive dashboard metrics
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
	const now = new Date();

	// Current stats
	const queueSizeRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM queue",
	);
	const queueSize = Number.parseInt(queueSizeRes.rows[0]?.count ?? "0", 10);

	// Last 24 hours stats
	const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

	const dailyRes = await query<{
		profiles_processed: string;
		creators_found: string;
		dms_sent: string;
		follows_completed: string;
		avg_processing_time: string | null;
		vision_api_cost: string | null;
		total_errors: string;
	}>(
		`SELECT
			COUNT(*)::text as profiles_processed,
			COALESCE(SUM(CASE WHEN is_creator THEN 1 ELSE 0 END), 0)::text as creators_found,
			COALESCE(SUM(CASE WHEN dm_sent THEN 1 ELSE 0 END), 0)::text as dms_sent,
			COALESCE(SUM(CASE WHEN followed THEN 1 ELSE 0 END), 0)::text as follows_completed,
			COALESCE(AVG(processing_time_seconds), 0)::text as avg_processing_time,
			COALESCE(SUM(COALESCE(vision_api_calls, 0) * 0.001), 0)::text as vision_api_cost,
			COUNT(*) FILTER (WHERE last_error_at IS NOT NULL)::text as total_errors
		FROM profiles
		WHERE visited_at > $1`,
		[dayAgo],
	);

	const dailyStats = dailyRes.rows[0] ?? {
		profiles_processed: "0",
		creators_found: "0",
		dms_sent: "0",
		follows_completed: "0",
		avg_processing_time: "0",
		vision_api_cost: "0",
		total_errors: "0",
	};

	const profilesProcessed = Number.parseInt(
		dailyStats.profiles_processed ?? "0",
		10,
	);
	const creatorsFound = Number.parseInt(dailyStats.creators_found ?? "0", 10);
	const dmsSent = Number.parseInt(dailyStats.dms_sent ?? "0", 10);
	const followsCompleted = Number.parseInt(
		dailyStats.follows_completed ?? "0",
		10,
	);
	const avgProcessingTime = Number(dailyStats.avg_processing_time ?? 0);
	const visionApiCost = Number(dailyStats.vision_api_cost ?? 0);
	const totalErrors = Number.parseInt(dailyStats.total_errors ?? "0", 10);

	// Efficiency metrics
	const creatorDiscoveryRate =
		profilesProcessed > 0 ? (creatorsFound / profilesProcessed) * 100 : 0;
	const dmConversionRate =
		creatorsFound > 0 ? (dmsSent / creatorsFound) * 100 : 0;

	const visionCallsRes = await query<{ total_calls: string | null }>(
		`SELECT COALESCE(SUM(COALESCE(vision_api_calls, 0)), 0)::text as total_calls
		 FROM profiles
		 WHERE visited_at > $1`,
		[dayAgo],
	);
	const totalVisionCalls = Number.parseInt(
		visionCallsRes.rows[0]?.total_calls ?? "0",
		10,
	);

	const visionEfficiency =
		totalVisionCalls > 0
			? profilesProcessed / totalVisionCalls
			: profilesProcessed;
	const costPerCreator = creatorsFound > 0 ? visionApiCost / creatorsFound : 0;

	// Circuit breaker status
	const circuitBreaker = getInstagramCircuitBreaker();
	const circuitStats = circuitBreaker.getStats();

	// Memory usage
	const memUsage = process.memoryUsage();
	const memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);

	// Recent processing rate (last hour)
	const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
	const recentProcessingRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM profiles WHERE visited_at > $1",
		[hourAgo],
	);
	const processedLastHour = Number.parseInt(
		recentProcessingRes.rows[0]?.count ?? "0",
		10,
	);

	return {
		current: {
			queueSize,
			activeSessions: 1, // For now, assume single session
			processingRate: Math.round((processedLastHour / 60) * 100) / 100, // per minute
			errorRate: 0, // Would need a dedicated error tracking table
		},

		historical: {
			profilesProcessed,
			creatorsFound,
			dmsSent,
			followsCompleted,
			avgProcessingTime,
			visionApiCost,
			totalErrors,
		},

		efficiency: {
			creatorDiscoveryRate: Math.round(creatorDiscoveryRate * 100) / 100,
			dmConversionRate: Math.round(dmConversionRate * 100) / 100,
			visionEfficiency: Math.round(visionEfficiency * 100) / 100,
			costPerCreator: Math.round(costPerCreator * 10000) / 10000,
		},

		health: {
			circuitBreakerState: circuitStats.state,
			rateLimitHits: circuitStats.totalFailures,
			avgResponseTime: avgProcessingTime,
			memoryUsage: memoryUsageMB,
		},

		recentActivity: getRecentActivity(),
	};
}

/**
 * Record an activity for the dashboard
 */
export function recordActivity(
	action: string,
	username: string,
	status: "success" | "error" | "warning" = "success",
	details?: string,
): void {
	const activity = {
		timestamp: new Date().toISOString(),
		action,
		username,
		status,
		details,
	};

	recentActivity.unshift(activity);

	// Keep only the most recent activities
	if (recentActivity.length > ACTIVITY_LOG_SIZE) {
		recentActivity = recentActivity.slice(0, ACTIVITY_LOG_SIZE);
	}
}

/**
 * Get recent activity log
 */
function getRecentActivity(): DashboardMetrics["recentActivity"] {
	return [...recentActivity];
}

/**
 * Format dashboard metrics for console display
 */
export function formatDashboard(dashboard: DashboardMetrics): string {
	let output = "📊 Scout Dashboard\n";
	output += `${"═".repeat(50)}\n\n`;

	// Current Status
	output += "🔴 CURRENT STATUS\n";
	output += `Queue Size: ${dashboard.current.queueSize}\n`;
	output += `Processing Rate: ${dashboard.current.processingRate} profiles/min\n`;
	output += `Circuit Breaker: ${dashboard.health.circuitBreakerState}\n`;
	output += `Memory Usage: ${dashboard.health.memoryUsage}MB\n\n`;

	// Historical (24h)
	output += "📈 LAST 24 HOURS\n";
	output += `Profiles Processed: ${dashboard.historical.profilesProcessed}\n`;
	output += `Creators Found: ${dashboard.historical.creatorsFound}\n`;
	output += `DMs Sent: ${dashboard.historical.dmsSent}\n`;
	output += `Follows Completed: ${dashboard.historical.followsCompleted}\n`;
	output += `Vision API Cost: $${dashboard.historical.visionApiCost.toFixed(4)}\n`;
	output += `Total Errors: ${dashboard.historical.totalErrors}\n\n`;

	// Efficiency Metrics
	output += "⚡ EFFICIENCY METRICS\n";
	output += `Creator Discovery Rate: ${dashboard.efficiency.creatorDiscoveryRate}%\n`;
	output += `DM Conversion Rate: ${dashboard.efficiency.dmConversionRate}%\n`;
	output += `Vision Efficiency: ${dashboard.efficiency.visionEfficiency} profiles/call\n`;
	output += `Cost per Creator: $${dashboard.efficiency.costPerCreator.toFixed(4)}\n\n`;

	// Recent Activity
	if (dashboard.recentActivity.length > 0) {
		output += "🕒 RECENT ACTIVITY\n";
		const recent = dashboard.recentActivity.slice(0, 10); // Show last 10
		for (const activity of recent) {
			const statusEmoji = {
				success: "✅",
				error: "❌",
				warning: "⚠️",
			}[activity.status];

			const time = new Date(activity.timestamp).toLocaleTimeString();
			output += `${statusEmoji} ${time} - ${activity.action} @${activity.username}`;
			if (activity.details) {
				output += ` (${activity.details})`;
			}
			output += "\n";
		}
	}

	return output;
}

/**
 * Create a simple dashboard script
 */
export async function showDashboard(): Promise<void> {
	const dashboard = await getDashboardMetrics();
	console.log(formatDashboard(dashboard));
}
