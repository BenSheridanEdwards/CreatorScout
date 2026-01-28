#!/usr/bin/env tsx
/**
 * Check database field population and data integrity
 * Verifies that all expected fields are being populated correctly
 */

// Load environment variables
import { config } from "dotenv";
config();

import { getPrismaClient } from "../functions/shared/database/database.ts";

interface FieldCompleteness {
	total: number;
	hasDisplayName: number;
	hasBioText: number;
	hasLinkUrl: number;
	hasFollowers: number;
	hasSessionId: number;
	hasDiscoverySource: number;
	hasProcessingTime: number;
	hasContentCategories: number;
	hasEngagementMetrics: number;
}

async function checkFieldCompleteness(): Promise<void> {
	const prisma = getPrismaClient();

	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("  Database Field Population Check");
	console.log("═══════════════════════════════════════════════════════════\n");

	// Get total profiles
	const totalProfiles = await prisma.profile.count();
	console.log(`📊 Total Profiles: ${totalProfiles}`);

	if (totalProfiles === 0) {
		console.log("⚠️  No profiles found in database");
		return;
	}

	// Check recent profiles (last 7 days)
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

	const recentProfiles = await prisma.profile.findMany({
		where: {
			visitedAt: {
				gte: sevenDaysAgo,
			},
		},
		orderBy: {
			visitedAt: "desc",
		},
		take: 10,
	});

	console.log(`\n📅 Recent Profiles (Last 7 Days): ${recentProfiles.length}`);

	if (recentProfiles.length > 0) {
		console.log("\n🔍 Sample Recent Profiles:");
		console.log("─".repeat(80));
		for (const profile of recentProfiles.slice(0, 5)) {
			console.log(`\nUsername: ${profile.username}`);
			console.log(`  Display Name: ${profile.displayName || "❌ NULL"}`);
			console.log(`  Bio Text: ${profile.bioText ? `✅ (${profile.bioText.length} chars)` : "❌ NULL"}`);
			console.log(`  Link URL: ${profile.linkUrl || "❌ NULL"}`);
			console.log(`  Followers: ${profile.followers ?? "❌ NULL"}`);
			console.log(`  Bio Score: ${profile.bioScore}`);
			console.log(`  Is Creator: ${profile.isCreator}`);
			console.log(`  Confidence: ${profile.confidence}`);
			console.log(`  Session ID: ${profile.sessionId || "❌ NULL"}`);
			console.log(`  Discovery Source: ${profile.discoverySource || "❌ NULL"}`);
			console.log(`  Processing Time: ${profile.processingTimeSeconds ?? "❌ NULL"}s`);
			console.log(`  Content Categories: ${profile.contentCategories ? "✅" : "❌ NULL"}`);
			console.log(`  Engagement Metrics: ${profile.engagementMetrics ? "✅" : "❌ NULL"}`);
			console.log(`  Visited At: ${profile.visitedAt.toISOString()}`);
		}
	}

	// Field completeness statistics
	console.log("\n\n📈 Field Completeness Statistics (Last 7 Days):");
	console.log("─".repeat(80));

	const completeness = await prisma.$queryRaw<FieldCompleteness[]>`
		SELECT 
			COUNT(*)::int as total,
			COUNT(display_name)::int as "hasDisplayName",
			COUNT(bio_text)::int as "hasBioText",
			COUNT(link_url)::int as "hasLinkUrl",
			COUNT(followers)::int as "hasFollowers",
			COUNT(session_id)::int as "hasSessionId",
			COUNT(discovery_source)::int as "hasDiscoverySource",
			COUNT(processing_time_seconds)::int as "hasProcessingTime",
			COUNT(content_categories)::int as "hasContentCategories",
			COUNT(engagement_metrics)::int as "hasEngagementMetrics"
		FROM profiles
		WHERE visited_at > NOW() - INTERVAL '7 days'
	`;

	if (completeness.length > 0) {
		const stats = completeness[0];
		const pct = (count: number, total: number) =>
			total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";

		console.log(`Total Profiles: ${stats.total}`);
		console.log(`  Display Name: ${stats.hasDisplayName}/${stats.total} (${pct(stats.hasDisplayName, stats.total)}%)`);
		console.log(`  Bio Text: ${stats.hasBioText}/${stats.total} (${pct(stats.hasBioText, stats.total)}%)`);
		console.log(`  Link URL: ${stats.hasLinkUrl}/${stats.total} (${pct(stats.hasLinkUrl, stats.total)}%)`);
		console.log(`  Followers: ${stats.hasFollowers}/${stats.total} (${pct(stats.hasFollowers, stats.total)}%)`);
		console.log(`  Session ID: ${stats.hasSessionId}/${stats.total} (${pct(stats.hasSessionId, stats.total)}%)`);
		console.log(`  Discovery Source: ${stats.hasDiscoverySource}/${stats.total} (${pct(stats.hasDiscoverySource, stats.total)}%)`);
		console.log(`  Processing Time: ${stats.hasProcessingTime}/${stats.total} (${pct(stats.hasProcessingTime, stats.total)}%)`);
		console.log(`  Content Categories: ${stats.hasContentCategories}/${stats.total} (${pct(stats.hasContentCategories, stats.total)}%)`);
		console.log(`  Engagement Metrics: ${stats.hasEngagementMetrics}/${stats.total} (${pct(stats.hasEngagementMetrics, stats.total)}%)`);
	}

	// Check recent metrics
	console.log("\n\n📊 Recent Metrics:");
	console.log("─".repeat(80));

	const recentMetrics = await prisma.metric.findMany({
		orderBy: {
			createdAt: "desc",
		},
		take: 5,
	});

	if (recentMetrics.length > 0) {
		for (const metric of recentMetrics) {
			console.log(`\nSession ID: ${metric.sessionId || "❌ NULL"}`);
			console.log(`  Date: ${metric.date?.toISOString() || "❌ NULL"}`);
			console.log(`  Profiles Visited: ${metric.profilesVisited}`);
			console.log(`  Creators Found: ${metric.creatorsFound}`);
			console.log(`  DMs Sent: ${metric.dmsSent}`);
			console.log(`  Follows Completed: ${metric.followsCompleted}`);
			console.log(`  Avg Bio Score: ${metric.avgBioScore ?? "❌ NULL"}`);
			console.log(`  Avg Confidence: ${metric.avgConfidence ?? "❌ NULL"}`);
			console.log(`  Vision API Cost: ${metric.visionApiCost ?? "❌ NULL"}`);
			console.log(`  Errors Encountered: ${metric.errorsEncountered}`);
			console.log(`  Created At: ${metric.createdAt.toISOString()}`);
		}
	} else {
		console.log("⚠️  No metrics found");
	}

	// Check scheduled jobs
	console.log("\n\n📅 Recent Scheduled Jobs:");
	console.log("─".repeat(80));

	const recentJobs = await prisma.scheduledJob.findMany({
		orderBy: {
			scheduledTime: "desc",
		},
		take: 5,
	});

	if (recentJobs.length > 0) {
		for (const job of recentJobs) {
			console.log(`\nJob ID: ${job.id}`);
			console.log(`  Profile ID: ${job.profileId}`);
			console.log(`  Session Type: ${job.sessionType}`);
			console.log(`  Scheduled Time: ${job.scheduledTime.toISOString()}`);
			console.log(`  Status: ${job.status}`);
			console.log(`  Attempts: ${job.attempts}`);
			console.log(`  Completed At: ${job.completedAt?.toISOString() || "❌ NULL"}`);
			console.log(`  Error: ${job.error || "✅ None"}`);
		}
	} else {
		console.log("⚠️  No scheduled jobs found");
	}

	// Check for profiles with missing critical fields
	console.log("\n\n⚠️  Profiles Missing Critical Fields (Last 7 Days):");
	console.log("─".repeat(80));

	const missingFields = await prisma.profile.findMany({
		where: {
			visitedAt: {
				gte: sevenDaysAgo,
			},
			OR: [
				{ displayName: null },
				{ bioText: null },
				{ sessionId: null },
				{ discoverySource: null },
			],
		},
		select: {
			username: true,
			displayName: true,
			bioText: true,
			sessionId: true,
			discoverySource: true,
			visitedAt: true,
		},
		take: 10,
	});

	if (missingFields.length > 0) {
		console.log(`Found ${missingFields.length} profiles with missing fields:\n`);
		for (const profile of missingFields) {
			const missing: string[] = [];
			if (!profile.displayName) missing.push("display_name");
			if (!profile.bioText) missing.push("bio_text");
			if (!profile.sessionId) missing.push("session_id");
			if (!profile.discoverySource) missing.push("discovery_source");
			console.log(`  ${profile.username}: Missing [${missing.join(", ")}]`);
		}
	} else {
		console.log("✅ All recent profiles have critical fields populated");
	}

	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("✅ Database check complete");
	console.log("═══════════════════════════════════════════════════════════\n");
}

async function main() {
	try {
		await checkFieldCompleteness();
		process.exit(0);
	} catch (error) {
		console.error("❌ Error checking database:", error);
		process.exit(1);
	}
}

main();
