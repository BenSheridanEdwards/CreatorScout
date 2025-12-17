/**
 * Database operations using PostgreSQL via Prisma.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

let prismaInstance: PrismaClient | null = null;
let pool: Pool | null = null;

export interface QueryResult<T> {
	rows: T[];
}

function getConnectionString(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(
			"DATABASE_URL is not set. Set DATABASE_URL to a Postgres connection string.",
		);
	}
	return url;
}

function getPrisma(): PrismaClient {
	if (!prismaInstance) {
		pool = new Pool({
			connectionString: getConnectionString(),
			ssl:
				process.env.NODE_ENV === "production"
					? { rejectUnauthorized: false }
					: undefined,
		});
		const adapter = new PrismaPg(pool);
		prismaInstance = new PrismaClient({ adapter });
	}
	return prismaInstance;
}

/**
 * Execute a raw SQL query and return results in a Postgres-like shape: { rows }.
 * Note: Prefer using the typed Prisma methods when possible.
 */
export async function query<T = unknown>(
	sql: string,
	params: unknown[] = [],
): Promise<QueryResult<T>> {
	const prisma = getPrisma();
	const verb = sql.trim().split(/\s+/)[0]?.toUpperCase();

	if (verb === "SELECT" || verb === "WITH") {
		const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...params);
		return { rows };
	}

	await prisma.$executeRawUnsafe(sql, ...params);
	return { rows: [] as T[] };
}

export async function initDb(): Promise<void> {
	// With Prisma, the schema is managed via migrations.
	// This function ensures the connection is established.
	const prisma = getPrisma();
	await prisma.$connect();
}

// === Queue Operations ===

export async function queueAdd(
	username: string,
	priority: number = 10,
	source: string = "seed",
): Promise<void> {
	const prisma = getPrisma();
	const normalizedUsername = username.toLowerCase().trim();

	await prisma.queueItem.upsert({
		where: { username: normalizedUsername },
		create: {
			username: normalizedUsername,
			priority,
			source,
			addedAt: new Date(),
		},
		update: {
			// Don't update if already exists (OR IGNORE behavior)
		},
	});
}

export async function queueNext(): Promise<string | null> {
	const prisma = getPrisma();

	const item = await prisma.queueItem.findFirst({
		orderBy: [{ priority: "desc" }, { addedAt: "asc" }],
	});

	if (item) {
		await prisma.queueItem.delete({
			where: { username: item.username },
		});
		return item.username;
	}

	return null;
}

export async function queueCount(): Promise<number> {
	const prisma = getPrisma();
	return prisma.queueItem.count();
}

export async function clearQueue(): Promise<void> {
	const prisma = getPrisma();
	await prisma.queueItem.deleteMany({});
}

// === Profile Operations ===

export async function wasVisited(username: string): Promise<boolean> {
	const prisma = getPrisma();
	const profile = await prisma.profile.findUnique({
		where: { username: username.toLowerCase().trim() },
		select: { username: true },
	});
	return profile !== null;
}

export async function markVisited(
	username: string,
	displayName?: string | null,
	bio?: string | null,
	bioScore: number = 0,
	linkUrl?: string | null,
): Promise<void> {
	const prisma = getPrisma();
	const normalizedUsername = username.toLowerCase().trim();
	const now = new Date();

	await prisma.profile.upsert({
		where: { username: normalizedUsername },
		create: {
			username: normalizedUsername,
			displayName: displayName || null,
			bioText: bio || null,
			bioScore,
			linkUrl: linkUrl || null,
			visitedAt: now,
			lastSeen: now,
		},
		update: {
			displayName: displayName || undefined,
			bioText: bio || undefined,
			bioScore,
			linkUrl: linkUrl || undefined,
			lastSeen: now,
		},
	});
}

export async function markAsCreator(
	username: string,
	confidence: number = 0,
	proofPath?: string | null,
): Promise<void> {
	const prisma = getPrisma();

	await prisma.profile.update({
		where: { username: username.toLowerCase().trim() },
		data: {
			isCreator: true,
			confidence,
			proofPath: proofPath || undefined,
			lastSeen: new Date(),
		},
	});
}

export async function wasDmSent(username: string): Promise<boolean> {
	const prisma = getPrisma();
	const profile = await prisma.profile.findUnique({
		where: { username: username.toLowerCase().trim() },
		select: { dmSent: true },
	});
	return profile?.dmSent ?? false;
}

