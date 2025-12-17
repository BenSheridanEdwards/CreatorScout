/**
 * Database operations using Prisma + Postgres (Railway) with a lightweight in-memory
 * fallback for unit tests.
 *
 * Rationale:
 * - Production/Dev: PrismaClient + DATABASE_URL
 * - Unit tests: avoid spinning up Postgres; use an in-memory store that matches
 *   the behavior of the exported functions.
 */

import { PrismaClient, Prisma } from "@prisma/client";

export type RuntimeMode = "prisma" | "memory";

function isTestRuntime(): boolean {
	return (
		process.env.NODE_ENV === "test" ||
		process.env.JEST_WORKER_ID !== undefined ||
		process.env.VITEST !== undefined
	);
}

function getMode(): RuntimeMode {
	if (process.env.DATABASE_URL) return "prisma";
	if (isTestRuntime()) return "memory";
	throw new Error(
		"DATABASE_URL is not set. Set DATABASE_URL to a Postgres connection string (Railway provides this automatically).",
	);
}

let prisma: PrismaClient | null = null;
let initPromise: Promise<void> | null = null;

type ProfileErrorEntry = {
	type: string;
	message: string;
	timestamp: string;
};

type ProfileRow = {
	username: string;
	displayName: string | null;
	bioText: string | null;
	linkUrl: string | null;
	bioScore: number;
	isCreator: boolean;
	confidence: number;
	dmSent: boolean;
	dmSentAt: Date | null;
	followed: boolean;
	proofPath: string | null;
	visitedAt: Date;
	lastSeen: Date;
	processingTimeSeconds: number | null;
	discoverySource: string | null;
	discoveryDepth: number;
	sessionId: string | null;
	contentCategories: string[] | null;
	engagementMetrics: unknown | null;
	visionApiCalls: number;
	errorsEncountered: ProfileErrorEntry[];
	lastErrorAt: Date | null;
	sourceProfile: string | null;
};

type QueueRow = {
	username: string;
	priority: number;
	source: string | null;
	addedAt: Date;
};

type FollowingScrapedRow = {
	username: string;
	scrollIndex: number;
	scrapedAt: Date;
};

type MetricRow = {
	id: bigint;
	date: string; // YYYY-MM-DD
	sessionId: string;
	profilesVisited: number;
	creatorsFound: number;
	dmsSent: number;
	followsCompleted: number;
	avgBioScore: number | null;
	avgConfidence: number | null;
	visionApiCost: number | null;
	avgProcessingTimeSeconds: number | null;
	errorsEncountered: number;
	rateLimitsHit: number;
	createdAt: Date;
};

type MemoryDb = {
	profiles: Map<string, ProfileRow>;
	queue: Map<string, QueueRow>;
	following: Map<string, FollowingScrapedRow>;
	metrics: Map<bigint, MetricRow>;
	metricSeq: bigint;
};

let mem: MemoryDb | null = null;

function getPrisma(): PrismaClient {
	if (prisma) return prisma;
	prisma = new PrismaClient();
	return prisma;
}

function getMem(): MemoryDb {
	if (!mem) {
		mem = {
			profiles: new Map(),
			queue: new Map(),
			following: new Map(),
			metrics: new Map(),
			metricSeq: 0n,
		};
	}
	return mem;
}

export async function initDb(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			const mode = getMode();
			if (mode === "prisma") {
				await getPrisma().$connect();
			} else {
				getMem();
			}
		})();
	}
	return initPromise;
}

export async function closeDb(): Promise<void> {
	if (prisma) {
		try {
			await prisma.$disconnect();
		} catch {
			// ignore
		}
	}
	prisma = null;
	initPromise = null;
	mem = null;
}

/**
 * Escape hatch for legacy callers that used raw SQL.
 *
 * - In Prisma mode, runs `$queryRawUnsafe`.
 * - In memory mode, throws (use the typed helpers instead).
 */
