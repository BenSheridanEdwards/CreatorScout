/**
 * Profile Manager
 *
 * Manages Instagram profiles for multi-account automation.
 * Handles profile rotation, limit tracking, and daily counter resets.
 */

import {
	BURNER_PROFILE_DMS_PER_DAY_MAX,
	BURNER_PROFILE_DMS_PER_DAY_START,
	BURNER_PROFILE_DMS_RAMP_UP,
	NEW_BURNER_LIMIT_MULTIPLIER,
} from "../config/config.ts";
import { getPrismaClient } from "../database/database.ts";
import { createLogger } from "../logger/logger.ts";
import {
	BURNER_PROFILE_DEFAULTS,
	calculateProfileAge,
	hasReachedLimit,
	MAIN_PROFILE_DEFAULTS,
	type ProfileConfig,
	type ProfileLimits,
	type ProfileType,
} from "./profileConfig.ts";

const logger = createLogger();

// In-memory cache for active profiles
const profileCache = new Map<string, ProfileConfig>();

/**
 * Convert database record to ProfileConfig
 */
function dbToProfileConfig(record: {
	id: string;
	username: string;
	password: string;
	type: string;
	adsPowerProfileId: string;
	proxyConfig: unknown;
	createdAt: Date;
	archivedAt: Date | null;
	followsToday: number;
	dmsToday: number;
	discoveriesToday: number;
	lastResetAt: Date;
	maxFollowsPerDay: number;
	maxDmsPerDay: number;
	maxDiscoveriesPerDay: number;
}): ProfileConfig {
	const age = calculateProfileAge(record.createdAt);

	return {
		id: record.id,
		username: record.username,
		password: record.password,
		type: record.type as ProfileType,
		adsPowerProfileId: record.adsPowerProfileId,
		proxyConfig: record.proxyConfig as ProfileConfig["proxyConfig"],
		limits: {
			followsPerDay: record.maxFollowsPerDay,
			dmsPerDay: record.maxDmsPerDay,
			discoveriesPerDay: record.maxDiscoveriesPerDay,
		},
		createdAt: record.createdAt,
		archivedAt: record.archivedAt || undefined,
		age,
		counters: {
			followsToday: record.followsToday,
			dmsToday: record.dmsToday,
			discoveriesToday: record.discoveriesToday,
			lastResetAt: record.lastResetAt,
		},
		sessions: {
			sessionsToday: 0,
			totalSessionTimeToday: 0,
		},
	};
}

/**
 * Get all active (non-archived) profiles
 */
export async function getActiveProfiles(): Promise<ProfileConfig[]> {
	try {
		const prisma = getPrismaClient();
		const records = await prisma.instagramProfile.findMany({
			where: {
				archivedAt: null,
			},
			orderBy: {
				createdAt: "asc",
			},
		});

		const profiles = records.map(dbToProfileConfig);

		// Update cache
		for (const profile of profiles) {
			profileCache.set(profile.id, profile);
		}

		logger.info("PROFILES", `Loaded ${profiles.length} active profiles`);
		return profiles;
	} catch {
		// If table doesn't exist yet, return empty array
		logger.warn("PROFILES", "Could not load profiles from database");
		return [];
	}
}

/**
 * Get a profile by ID
 */
export async function getProfileById(
	profileId: string,
): Promise<ProfileConfig | null> {
	// Check cache first
	const cached = profileCache.get(profileId);
	if (cached) {
		return cached;
	}

	try {
		const prisma = getPrismaClient();
		const record = await prisma.instagramProfile.findUnique({
			where: { id: profileId },
		});

		if (!record) {
			return null;
		}

		const profile = dbToProfileConfig(record);
		profileCache.set(profileId, profile);
		return profile;
	} catch {
		return null;
	}
}

/**
 * Get next available profile for an action
 *
 * Prioritizes profiles with remaining capacity for the action type.
 * Returns null if no profiles are available.
 */
export async function getNextAvailableProfile(
	action: "follow" | "dm" | "discover",
): Promise<ProfileConfig | null> {
	const profiles = await getActiveProfiles();

	// Filter to profiles that haven't reached their limit
	const available = profiles.filter((p) => !hasReachedLimit(p, action));

	if (available.length === 0) {
		logger.warn("PROFILES", `No profiles available for ${action} action`);
		return null;
	}

	// Prioritize burners for outbound actions, mains for discovery
	if (action === "dm" || action === "follow") {
		// Prefer burners for outbound
		const burners = available.filter((p) => p.type === "burner");
		if (burners.length > 0) {
			// Return the one with most remaining capacity
			return burners.reduce((best, curr) => {
				const bestRemaining = best.limits.dmsPerDay - best.counters.dmsToday;
				const currRemaining = curr.limits.dmsPerDay - curr.counters.dmsToday;
				return currRemaining > bestRemaining ? curr : best;
			});
		}
	}

	// Return first available (or main for discovery)
	return available[0];
}

/**
 * Increment action counter for a profile
 */
export async function incrementProfileAction(
	profileId: string,
	action: "follow" | "dm" | "discover",
): Promise<void> {
	const updateData: {
		followsToday?: { increment: number };
		dmsToday?: { increment: number };
		discoveriesToday?: { increment: number };
	} = {};

	switch (action) {
		case "follow":
			updateData.followsToday = { increment: 1 };
			break;
		case "dm":
			updateData.dmsToday = { increment: 1 };
			break;
		case "discover":
			updateData.discoveriesToday = { increment: 1 };
			break;
	}

	try {
		const prisma = getPrismaClient();
		await prisma.instagramProfile.update({
			where: { id: profileId },
			data: updateData,
		});

		// Update cache
		const cached = profileCache.get(profileId);
		if (cached) {
			switch (action) {
				case "follow":
					cached.counters.followsToday++;
					break;
				case "dm":
					cached.counters.dmsToday++;
					break;
				case "discover":
					cached.counters.discoveriesToday++;
					break;
			}
		}

		logger.info("PROFILES", `Incremented ${action} for profile ${profileId}`);
	} catch {
		logger.error("PROFILES", `Failed to increment ${action} for ${profileId}`);
	}
}

