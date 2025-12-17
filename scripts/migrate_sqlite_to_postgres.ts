/**
 * One-time migration: SQLite (scout.db) -> Postgres (DATABASE_URL) using Prisma.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npx tsx scripts/migrate_sqlite_to_postgres.ts --sqlite ./scout.db
 *
 * Notes:
 * - This script intentionally does NOT add sqlite deps to package.json.
 *   If you still have the old SQLite DB, temporarily install the driver:
 *     npm i -D better-sqlite3
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type Args = { sqlitePath: string };

function parseArgs(): Args {
	const argv = process.argv.slice(2);
	const idx = argv.indexOf("--sqlite");
	const sqlitePath =
		idx >= 0 && argv[idx + 1]
			? argv[idx + 1]
			: process.env.SQLITE_PATH || "scout.db";
	return { sqlitePath };
}

function toDate(v: unknown): Date | null {
	if (v == null) return null;
	if (v instanceof Date) return v;
	if (typeof v === "number") return new Date(v);
	if (typeof v === "string") {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}

function toBool(v: unknown): boolean {
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v !== 0;
	if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
	return false;
}

function toInt(v: unknown, fallback = 0): number {
	if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? Math.trunc(n) : fallback;
	}
	return fallback;
}

function tryParseJson(v: unknown): Prisma.InputJsonValue | null {
	if (v == null) return null;
	if (typeof v === "object") return v as Prisma.InputJsonValue;
	if (typeof v !== "string") return null;
	const s = v.trim();
	if (!s) return null;
	try {
		return JSON.parse(s) as Prisma.InputJsonValue;
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL must be set (target Postgres).");
	}

	const { sqlitePath } = parseArgs();
	const absSqlite = resolve(process.cwd(), sqlitePath);

	const require = createRequire(import.meta.url);
	type BetterSqlite3Constructor = new (
		filename: string,
		options: { readonly: boolean },
	) => BetterSqlite3Db;
	type BetterSqlite3Statement = {
		all: () => unknown[];
	};
	type BetterSqlite3Db = {
		prepare: (sql: string) => BetterSqlite3Statement;
	};

	let SqliteDatabase: BetterSqlite3Constructor;
	try {
		SqliteDatabase = require("better-sqlite3") as BetterSqlite3Constructor;
	} catch {
		throw new Error(
			"Missing sqlite driver. Run `npm i -D better-sqlite3` to migrate, then remove it again.",
		);
	}

	const db = new SqliteDatabase(absSqlite, { readonly: true });
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL must be set (target Postgres).");
	}

	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl:
			process.env.NODE_ENV === "production"
				? { rejectUnauthorized: false }
				: undefined,
	});
	const adapter = new PrismaPg(pool);
	const prisma = new PrismaClient({ adapter });
	await prisma.$connect();

	const tables = db
		.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
		.all()
		.map((r) => String((r as { name?: unknown }).name));

	console.log(`[migrate] sqlite: ${absSqlite}`);
	console.log(`[migrate] tables: ${tables.join(", ")}`);

	// Profiles
	if (tables.includes("profiles")) {
		const rows = db.prepare("SELECT * FROM profiles").all() as Array<
			Record<string, unknown>
		>;
		console.log(`[migrate] profiles: ${rows.length}`);
		for (const r of rows) {
			const username = String(r.username ?? "")
				.toLowerCase()
				.trim();
			if (!username) continue;

			await prisma.profile.upsert({
				where: { username },
				create: {
					username,
					displayName: r.display_name ?? r.displayName ?? null,
					bioText: r.bio_text ?? r.bioText ?? null,
					linkUrl: r.link_url ?? r.linkUrl ?? null,
					bioScore: toInt(r.bio_score ?? r.bioScore, 0),
					isCreator: toBool(r.is_patreon ?? r.isCreator),
					confidence: toInt(r.confidence, 0),
					dmSent: toBool(r.dm_sent ?? r.dmSent),
					dmSentAt: toDate(r.dm_sent_at ?? r.dmSentAt),
					followed: toBool(r.followed),
					proofPath: r.proof_path ?? r.proofPath ?? null,
					visitedAt: toDate(r.visited_at ?? r.visitedAt) ?? new Date(),
					lastSeen: toDate(r.last_seen ?? r.lastSeen) ?? new Date(),
					processingTimeSeconds:
						r.processing_time_seconds ?? r.processingTimeSeconds ?? null,
					discoverySource: r.discovery_source ?? r.discoverySource ?? null,
					discoveryDepth: toInt(r.discovery_depth ?? r.discoveryDepth, 0),
					sessionId: r.session_id ?? r.sessionId ?? null,
					contentCategories: tryParseJson(
						r.content_categories ?? r.contentCategories,
					),
					engagementMetrics: tryParseJson(
						r.engagement_metrics ?? r.engagementMetrics,
					),
					visionApiCalls: toInt(r.vision_api_calls ?? r.visionApiCalls, 0),
					errorsEncountered: tryParseJson(
						r.errors_encountered ?? r.errorsEncountered,
					),
					lastErrorAt: toDate(r.last_error_at ?? r.lastErrorAt),
					sourceProfile: r.source_profile ?? r.sourceProfile ?? null,
				},
				update: {
					displayName: r.display_name ?? r.displayName ?? null,
					bioText: r.bio_text ?? r.bioText ?? null,
					linkUrl: r.link_url ?? r.linkUrl ?? null,
					bioScore: toInt(r.bio_score ?? r.bioScore, 0),
					isCreator: toBool(r.is_patreon ?? r.isCreator),
					confidence: toInt(r.confidence, 0),
					dmSent: toBool(r.dm_sent ?? r.dmSent),
					dmSentAt: toDate(r.dm_sent_at ?? r.dmSentAt),
					followed: toBool(r.followed),
					proofPath: r.proof_path ?? r.proofPath ?? null,
					visitedAt: toDate(r.visited_at ?? r.visitedAt) ?? new Date(),
					lastSeen: toDate(r.last_seen ?? r.lastSeen) ?? new Date(),
					processingTimeSeconds:
						r.processing_time_seconds ?? r.processingTimeSeconds ?? null,
					discoverySource: r.discovery_source ?? r.discoverySource ?? null,
					discoveryDepth: toInt(r.discovery_depth ?? r.discoveryDepth, 0),
					sessionId: r.session_id ?? r.sessionId ?? null,
					contentCategories: tryParseJson(
						r.content_categories ?? r.contentCategories,
					),
					engagementMetrics: tryParseJson(
						r.engagement_metrics ?? r.engagementMetrics,
					),
					visionApiCalls: toInt(r.vision_api_calls ?? r.visionApiCalls, 0),
					errorsEncountered: tryParseJson(
						r.errors_encountered ?? r.errorsEncountered,
					),
					lastErrorAt: toDate(r.last_error_at ?? r.lastErrorAt),
					sourceProfile: r.source_profile ?? r.sourceProfile ?? null,
				},
			});
		}
	}

	// Queue
	if (tables.includes("queue")) {
		const rows = db.prepare("SELECT * FROM queue").all() as Array<
			Record<string, unknown>
		>;
		console.log(`[migrate] queue: ${rows.length}`);
		for (const r of rows) {
			const username = String(r.username ?? "")
				.toLowerCase()
				.trim();
			if (!username) continue;
			await prisma.queueItem.upsert({
				where: { username },
				create: {
					username,
					priority: toInt(r.priority, 10),
					source: r.source ?? null,
					addedAt: toDate(r.added_at ?? r.addedAt) ?? new Date(),
				},
				update: {
					priority: toInt(r.priority, 10),
					source: r.source ?? null,
					addedAt: toDate(r.added_at ?? r.addedAt) ?? new Date(),
				},
			});
		}
	}

	// Following scraped
	if (tables.includes("following_scraped")) {
		const rows = db.prepare("SELECT * FROM following_scraped").all() as Array<
			Record<string, unknown>
		>;
		console.log(`[migrate] following_scraped: ${rows.length}`);
		for (const r of rows) {
			const username = String(r.username ?? "")
				.toLowerCase()
				.trim();
			if (!username) continue;
			await prisma.followingScraped.upsert({
				where: { username },
				create: {
					username,
					scrollIndex: toInt(r.scroll_index ?? r.scrollIndex, 0),
					scrapedAt: toDate(r.scraped_at ?? r.scrapedAt) ?? new Date(),
				},
				update: {
					scrollIndex: toInt(r.scroll_index ?? r.scrollIndex, 0),
					scrapedAt: toDate(r.scraped_at ?? r.scrapedAt) ?? new Date(),
				},
			});
		}
	}

	// Metrics (id autoincrements in Postgres; we preserve date/sessionId and counters)
	if (tables.includes("metrics")) {
		const rows = db.prepare("SELECT * FROM metrics").all() as Array<
			Record<string, unknown>
		>;
		console.log(`[migrate] metrics: ${rows.length}`);
		for (const r of rows) {
			const dateStr = (r.date ?? "").toString();
			const date =
				dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
					? new Date(dateStr)
					: null;

			await prisma.metric.create({
				data: {
					date,
					sessionId: r.session_id ?? r.sessionId ?? null,
					profilesVisited: toInt(r.profiles_visited ?? r.profilesVisited, 0),
					creatorsFound: toInt(r.creators_found ?? r.creatorsFound, 0),
					dmsSent: toInt(r.dms_sent ?? r.dmsSent, 0),
					followsCompleted: toInt(r.follows_completed ?? r.followsCompleted, 0),
					avgBioScore:
						r.avg_bio_score != null
							? new Prisma.Decimal(String(r.avg_bio_score))
							: null,
					avgConfidence:
						r.avg_confidence != null
							? new Prisma.Decimal(String(r.avg_confidence))
							: null,
					visionApiCost:
						r.vision_api_cost != null
							? new Prisma.Decimal(String(r.vision_api_cost))
							: null,
					avgProcessingTimeSeconds:
						r.avg_processing_time_seconds != null
							? new Prisma.Decimal(String(r.avg_processing_time_seconds))
							: null,
					errorsEncountered: toInt(
						r.errors_encountered ?? r.errorsEncountered,
						0,
					),
					rateLimitsHit: toInt(r.rate_limits_hit ?? r.rateLimitsHit, 0),
					createdAt: toDate(r.created_at ?? r.createdAt) ?? new Date(),
				},
			});
		}
	}

	await prisma.$disconnect();
	console.log("[migrate] done");
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});



