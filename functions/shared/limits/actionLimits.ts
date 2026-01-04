/**
 * Action Limits Module
 *
 * Manages daily limits for follows, DMs, and discovery actions.
 * Supports different limits for main vs burner accounts with ramp-up.
 */

import {
	BURNER_PROFILE_DISCOVERIES_PER_DAY,
	BURNER_PROFILE_DMS_PER_DAY_MAX,
	BURNER_PROFILE_DMS_PER_DAY_START,
	BURNER_PROFILE_DMS_RAMP_UP,
	BURNER_PROFILE_FOLLOWS_PER_DAY_MAX,
	BURNER_PROFILE_FOLLOWS_PER_DAY_MIN,
	MAIN_PROFILE_DISCOVERIES_PER_DAY,
	MAIN_PROFILE_DMS_PER_DAY,
	MAIN_PROFILE_FOLLOWS_PER_WEEK,
	NEW_BURNER_LIMIT_MULTIPLIER,
	NEW_BURNER_PERIOD_DAYS,
} from "../config/config.ts";
import { createLogger } from "../logger/logger.ts";
import {
	calculateProfileAge,
	getRemainingActions,
	hasReachedLimit,
	type ProfileConfig,
	type ProfileType,
} from "../profiles/profileConfig.ts";

const logger = createLogger();

export interface ProfileLimits {
	followsPerDay: number;
	dmsPerDay: number;
	discoveriesPerDay: number;
}

export interface LimitStatus {
	canFollow: boolean;
	canDm: boolean;
	canDiscover: boolean;
	remainingFollows: number;
	remainingDms: number;
	remainingDiscoveries: number;
	message: string;
}

/**
 * Get default limits for a profile type
 */
export function getDefaultLimits(
	type: ProfileType,
	profileAge: number = 0,
): ProfileLimits {
	if (type === "main") {
		return {
			followsPerDay: Math.ceil(MAIN_PROFILE_FOLLOWS_PER_WEEK / 7), // ~2/day
			dmsPerDay: MAIN_PROFILE_DMS_PER_DAY,
			discoveriesPerDay: MAIN_PROFILE_DISCOVERIES_PER_DAY,
		};
	}

	// Burner limits depend on age
	return getBurnerLimits(profileAge);
}

/**
 * Calculate burner profile limits based on age
 *
 * - First 7 days: 50% of normal limits
 * - After 7 days: Ramp up DMs by +5 every 3 days
 * - Follows: Random between min-max (80-150)
 */
export function getBurnerLimits(profileAge: number): ProfileLimits {
	const isNewBurner = profileAge < NEW_BURNER_PERIOD_DAYS;

	if (isNewBurner) {
		// New burner (first 7 days) - 50% limits
		return {
			followsPerDay: Math.floor(
				BURNER_PROFILE_FOLLOWS_PER_DAY_MIN * NEW_BURNER_LIMIT_MULTIPLIER,
			),
			dmsPerDay: Math.floor(
				BURNER_PROFILE_DMS_PER_DAY_START * NEW_BURNER_LIMIT_MULTIPLIER,
			),
			discoveriesPerDay: Math.floor(
				BURNER_PROFILE_DISCOVERIES_PER_DAY * NEW_BURNER_LIMIT_MULTIPLIER,
			),
		};
	}

	// Aged burner
	const daysAfterNewPeriod = profileAge - NEW_BURNER_PERIOD_DAYS;
	const rampUpPeriods = Math.floor(daysAfterNewPeriod / 3);

	// Calculate ramped DM limit
	const rampedDmLimit = Math.min(
		BURNER_PROFILE_DMS_PER_DAY_START +
			rampUpPeriods * BURNER_PROFILE_DMS_RAMP_UP,
		BURNER_PROFILE_DMS_PER_DAY_MAX,
	);

	// Random follows within range
	const followsRange =
		BURNER_PROFILE_FOLLOWS_PER_DAY_MAX - BURNER_PROFILE_FOLLOWS_PER_DAY_MIN;
	const followsPerDay =
		BURNER_PROFILE_FOLLOWS_PER_DAY_MIN +
		Math.floor(Math.random() * followsRange);

	return {
		followsPerDay,
		dmsPerDay: rampedDmLimit,
		discoveriesPerDay: BURNER_PROFILE_DISCOVERIES_PER_DAY,
	};
}

/**
 * Calculate ramped-up DM limit for a profile
 * Increases by +5 every 3 days after the initial 7-day period
 */