export async function query<T = unknown>(
	sql: string,
	params: unknown[] = [],
): Promise<{ rows: T[] }> {
	await initDb();
	if (getMode() !== "prisma") {
		throw new Error("query() is not available in memory mode");
	}
	// Prisma expects params as variadic arguments.
	const rows = (await getPrisma().$queryRawUnsafe(sql, ...params)) as T[];
	return { rows };
}

// === Queue Operations ===

export async function queueAdd(
	username: string,
	priority: number = 10,
	source: string = "seed",
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		if (db.queue.has(u)) return;
		db.queue.set(u, {
			username: u,
			priority,
			source,
			addedAt: new Date(),
		});
		return;
	}

	await getPrisma().queueItem.upsert({
		where: { username: u },
		create: { username: u, priority, source, addedAt: new Date() },
		update: {},
	});
}

export async function queueNext(): Promise<string | null> {
	await initDb();

	if (getMode() === "memory") {
		const db = getMem();
		let best: QueueRow | null = null;
		for (const item of db.queue.values()) {
			if (!best) best = item;
			else if (item.priority > best.priority) best = item;
			else if (item.priority === best.priority && item.addedAt < best.addedAt)
				best = item;
		}
		if (!best) return null;
		db.queue.delete(best.username);
		return best.username;
	}

	return getPrisma().$transaction(async (tx) => {
		const next = await tx.queueItem.findFirst({
			orderBy: [{ priority: "desc" }, { addedAt: "asc" }],
			select: { username: true },
		});
		if (!next) return null;
		await tx.queueItem.delete({ where: { username: next.username } });
		return next.username;
	});
}

export async function queueCount(): Promise<number> {
	await initDb();
	if (getMode() === "memory") return getMem().queue.size;
	return getPrisma().queueItem.count();
}

export async function clearQueue(): Promise<void> {
	await initDb();
	if (getMode() === "memory") {
		getMem().queue.clear();
		return;
	}
	await getPrisma().queueItem.deleteMany();
}

// === Profile Operations ===

function defaultProfileRow(username: string): ProfileRow {
	const now = new Date();
	return {
		username,
		displayName: null,
		bioText: null,
		linkUrl: null,
		bioScore: 0,
		isCreator: false,
		confidence: 0,
		dmSent: false,
		dmSentAt: null,
		followed: false,
		proofPath: null,
		visitedAt: now,
		lastSeen: now,
		processingTimeSeconds: null,
		discoverySource: null,
		discoveryDepth: 0,
		sessionId: null,
		contentCategories: null,
		engagementMetrics: null,
		visionApiCalls: 0,
		errorsEncountered: [],
		lastErrorAt: null,
		sourceProfile: null,
	};
}

export async function wasVisited(username: string): Promise<boolean> {
	await initDb();
	const u = username.toLowerCase().trim();
	if (getMode() === "memory") return getMem().profiles.has(u);
	const row = await getPrisma().profile.findUnique({
		where: { username: u },
		select: { username: true },
	});
	return Boolean(row);
}

export async function markVisited(
	username: string,
	displayName?: string | null,
	bio?: string | null,
	bioScore: number = 0,
	linkUrl?: string | null,
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const existing = db.profiles.get(u) ?? defaultProfileRow(u);
		if (displayName !== undefined) existing.displayName = displayName;
		if (bio !== undefined) existing.bioText = bio;
		if (linkUrl !== undefined) existing.linkUrl = linkUrl;
		existing.bioScore = bioScore;
		existing.lastSeen = new Date();
		if (!db.profiles.has(u)) existing.visitedAt = new Date();
		db.profiles.set(u, existing);
		return;
	}

	const updateData: Prisma.ProfileUpdateInput = {
		bioScore,
		lastSeen: new Date(),
	};
	if (displayName !== undefined) updateData.displayName = displayName;
	if (bio !== undefined) updateData.bioText = bio;
	if (linkUrl !== undefined) updateData.linkUrl = linkUrl;

	await getPrisma().profile.upsert({
		where: { username: u },
		create: {
			username: u,
			displayName: displayName ?? null,
			bioText: bio ?? null,
			bioScore,
			linkUrl: linkUrl ?? null,
			visitedAt: new Date(),
			lastSeen: new Date(),
		},
		update: updateData,
	});
}