export async function markDmSent(
	username: string,
	proofPath?: string | null,
): Promise<void> {
	const prisma = getPrisma();
	const u = username.toLowerCase().trim();

	// Use upsert to create profile if it doesn't exist
	await prisma.profile.upsert({
		where: { username: u },
		create: {
			username: u,
			dmSent: true,
			dmSentAt: new Date(),
			proofPath: proofPath || undefined,
			visitedAt: new Date(),
			lastSeen: new Date(),
		},
		update: {
			dmSent: true,
			dmSentAt: new Date(),
			proofPath: proofPath || undefined,
			lastSeen: new Date(),
		},
	});
}

export async function wasFollowed(username: string): Promise<boolean> {
	const prisma = getPrisma();
	const profile = await prisma.profile.findUnique({
		where: { username: username.toLowerCase().trim() },
		select: { followed: true },
	});
	return profile?.followed ?? false;
}

export async function markFollowed(username: string): Promise<void> {
	const prisma = getPrisma();

	await prisma.profile.update({
		where: { username: username.toLowerCase().trim() },
		data: { followed: true },
	});
}

// === Following Scrape Tracking ===

export async function getScrollIndex(username: string): Promise<number> {
	const prisma = getPrisma();
	const record = await prisma.followingScraped.findUnique({
		where: { username: username.toLowerCase().trim() },
		select: { scrollIndex: true },
	});
	return record?.scrollIndex ?? 0;
}