export function calculateRampUpLimits(
	profileAge: number,
	baseLimit: number,
): number {
	if (profileAge < NEW_BURNER_PERIOD_DAYS) {
		return Math.floor(baseLimit * NEW_BURNER_LIMIT_MULTIPLIER);
	}

	const daysAfterNewPeriod = profileAge - NEW_BURNER_PERIOD_DAYS;
	const rampUpPeriods = Math.floor(daysAfterNewPeriod / 3);

	return Math.min(
		baseLimit + rampUpPeriods * BURNER_PROFILE_DMS_RAMP_UP,
		BURNER_PROFILE_DMS_PER_DAY_MAX,
	);
}

/**
 * Get current limit status for a profile
 */
export function getLimitStatus(profile: ProfileConfig): LimitStatus {
	const remainingFollows = getRemainingActions(profile, "follow");
	const remainingDms = getRemainingActions(profile, "dm");
	const remainingDiscoveries = getRemainingActions(profile, "discover");

	const canFollow = remainingFollows > 0;
	const canDm = remainingDms > 0;
	const canDiscover = remainingDiscoveries > 0;

	let message = "";
	if (!canFollow && !canDm && !canDiscover) {
		message = "All daily limits reached";
	} else if (!canDm) {
		message = "DM limit reached";
	} else if (!canFollow) {
		message = "Follow limit reached";
	}

	return {
		canFollow,
		canDm,
		canDiscover,
		remainingFollows,
		remainingDms,
		remainingDiscoveries,
		message,
	};
}

/**
 * Check if a profile can perform a specific action
 */
export function canPerformAction(
	profile: ProfileConfig,
	action: "follow" | "dm" | "discover",
): boolean {
	return !hasReachedLimit(profile, action);
}

/**
 * Get the best profile for an action from a list
 * Prioritizes profiles with most remaining capacity
 */
export function getBestProfileForAction(
	profiles: ProfileConfig[],
	action: "follow" | "dm" | "discover",
): ProfileConfig | null {
	// Filter to profiles that can perform the action
	const available = profiles.filter((p) => canPerformAction(p, action));

	if (available.length === 0) {
		return null;
	}

	// Sort by remaining capacity (descending)
	available.sort((a, b) => {
		return getRemainingActions(b, action) - getRemainingActions(a, action);
	});

	return available[0];
}

/**
 * Log limit status for a profile
 */
export function logLimitStatus(profile: ProfileConfig): void {
	const status = getLimitStatus(profile);

	logger.info(
		"LIMITS",
		`@${profile.username} (${profile.type}): ` +
			`Follows: ${status.remainingFollows}/${profile.limits.followsPerDay}, ` +
			`DMs: ${status.remainingDms}/${profile.limits.dmsPerDay}, ` +
			`Discoveries: ${status.remainingDiscoveries}/${profile.limits.discoveriesPerDay}` +
			(status.message ? ` | ${status.message}` : ""),
	);
}

/**
 * Check if any profile has remaining capacity
 */
export function hasRemainingCapacity(
	profiles: ProfileConfig[],
	action: "follow" | "dm" | "discover",
): boolean {
	return profiles.some((p) => canPerformAction(p, action));
}

/**
 * Get total remaining capacity across all profiles
 */
export function getTotalRemainingCapacity(
	profiles: ProfileConfig[],
	action: "follow" | "dm" | "discover",
): number {
	return profiles.reduce(
		(total, p) => total + getRemainingActions(p, action),
		0,
	);
}

/**
 * Summary of all profile limits
 */
export interface LimitSummary {
	totalProfiles: number;
	activeProfiles: number;
	totalFollowsRemaining: number;
	totalDmsRemaining: number;
	totalDiscoveriesRemaining: number;
	profilesWithDmCapacity: number;
	profilesWithFollowCapacity: number;
}

/**
 * Get summary of limits across all profiles
 */
export function getLimitSummary(profiles: ProfileConfig[]): LimitSummary {
	const active = profiles.filter((p) => !p.archivedAt);

	return {
		totalProfiles: profiles.length,
		activeProfiles: active.length,
		totalFollowsRemaining: getTotalRemainingCapacity(active, "follow"),
		totalDmsRemaining: getTotalRemainingCapacity(active, "dm"),
		totalDiscoveriesRemaining: getTotalRemainingCapacity(active, "discover"),
		profilesWithDmCapacity: active.filter((p) => canPerformAction(p, "dm"))
			.length,
		profilesWithFollowCapacity: active.filter((p) =>
			canPerformAction(p, "follow"),
		).length,
	};
}
