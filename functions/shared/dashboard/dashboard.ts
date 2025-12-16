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

import { getDb } from "../database/database.ts";
import { getInstagramCircuitBreaker } from "../circuitBreaker/circuitBreaker.ts";

const ACTIVITY_LOG_SIZE = 50;
let recentActivity: DashboardMetrics["recentActivity"] = [];

/**
 * Get comprehensive dashboard metrics
 */
export function getDashboardMetrics(): DashboardMetrics {
	const db = getDb();
	const now = new Date();

	// Current stats
	const queueSize = (
		db.prepare("SELECT COUNT(*) as count FROM queue").get() as { count: number }
	).count;

	// Last 24 hours stats
	const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

	const dailyStats = db
		.prepare(`
		SELECT
			COUNT(*) as profiles_processed,
			SUM(CASE WHEN is_patreon = 1 THEN 1 ELSE 0 END) as creators_found,
			SUM(dm_sent) as dms_sent,
			SUM(followed) as follows_completed,
			AVG(processing_time_seconds) as avg_processing_time,
			SUM(vision_api_calls * 0.001) as vision_api_cost,
			COUNT(CASE WHEN last_error_at IS NOT NULL THEN 1 END) as total_errors
		FROM profiles
		WHERE visited_at > ?
	`)
		.get(dayAgo) as {
		profiles_processed: number;
		creators_found: number;
		dms_sent: number;
		follows_completed: number;
		avg_processing_time: number | null;
		vision_api_cost: number | null;
		total_errors: number;
	};

	// Calculate efficiency metrics
	const profilesProcessed = dailyStats.profiles_processed || 0;
	const creatorsFound = dailyStats.creators_found || 0;
	const dmsSent = dailyStats.dms_sent || 0;
	const visionApiCost = dailyStats.vision_api_cost || 0;

	const creatorDiscoveryRate =
		profilesProcessed > 0 ? (creatorsFound / profilesProcessed) * 100 : 0;
	const dmConversionRate =
		creatorsFound > 0 ? (dmsSent / creatorsFound) * 100 : 0;

	// Vision efficiency (lower is better - fewer calls per profile)
	const visionCalls = db
		.prepare(`
		SELECT SUM(vision_api_calls) as total_calls
		FROM profiles
		WHERE visited_at > ?
	`)
		.get(dayAgo) as { total_calls: number | null };

	const totalVisionCalls = visionCalls.total_calls || 0;
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
	const recentProcessing = db
		.prepare(`
		SELECT COUNT(*) as count
		FROM profiles
		WHERE visited_at > ?
	`)
		.get(hourAgo) as { count: number };

	const processingRate = recentProcessing.count; // profiles per hour

	return {
		current: {
			queueSize,
			activeSessions: 1, // For now, assume single session
			processingRate: Math.round((processingRate / 60) * 100) / 100, // per minute
			errorRate: 0, // Would need error tracking table
		},

		historical: {
			profilesProcessed,
			creatorsFound,
			dmsSent,
			followsCompleted: dailyStats.follows_completed || 0,
			avgProcessingTime: dailyStats.avg_processing_time || 0,
			visionApiCost,
			totalErrors: dailyStats.total_errors || 0,
		},

		efficiency: {
			creatorDiscoveryRate: Math.round(creatorDiscoveryRate * 100) / 100,
			dmConversionRate: Math.round(dmConversionRate * 100) / 100,
			visionEfficiency: Math.round(visionEfficiency * 100) / 100,
			costPerCreator: Math.round(costPerCreator * 10000) / 10000, // Round to 4 decimals
		},

		health: {
			circuitBreakerState: circuitStats.state,
			rateLimitHits: circuitStats.totalFailures,
			avgResponseTime: dailyStats.avg_processing_time || 0,
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
	output += "═".repeat(50) + "\n\n";

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
	const dashboard = getDashboardMetrics();
	console.log(formatDashboard(dashboard));
}