export async function markAsCreator(
	username: string,
	confidence: number = 0,
	proofPath?: string | null,
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const p = db.profiles.get(u) ?? defaultProfileRow(u);
		p.isCreator = true;
		p.confidence = confidence;
		p.proofPath = proofPath ?? p.proofPath;
		p.lastSeen = new Date();
		db.profiles.set(u, p);
		return;
	}

	await getPrisma().profile.update({
		where: { username: u },
		data: {
			isCreator: true,
			confidence,
			proofPath: proofPath ?? null,
			lastSeen: new Date(),
		},
	});
}

export async function getConfirmedCreators(): Promise<string[]> {
	await initDb();
	if (getMode() === "memory") {
		return [...getMem().profiles.values()]
			.filter((p) => p.isCreator)
			.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
			.map((p) => p.username);
	}
	const rows = await getPrisma().profile.findMany({
		where: { isCreator: true },
		orderBy: { lastSeen: "desc" },
		select: { username: true },
	});
	return rows.map((r) => r.username);
}

export async function wasDmSent(username: string): Promise<boolean> {
	await initDb();
	const u = username.toLowerCase().trim();
	if (getMode() === "memory") return Boolean(getMem().profiles.get(u)?.dmSent);
	const row = await getPrisma().profile.findUnique({
		where: { username: u },
		select: { dmSent: true },
	});
	return Boolean(row?.dmSent);
}

export async function markDmSent(
	username: string,
	proofPath?: string | null,
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const p = db.profiles.get(u) ?? defaultProfileRow(u);
		p.dmSent = true;
		p.dmSentAt = new Date();
		if (proofPath !== undefined && proofPath !== null) p.proofPath = proofPath;
		db.profiles.set(u, p);
		return;
	}

	await getPrisma().profile.update({
		where: { username: u },
		data: {
			dmSent: true,
			dmSentAt: new Date(),
			proofPath: proofPath ?? undefined,
		},
	});
}

export async function wasFollowed(username: string): Promise<boolean> {
	await initDb();
	const u = username.toLowerCase().trim();
	if (getMode() === "memory")
		return Boolean(getMem().profiles.get(u)?.followed);
	const row = await getPrisma().profile.findUnique({
		where: { username: u },
		select: { followed: true },
	});
	return Boolean(row?.followed);
}

export async function markFollowed(username: string): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const p = db.profiles.get(u) ?? defaultProfileRow(u);
		p.followed = true;
		db.profiles.set(u, p);
		return;
	}

	await getPrisma().profile.update({
		where: { username: u },
		data: { followed: true },
	});
}

// === Following Scrape Tracking ===

export async function getScrollIndex(username: string): Promise<number> {
	await initDb();
	const u = username.toLowerCase().trim();
	if (getMode() === "memory")
		return getMem().following.get(u)?.scrollIndex ?? 0;
	const row = await getPrisma().followingScraped.findUnique({
		where: { username: u },
		select: { scrollIndex: true },
	});
	return row?.scrollIndex ?? 0;
}

export async function updateScrollIndex(
	username: string,
	index: number,
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		getMem().following.set(u, {
			username: u,
			scrollIndex: index,
			scrapedAt: new Date(),
		});
		return;
	}

	await getPrisma().followingScraped.upsert({
		where: { username: u },
		create: { username: u, scrollIndex: index, scrapedAt: new Date() },
		update: { scrollIndex: index, scrapedAt: new Date() },
	});
}

// === Stats ===

export interface Stats {
	total_visited: number;
	confirmed_creators: number;
	dms_sent: number;
	queue_size: number;
}