/**
 * Archive a burner profile
 */
export async function archiveBurnerProfile(profileId: string): Promise<void> {
	try {
		const prisma = getPrismaClient();
		await prisma.instagramProfile.update({
			where: { id: profileId },
			data: { archivedAt: new Date() },
		});

		// Remove from cache
		profileCache.delete(profileId);

		logger.info("PROFILES", `Archived profile ${profileId}`);
	} catch {
		logger.error("PROFILES", `Failed to archive profile ${profileId}`);
	}
}

/**
 * Reset daily counters for all profiles
 * Should be called at midnight
 */
export async function resetDailyCounters(): Promise<void> {
	try {
		const prisma = getPrismaClient();
		await prisma.instagramProfile.updateMany({
			data: {
				followsToday: 0,
				dmsToday: 0,
				discoveriesToday: 0,
				lastResetAt: new Date(),
			},
		});

		// Clear cache to force reload
		profileCache.clear();

		logger.info("PROFILES", "Reset daily counters for all profiles");
	} catch {
		logger.error("PROFILES", "Failed to reset daily counters");
	}
}

/**
 * Check if daily counters need reset (past midnight)
 */
export function needsCounterReset(profile: ProfileConfig): boolean {
	const now = new Date();
	const lastReset = profile.counters.lastResetAt;

	// Check if it's a new day
	return (
		now.getDate() !== lastReset.getDate() ||
		now.getMonth() !== lastReset.getMonth() ||
		now.getFullYear() !== lastReset.getFullYear()
	);
}

/**
 * Calculate ramped-up DM limit for a burner profile
 * Increases by +5 every 3 days
 */
export function calculateRampedDmLimit(profile: ProfileConfig): number {
	if (profile.type !== "burner") {
		return profile.limits.dmsPerDay;
	}

	const age = profile.age;

	// New burners (first 7 days) get 50% limit
	if (age < 7) {
		return Math.floor(
			BURNER_PROFILE_DMS_PER_DAY_START * NEW_BURNER_LIMIT_MULTIPLIER,
		);
	}

	// Calculate ramp-up: start at 30, +5 every 3 days
	const daysAfterRampUp = Math.max(0, age - 7);
	const rampUpPeriods = Math.floor(daysAfterRampUp / 3);
	const rampedLimit =
		BURNER_PROFILE_DMS_PER_DAY_START +
		rampUpPeriods * BURNER_PROFILE_DMS_RAMP_UP;

	return Math.min(rampedLimit, BURNER_PROFILE_DMS_PER_DAY_MAX);
}

/**
 * Update profile limits based on age and ramp-up
 */
export async function updateProfileLimits(profileId: string): Promise<void> {
	const profile = await getProfileById(profileId);
	if (!profile) return;

	const newDmLimit = calculateRampedDmLimit(profile);

	if (newDmLimit !== profile.limits.dmsPerDay) {
		try {
			const prisma = getPrismaClient();
			await prisma.instagramProfile.update({
				where: { id: profileId },
				data: { maxDmsPerDay: newDmLimit },
			});

			// Update cache
			const cached = profileCache.get(profileId);
			if (cached) {
				cached.limits.dmsPerDay = newDmLimit;
			}

			logger.info(
				"PROFILES",
				`Updated DM limit for ${profileId}: ${newDmLimit}`,
			);
		} catch {
			logger.error("PROFILES", `Failed to update limits for ${profileId}`);
		}
	}
}

/**
 * Get profile statistics
 */
export async function getProfileStats(): Promise<{
	total: number;
	active: number;
	archived: number;
	mains: number;
	burners: number;
}> {
	try {
		const prisma = getPrismaClient();
		const all = await prisma.instagramProfile.findMany();
		const active = all.filter(
			(p: { archivedAt: Date | null }) => !p.archivedAt,
		);
		const archived = all.filter(
			(p: { archivedAt: Date | null }) => p.archivedAt,
		);
		const mains = active.filter((p: { type: string }) => p.type === "main");
		const burners = active.filter((p: { type: string }) => p.type === "burner");

		return {
			total: all.length,
			active: active.length,
			archived: archived.length,
			mains: mains.length,
			burners: burners.length,
		};
	} catch {
		return { total: 0, active: 0, archived: 0, mains: 0, burners: 0 };
	}
}

/**
 * Create a new profile in the database
 */
export async function createProfile(
	username: string,
	password: string,
	type: ProfileType,
	adsPowerProfileId: string,
	customLimits?: Partial<ProfileLimits>,
): Promise<ProfileConfig> {
	const defaults =
		type === "main" ? MAIN_PROFILE_DEFAULTS : BURNER_PROFILE_DEFAULTS;
	const limits = { ...defaults, ...customLimits };

	const prisma = getPrismaClient();
	const record = await prisma.instagramProfile.create({
		data: {
			username,
			password,
			type,
			adsPowerProfileId,
			maxFollowsPerDay: limits.followsPerDay,
			maxDmsPerDay: limits.dmsPerDay,
			maxDiscoveriesPerDay: limits.discoveriesPerDay,
		},
	});

	const profile = dbToProfileConfig(record);
	profileCache.set(profile.id, profile);

	logger.info("PROFILES", `Created new ${type} profile: ${username}`);
	return profile;
}
