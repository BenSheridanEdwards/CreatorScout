/**
 * Data Quality Monitor
 * 
 * Monitors database for null/empty values and alerts when data quality degrades.
 * This helps detect if proxy blocking is preventing data extraction.
 */

import { getPrismaClient } from "./database.ts";
import { createLogger } from "../logger/logger.ts";
import { sendDataQualityAlert } from "../notifications/notificationService.ts";

const logger = createLogger();

export interface DataQualityReport {
	timestamp: Date;
	totalProfiles: number;
	profilesWithMissingData: {
		missingBio: number;
		missingFollowers: number;
		missingStats: number;
	};
	recentProfilesQuality: {
		last24Hours: {
			total: number;
			missingBio: number;
			missingFollowers: number;
		};
		lastHour: {
			total: number;
			missingBio: number;
			missingFollowers: number;
		};
	};
	alerts: Array<{
		level: "warning" | "error";
		message: string;
		field: string;
		threshold: number;
		actual: number;
	}>;
}

/**
 * Check data quality and generate report
 */
export async function checkDataQuality(): Promise<DataQualityReport> {
	const prisma = getPrismaClient();
	const now = new Date();
	const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
	const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

	// Get all profiles
	const totalProfiles = await prisma.profile.count();

	// Count profiles with missing data (displayName excluded - not all profiles have one)
	const missingBio = await prisma.profile.count({
		where: {
			OR: [
				{ bioText: null },
				{ bioText: "" },
			],
		},
	});

	const missingFollowers = await prisma.profile.count({
		where: {
			followers: null,
		},
	});

	const missingStats = await prisma.profile.count({
		where: {
			engagementMetrics: {
				equals: null,
			},
		},
	});

	// Check recent profiles (last 24 hours)
	const recent24h = await prisma.profile.findMany({
		where: {
			visitedAt: {
				gte: last24Hours,
			},
		},
		select: {
			bioText: true,
			followers: true,
		},
	});

	const recent1h = await prisma.profile.findMany({
		where: {
			visitedAt: {
				gte: lastHour,
			},
		},
		select: {
			bioText: true,
			followers: true,
		},
	});

	const recent24hMissingBio = recent24h.filter(
		(p) => !p.bioText || p.bioText === "",
	).length;
	const recent24hMissingFollowers = recent24h.filter(
		(p) => p.followers === null,
	).length;

	const recent1hMissingBio = recent1h.filter(
		(p) => !p.bioText || p.bioText === "",
	).length;
	const recent1hMissingFollowers = recent1h.filter(
		(p) => p.followers === null,
	).length;

	// Generate alerts
	const alerts: DataQualityReport["alerts"] = [];

	// Alert if >20% of recent profiles missing bio
	if (recent24h.length > 0) {
		const bioMissingRate = recent24hMissingBio / recent24h.length;
		if (bioMissingRate > 0.2) {
			alerts.push({
				level: "error",
				message: `High missing bio rate: ${(bioMissingRate * 100).toFixed(1)}% of recent profiles`,
				field: "bioText",
				threshold: 0.2,
				actual: bioMissingRate,
			});
		} else if (bioMissingRate > 0.1) {
			alerts.push({
				level: "warning",
				message: `Elevated missing bio rate: ${(bioMissingRate * 100).toFixed(1)}% of recent profiles`,
				field: "bioText",
				threshold: 0.1,
				actual: bioMissingRate,
			});
		}
	}

	// Alert if >50% of recent profiles missing followers (this is more common)
	if (recent24h.length > 0) {
		const followersMissingRate =
			recent24hMissingFollowers / recent24h.length;
		if (followersMissingRate > 0.5) {
			alerts.push({
				level: "warning",
				message: `High missing followers rate: ${(followersMissingRate * 100).toFixed(1)}% of recent profiles`,
				field: "followers",
				threshold: 0.5,
				actual: followersMissingRate,
			});
		}
	}

	// Log alerts
	for (const alert of alerts) {
		if (alert.level === "error") {
			logger.error(
				"DATA_QUALITY",
				`🚨 ${alert.message} - Check if proxy blocking is preventing data extraction`,
			);
		} else {
			logger.warn("DATA_QUALITY", `⚠️  ${alert.message}`);
		}
	}

	return {
		timestamp: now,
		totalProfiles,
		profilesWithMissingData: {
			missingBio,
			missingFollowers,
			missingStats,
		},
		recentProfilesQuality: {
			last24Hours: {
				total: recent24h.length,
				missingBio: recent24hMissingBio,
				missingFollowers: recent24hMissingFollowers,
			},
			lastHour: {
				total: recent1h.length,
				missingBio: recent1hMissingBio,
				missingFollowers: recent1hMissingFollowers,
			},
		},
		alerts,
	};
}

/**
 * Check data quality after a session completes
 */
export async function checkDataQualityAfterSession(): Promise<void> {
	const report = await checkDataQuality();

	// Log summary
	if (report.alerts.length === 0) {
		logger.info(
			"DATA_QUALITY",
			`✅ Data quality check passed - ${report.recentProfilesQuality.lastHour.total} profiles in last hour, all fields populated`,
		);
	} else {
		const errorCount = report.alerts.filter((a) => a.level === "error").length;
		const warningCount = report.alerts.filter(
			(a) => a.level === "warning",
		).length;
		logger.warn(
			"DATA_QUALITY",
			`⚠️  Data quality issues detected: ${errorCount} errors, ${warningCount} warnings`,
		);

		// Send notification if there are errors
		if (errorCount > 0) {
			try {
				await sendDataQualityAlert(report.alerts);
			} catch (notifyError) {
				logger.debug("DATA_QUALITY", `Failed to send notification: ${notifyError}`);
			}
		}
	}
}