export interface SessionMetrics {
	sessionId: string;
	startTime: Date;
	endTime?: Date;
	profilesVisited: number;
	creatorsFound: number;
	dmsSent: number;
	followsCompleted: number;
	errorsEncountered: number;
	rateLimitsHit: number;
	totalProcessingTime: number;
	visionApiCalls: number;
	visionApiCost: number;
}

export interface UpdateSessionMetricsInput {
	profilesVisited?: number;
	creatorsFound?: number;
	dmsSent?: number;
	followsCompleted?: number;
	avgBioScore?: number;
	avgConfidence?: number;
	visionApiCost?: number;
	avgProcessingTime?: number;
	errorsEncountered?: number;
	rateLimitsHit?: number;
}

export interface DailyMetrics {
	date: string; // YYYY-MM-DD
	totalSessions: number;
	totalProfilesVisited: number;
	totalCreatorsFound: number;
	totalDmsSent: number;
	totalFollowsCompleted: number;
	avgBioScore: number;
	avgConfidence: number;
	totalVisionApiCost: number;
	totalErrors: number;
	totalRateLimits: number;
}

export async function getStats(): Promise<Stats> {
	await initDb();
	if (getMode() === "memory") {
		const db = getMem();
		const totalVisited = db.profiles.size;
		let creators = 0;
		let dms = 0;
		for (const p of db.profiles.values()) {
			if (p.isCreator) creators++;
			if (p.dmSent) dms++;
		}
		return {
			total_visited: totalVisited,
			confirmed_creators: creators,
			dms_sent: dms,
			queue_size: db.queue.size,
		};
	}

	const [totalVisited, confirmedCreators, dmsSentCount, queueSize] =
		await Promise.all([
			getPrisma().profile.count(),
			getPrisma().profile.count({ where: { isCreator: true } }),
			getPrisma().profile.count({ where: { dmSent: true } }),
			getPrisma().queueItem.count(),
		]);

	return {
		total_visited: totalVisited,
		confirmed_creators: confirmedCreators,
		dms_sent: dmsSentCount,
		queue_size: queueSize,
	};
}

// === Metrics Functions ===

export async function startSessionMetrics(sessionId: string): Promise<void> {
	await initDb();
	const yyyyMmDd = new Date().toISOString().split("T")[0];

	if (getMode() === "memory") {
		const db = getMem();
		db.metricSeq += 1n;
		db.metrics.set(db.metricSeq, {
			id: db.metricSeq,
			date: yyyyMmDd,
			sessionId,
			profilesVisited: 0,
			creatorsFound: 0,
			dmsSent: 0,
			followsCompleted: 0,
			avgBioScore: null,
			avgConfidence: null,
			visionApiCost: null,
			avgProcessingTimeSeconds: null,
			errorsEncountered: 0,
			rateLimitsHit: 0,
			createdAt: new Date(),
		});
		return;
	}

	await getPrisma().metric.create({
		data: {
			date: new Date(yyyyMmDd),
			sessionId,
			createdAt: new Date(),
		},
	});
}

