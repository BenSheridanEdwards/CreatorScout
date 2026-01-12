/**
 * Database Statistics Script
 *
 * Displays comprehensive stats about all database tables.
 *
 * Usage: npx tsx scripts/db_stats.ts
 */

import { query } from "../functions/shared/database/database.ts";

interface TableStats {
	name: string;
	count: number;
	details?: Record<string, number | string>;
}

async function getProfileStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM profiles",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const statsRes = await query<{
		creators: string;
		dm_sent: string;
		followed: string;
		hidden: string;
		with_proof: string;
		manual_override: string;
	}>(`
		SELECT
			COUNT(*) FILTER (WHERE is_creator = true)::text as creators,
			COUNT(*) FILTER (WHERE dm_sent = true)::text as dm_sent,
			COUNT(*) FILTER (WHERE followed = true)::text as followed,
			COUNT(*) FILTER (WHERE hidden = true)::text as hidden,
			COUNT(*) FILTER (WHERE proof_path IS NOT NULL)::text as with_proof,
			COUNT(*) FILTER (WHERE manual_override = true)::text as manual_override
		FROM profiles
	`);

	const stats = statsRes.rows[0];

	return {
		name: "Profiles",
		count,
		details: {
			"Confirmed Creators": parseInt(stats?.creators ?? "0", 10),
			"DMs Sent": parseInt(stats?.dm_sent ?? "0", 10),
			"Followed": parseInt(stats?.followed ?? "0", 10),
			"Hidden": parseInt(stats?.hidden ?? "0", 10),
			"With Proof": parseInt(stats?.with_proof ?? "0", 10),
			"Manual Override": parseInt(stats?.manual_override ?? "0", 10),
		},
	};
}