export async function updateScrollIndex(
	username: string,
	index: number,
): Promise<void> {
	const prisma = getPrisma();
	const normalizedUsername = username.toLowerCase().trim();

	await prisma.followingScraped.upsert({
		where: { username: normalizedUsername },
		create: {
			username: normalizedUsername,
			scrollIndex: index,
			scrapedAt: new Date(),
		},
		update: {
			scrollIndex: index,
			scrapedAt: new Date(),
		},
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
	avgBioScore?: number;
	avgConfidence?: number;
	avgProcessingTime?: number;
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
	const prisma = getPrisma();

	const [totalVisited, confirmedCreators, dmsSent, queueSize] =
		await Promise.all([
			prisma.profile.count(),
			prisma.profile.count({ where: { isCreator: true } }),
			prisma.profile.count({ where: { dmSent: true } }),
			prisma.queueItem.count(),
		]);

	return {
		total_visited: totalVisited,
		confirmed_creators: confirmedCreators,
		dms_sent: dmsSent,
		queue_size: queueSize,
	};
}

// === Metrics Functions ===

export async function startSessionMetrics(sessionId: string): Promise<void> {
	const prisma = getPrisma();

	await prisma.metric.create({
		data: {
			date: new Date(),
			sessionId,
			createdAt: new Date(),
		},
	});
}

export async function updateSessionMetrics(
	sessionId: string,
	metrics: Partial<SessionMetrics>,
): Promise<void> {
	const prisma = getPrisma();

	const data: Prisma.MetricUpdateInput = {};

	if (metrics.profilesVisited !== undefined) {
		data.profilesVisited = metrics.profilesVisited;
	}
	if (metrics.creatorsFound !== undefined) {
		data.creatorsFound = metrics.creatorsFound;
	}
	if (metrics.dmsSent !== undefined) {
		data.dmsSent = metrics.dmsSent;
	}
	if (metrics.followsCompleted !== undefined) {
		data.followsCompleted = metrics.followsCompleted;
	}
	if (metrics.avgBioScore !== undefined) {
		data.avgBioScore = new Prisma.Decimal(metrics.avgBioScore);
	}
	if (metrics.avgConfidence !== undefined) {
		data.avgConfidence = new Prisma.Decimal(metrics.avgConfidence);
	}
	if (metrics.visionApiCost !== undefined) {
		data.visionApiCost = new Prisma.Decimal(metrics.visionApiCost);
	}
	if (metrics.avgProcessingTime !== undefined) {
		data.avgProcessingTimeSeconds = new Prisma.Decimal(
			metrics.avgProcessingTime,
		);
	}
	if (metrics.errorsEncountered !== undefined) {
		data.errorsEncountered = metrics.errorsEncountered;
	}
	if (metrics.rateLimitsHit !== undefined) {
		data.rateLimitsHit = metrics.rateLimitsHit;
	}

	if (Object.keys(data).length > 0) {
		await prisma.metric.updateMany({
			where: { sessionId },
			data,
		});
	}
}

export async function getDailyMetrics(
	date?: string,
): Promise<DailyMetrics | null> {
	const prisma = getPrisma();
	const targetDate = date || new Date().toISOString().split("T")[0];

	// Parse the date to get start and end of day
	const startOfDay = new Date(targetDate);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(targetDate);
	endOfDay.setHours(23, 59, 59, 999);

	const metrics = await prisma.metric.findMany({
		where: {
			date: {
				gte: startOfDay,
				lte: endOfDay,
			},
		},
	});

	if (metrics.length === 0) return null;

	const totalSessions = new Set(metrics.map((m) => m.sessionId)).size;
	const totalProfilesVisited = metrics.reduce(
		(sum, m) => sum + m.profilesVisited,
		0,
	);
	const totalCreatorsFound = metrics.reduce(
		(sum, m) => sum + m.creatorsFound,
		0,
	);
	const totalDmsSent = metrics.reduce((sum, m) => sum + m.dmsSent, 0);
	const totalFollowsCompleted = metrics.reduce(
		(sum, m) => sum + m.followsCompleted,
		0,
	);
	const totalErrors = metrics.reduce((sum, m) => sum + m.errorsEncountered, 0);
	const totalRateLimits = metrics.reduce((sum, m) => sum + m.rateLimitsHit, 0);

	const bioScores = metrics
		.filter((m) => m.avgBioScore !== null)
		.map((m) => Number(m.avgBioScore));
	const confidences = metrics
		.filter((m) => m.avgConfidence !== null)
		.map((m) => Number(m.avgConfidence));
	const visionCosts = metrics
		.filter((m) => m.visionApiCost !== null)
		.map((m) => Number(m.visionApiCost));

	return {
		date: targetDate,
		totalSessions,
		totalProfilesVisited,
		totalCreatorsFound,
		totalDmsSent,
		totalFollowsCompleted,
		avgBioScore:
			bioScores.length > 0
				? bioScores.reduce((a, b) => a + b, 0) / bioScores.length
				: 0,
		avgConfidence:
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0,
		totalVisionApiCost: visionCosts.reduce((a, b) => a + b, 0),
		totalErrors,
		totalRateLimits,
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
	const prisma = getPrisma();

	const data: Prisma.ProfileUpdateInput = {};

	if (metrics.processingTimeSeconds !== undefined) {
		data.processingTimeSeconds = metrics.processingTimeSeconds;
	}
	if (metrics.discoverySource !== undefined) {
		data.discoverySource = metrics.discoverySource;
	}
	if (metrics.discoveryDepth !== undefined) {
		data.discoveryDepth = metrics.discoveryDepth;
	}
	if (metrics.sessionId !== undefined) {
		data.sessionId = metrics.sessionId;
	}
	if (metrics.contentCategories !== undefined) {
		data.contentCategories = metrics.contentCategories;
	}
	if (metrics.visionApiCalls !== undefined) {
		data.visionApiCalls = metrics.visionApiCalls;
	}
	if (metrics.sourceProfile !== undefined) {
		data.sourceProfile = metrics.sourceProfile;
	}

	if (Object.keys(data).length > 0) {
		await prisma.profile.update({
			where: { username: username.toLowerCase().trim() },
			data,
		});
	}
}

export async function recordError(
	username: string,
	errorType: string,
	errorMessage?: string,
): Promise<void> {
	const prisma = getPrisma();
	const normalizedUsername = username.toLowerCase().trim();

	const errorData = {
		type: errorType,
		message: errorMessage || "",
		timestamp: new Date().toISOString(),
	};

	// Get existing errors
	const profile = await prisma.profile.findUnique({
		where: { username: normalizedUsername },
		select: { errorsEncountered: true },
	});

	let errors: unknown[] = [];
	if (profile?.errorsEncountered) {
		if (Array.isArray(profile.errorsEncountered)) {
			errors = profile.errorsEncountered;
		}
	}

	errors.push(errorData);

	await prisma.profile.update({
		where: { username: normalizedUsername },
		data: {
			errorsEncountered: errors as Prisma.InputJsonValue,
			lastErrorAt: new Date(),
		},
	});
}

/**
 * Close the database connection (mainly for tests and CLI scripts).
 */
export async function closeDb(): Promise<void> {
	if (prismaInstance) {
		await prismaInstance.$disconnect();
		prismaInstance = null;
	}
	if (pool) {
		await pool.end();
		pool = null;
	}
}