export async function updateSessionMetrics(
	sessionId: string,
	metrics: UpdateSessionMetricsInput,
): Promise<void> {
	await initDb();
	if (Object.keys(metrics).length === 0) return;

	if (getMode() === "memory") {
		const db = getMem();
		for (const row of db.metrics.values()) {
			if (row.sessionId !== sessionId) continue;
			if (metrics.profilesVisited !== undefined)
				row.profilesVisited = metrics.profilesVisited;
			if (metrics.creatorsFound !== undefined)
				row.creatorsFound = metrics.creatorsFound;
			if (metrics.dmsSent !== undefined) row.dmsSent = metrics.dmsSent;
			if (metrics.followsCompleted !== undefined)
				row.followsCompleted = metrics.followsCompleted;
			if (metrics.avgBioScore !== undefined)
				row.avgBioScore = metrics.avgBioScore;
			if (metrics.avgConfidence !== undefined)
				row.avgConfidence = metrics.avgConfidence;
			if (metrics.visionApiCost !== undefined)
				row.visionApiCost = metrics.visionApiCost;
			if (metrics.avgProcessingTime !== undefined)
				row.avgProcessingTimeSeconds = metrics.avgProcessingTime;
			if (metrics.errorsEncountered !== undefined)
				row.errorsEncountered = metrics.errorsEncountered;
			if (metrics.rateLimitsHit !== undefined)
				row.rateLimitsHit = metrics.rateLimitsHit;
		}
		return;
	}

	const data: Prisma.MetricUpdateManyMutationInput = {};
	if (metrics.profilesVisited !== undefined)
		data.profilesVisited = metrics.profilesVisited;
	if (metrics.creatorsFound !== undefined)
		data.creatorsFound = metrics.creatorsFound;
	if (metrics.dmsSent !== undefined) data.dmsSent = metrics.dmsSent;
	if (metrics.followsCompleted !== undefined)
		data.followsCompleted = metrics.followsCompleted;
	if (metrics.avgBioScore !== undefined)
		data.avgBioScore = new Prisma.Decimal(metrics.avgBioScore);
	if (metrics.avgConfidence !== undefined)
		data.avgConfidence = new Prisma.Decimal(metrics.avgConfidence);
	if (metrics.visionApiCost !== undefined)
		data.visionApiCost = new Prisma.Decimal(metrics.visionApiCost);
	if (metrics.avgProcessingTime !== undefined)
		data.avgProcessingTimeSeconds = new Prisma.Decimal(
			metrics.avgProcessingTime,
		);
	if (metrics.errorsEncountered !== undefined)
		data.errorsEncountered = metrics.errorsEncountered;
	if (metrics.rateLimitsHit !== undefined)
		data.rateLimitsHit = metrics.rateLimitsHit;

	await getPrisma().metric.updateMany({ where: { sessionId }, data });
}

export async function getDailyMetrics(
	date?: string,
): Promise<DailyMetrics | null> {
	await initDb();
	const yyyyMmDd = date || new Date().toISOString().split("T")[0];

	if (getMode() === "memory") {
		const rows = [...getMem().metrics.values()].filter(
			(m) => m.date === yyyyMmDd,
		);
		if (rows.length === 0) return null;
		const totalSessions = new Set(rows.map((r) => r.sessionId)).size;
		const sum = <K extends keyof MetricRow>(k: K): number =>
			rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
		const avg = (k: "avgBioScore" | "avgConfidence"): number => {
			const vals = rows
				.map((r) => r[k])
				.filter((v): v is number => typeof v === "number");
			if (vals.length === 0) return 0;
			return vals.reduce((a, b) => a + b, 0) / vals.length;
		};
		return {
			date: yyyyMmDd,
			totalSessions,
			totalProfilesVisited: sum("profilesVisited"),
			totalCreatorsFound: sum("creatorsFound"),
			totalDmsSent: sum("dmsSent"),
			totalFollowsCompleted: sum("followsCompleted"),
			avgBioScore: avg("avgBioScore"),
			avgConfidence: avg("avgConfidence"),
			totalVisionApiCost: rows.reduce(
				(acc, r) =>
					acc + (typeof r.visionApiCost === "number" ? r.visionApiCost : 0),
				0,
			),
			totalErrors: sum("errorsEncountered"),
			totalRateLimits: sum("rateLimitsHit"),
		};
	}

	// Prisma mode – use raw groupBy aggregation by date.
	const targetDate = new Date(yyyyMmDd);
	const rows = await getPrisma().metric.groupBy({
		by: ["date"],
		where: { date: targetDate },
		_sum: {
			profilesVisited: true,
			creatorsFound: true,
			dmsSent: true,
			followsCompleted: true,
			visionApiCost: true,
			errorsEncountered: true,
			rateLimitsHit: true,
		},
		_avg: {
			avgBioScore: true,
			avgConfidence: true,
		},
		_count: { _all: true },
	});

	const row = rows[0];
	if (!row) return null;

	return {
		date: yyyyMmDd,
		totalSessions: row._count._all ?? 0,
		totalProfilesVisited: row._sum.profilesVisited ?? 0,
		totalCreatorsFound: row._sum.creatorsFound ?? 0,
		totalDmsSent: row._sum.dmsSent ?? 0,
		totalFollowsCompleted: row._sum.followsCompleted ?? 0,
		avgBioScore: Number(row._avg.avgBioScore ?? 0),
		avgConfidence: Number(row._avg.avgConfidence ?? 0),
		totalVisionApiCost: Number(row._sum.visionApiCost ?? 0),
		totalErrors: row._sum.errorsEncountered ?? 0,
		totalRateLimits: row._sum.rateLimitsHit ?? 0,
	};
}