async function getQueueStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM queue",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const sourceRes = await query<{ source: string | null; cnt: string }>(`
		SELECT source, COUNT(*)::text as cnt
		FROM queue
		GROUP BY source
		ORDER BY COUNT(*) DESC
		LIMIT 5
	`);

	const details: Record<string, number | string> = {};
	for (const row of sourceRes.rows) {
		const source = row.source ?? "unknown";
		details[`Source: ${source}`] = parseInt(row.cnt, 10);
	}

	return { name: "Queue", count, details };
}

async function getFollowingScrapedStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM following_scraped",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const avgRes = await query<{ avg_scroll: string | null }>(`
		SELECT AVG(scroll_index)::text as avg_scroll FROM following_scraped
	`);

	return {
		name: "Following Scraped",
		count,
		details: {
			"Avg Scroll Index": Math.round(
				parseFloat(avgRes.rows[0]?.avg_scroll ?? "0"),
			),
		},
	};
}

async function getMetricsStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM metrics",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const totalsRes = await query<{
		total_profiles: string;
		total_creators: string;
		total_dms: string;
		total_follows: string;
	}>(`
		SELECT
			COALESCE(SUM(profiles_visited), 0)::text as total_profiles,
			COALESCE(SUM(creators_found), 0)::text as total_creators,
			COALESCE(SUM(dms_sent), 0)::text as total_dms,
			COALESCE(SUM(follows_completed), 0)::text as total_follows
		FROM metrics
	`);

	const totals = totalsRes.rows[0];

	return {
		name: "Metrics (Sessions)",
		count,
		details: {
			"Total Profiles Visited": parseInt(totals?.total_profiles ?? "0", 10),
			"Total Creators Found": parseInt(totals?.total_creators ?? "0", 10),
			"Total DMs Sent": parseInt(totals?.total_dms ?? "0", 10),
			"Total Follows": parseInt(totals?.total_follows ?? "0", 10),
		},
	};
}

async function getInstagramProfileStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM instagram_profiles",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const typeRes = await query<{ type: string; cnt: string }>(`
		SELECT type, COUNT(*)::text as cnt
		FROM instagram_profiles
		WHERE archived_at IS NULL
		GROUP BY type
	`);

	const details: Record<string, number | string> = {};
	for (const row of typeRes.rows) {
		details[`Type: ${row.type}`] = parseInt(row.cnt, 10);
	}

	const totalsRes = await query<{
		total_dms: string;
		total_follows: string;
	}>(`
		SELECT
			COALESCE(SUM(dms_today), 0)::text as total_dms,
			COALESCE(SUM(follows_today), 0)::text as total_follows
		FROM instagram_profiles
		WHERE archived_at IS NULL
	`);

	details["DMs Today (all)"] = parseInt(totalsRes.rows[0]?.total_dms ?? "0", 10);
	details["Follows Today (all)"] = parseInt(
		totalsRes.rows[0]?.total_follows ?? "0",
		10,
	);

	return { name: "Instagram Profiles", count, details };
}

async function getScheduledJobStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM scheduled_jobs",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const statusRes = await query<{ status: string; cnt: string }>(`
		SELECT status, COUNT(*)::text as cnt
		FROM scheduled_jobs
		GROUP BY status
		ORDER BY COUNT(*) DESC
	`);

	const details: Record<string, number | string> = {};
	for (const row of statusRes.rows) {
		details[`Status: ${row.status}`] = parseInt(row.cnt, 10);
	}

	return { name: "Scheduled Jobs", count, details };
}

async function getProxyUsageStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM proxy_usage",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const totalsRes = await query<{
		total_requests: string;
		total_mb: string;
	}>(`
		SELECT
			COALESCE(SUM(request_count), 0)::text as total_requests,
			COALESCE(SUM(estimated_mb), 0)::text as total_mb
		FROM proxy_usage
	`);

	const todayRes = await query<{
		today_requests: string;
		today_mb: string;
	}>(`
		SELECT
			COALESCE(SUM(request_count), 0)::text as today_requests,
			COALESCE(SUM(estimated_mb), 0)::text as today_mb
		FROM proxy_usage
		WHERE date = CURRENT_DATE
	`);

	return {
		name: "Proxy Usage",
		count,
		details: {
			"Total Requests": parseInt(totalsRes.rows[0]?.total_requests ?? "0", 10),
			"Total MB": parseFloat(totalsRes.rows[0]?.total_mb ?? "0").toFixed(2),
			"Today Requests": parseInt(
				todayRes.rows[0]?.today_requests ?? "0",
				10,
			),
			"Today MB": parseFloat(todayRes.rows[0]?.today_mb ?? "0").toFixed(2),
		},
	};
}

async function getProfileSessionStats(): Promise<TableStats> {
	const countRes = await query<{ count: string }>(
		"SELECT COUNT(*)::text as count FROM profile_sessions",
	);
	const count = parseInt(countRes.rows[0]?.count ?? "0", 10);

	const avgRes = await query<{ avg_duration: string | null }>(`
		SELECT AVG(duration_minutes)::text as avg_duration
		FROM profile_sessions
		WHERE duration_minutes IS NOT NULL
	`);

	return {
		name: "Profile Sessions",
		count,
		details: {
			"Avg Duration (min)": Math.round(
				parseFloat(avgRes.rows[0]?.avg_duration ?? "0"),
			),
		},
	};
}

function formatStats(stats: TableStats[]): string {
	let output = "\n";
	output += "╔══════════════════════════════════════════════════════════════╗\n";
	output += "║                     📊 DATABASE STATS                        ║\n";
	output += "╠══════════════════════════════════════════════════════════════╣\n";

	for (const table of stats) {
		output += `║ ${table.name.padEnd(25)} │ ${table.count.toString().padStart(10)} records ║\n`;

		if (table.details) {
			for (const [key, value] of Object.entries(table.details)) {
				const valStr = typeof value === "number" ? value.toLocaleString() : value;
				output += `║   └─ ${key.padEnd(21)} │ ${valStr.toString().padStart(10)} ║\n`;
			}
		}
		output += "╠══════════════════════════════════════════════════════════════╣\n";
	}

	output = output.slice(0, -67); // Remove last separator
	output += "╚══════════════════════════════════════════════════════════════╝\n";

	return output;
}

async function main(): Promise<void> {
	console.log("Fetching database statistics...\n");

	try {
		const stats = await Promise.all([
			getProfileStats(),
			getQueueStats(),
			getFollowingScrapedStats(),
			getMetricsStats(),
			getInstagramProfileStats(),
			getScheduledJobStats(),
			getProxyUsageStats(),
			getProfileSessionStats(),
		]);

		console.log(formatStats(stats));

		// Summary
		const totalRecords = stats.reduce((sum, s) => sum + s.count, 0);
		console.log(`Total records across all tables: ${totalRecords.toLocaleString()}`);
		console.log(`Generated at: ${new Date().toISOString()}`);
	} catch (error) {
		console.error("❌ Error fetching stats:", error);
		process.exit(1);
	}

	process.exit(0);
}

main();