export async function recordProfileMetrics(
	username: string,
	metrics: {
		processingTimeSeconds?: number;
		discoverySource?: string;
		discoveryDepth?: number;
		sessionId?: string;
		contentCategories?: string[];
		visionApiCalls?: number;
		sourceProfile?: string;
	},
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const p = db.profiles.get(u) ?? defaultProfileRow(u);
		if (metrics.processingTimeSeconds !== undefined)
			p.processingTimeSeconds = metrics.processingTimeSeconds;
		if (metrics.discoverySource !== undefined)
			p.discoverySource = metrics.discoverySource;
		if (metrics.discoveryDepth !== undefined)
			p.discoveryDepth = metrics.discoveryDepth;
		if (metrics.sessionId !== undefined) p.sessionId = metrics.sessionId;
		if (metrics.contentCategories !== undefined)
			p.contentCategories = metrics.contentCategories;
		if (metrics.visionApiCalls !== undefined)
			p.visionApiCalls = metrics.visionApiCalls;
		if (metrics.sourceProfile !== undefined)
			p.sourceProfile = metrics.sourceProfile;
		db.profiles.set(u, p);
		return;
	}

	const data: Prisma.ProfileUpdateInput = {};
	if (metrics.processingTimeSeconds !== undefined)
		data.processingTimeSeconds = metrics.processingTimeSeconds;
	if (metrics.discoverySource !== undefined)
		data.discoverySource = metrics.discoverySource;
	if (metrics.discoveryDepth !== undefined)
		data.discoveryDepth = metrics.discoveryDepth;
	if (metrics.sessionId !== undefined) data.sessionId = metrics.sessionId;
	if (metrics.contentCategories !== undefined)
		data.contentCategories = metrics.contentCategories;
	if (metrics.visionApiCalls !== undefined)
		data.visionApiCalls = metrics.visionApiCalls;
	if (metrics.sourceProfile !== undefined)
		data.sourceProfile = metrics.sourceProfile;

	if (Object.keys(data).length === 0) return;
	await getPrisma().profile.update({ where: { username: u }, data });
}

export async function recordError(
	username: string,
	errorType: string,
	errorMessage?: string,
): Promise<void> {
	await initDb();
	const u = username.toLowerCase().trim();

	if (getMode() === "memory") {
		const db = getMem();
		const p = db.profiles.get(u) ?? defaultProfileRow(u);
		p.errorsEncountered.push({
			type: errorType,
			message: errorMessage || "",
			timestamp: new Date().toISOString(),
		});
		p.lastErrorAt = new Date();
		db.profiles.set(u, p);
		return;
	}

	await getPrisma().$transaction(async (tx) => {
		const current = await tx.profile.findUnique({
			where: { username: u },
			select: { errorsEncountered: true },
		});

		const existing: Prisma.JsonArray = Array.isArray(current?.errorsEncountered)
			? (current?.errorsEncountered as Prisma.JsonArray)
			: [];

		const entry: Prisma.JsonObject = {
			type: errorType,
			message: errorMessage || "",
			timestamp: new Date().toISOString(),
		};

		existing.push(entry);

		await tx.profile.update({
			where: { username: u },
			data: {
				errorsEncountered: existing,
				lastErrorAt: new Date(),
			},
		});
	});
}
