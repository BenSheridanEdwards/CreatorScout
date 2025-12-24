/**
 * Profile Configuration Types
 *
 * Defines the structure for Instagram profile management.
 * Supports main accounts (high-trust) and burner accounts (heavy outbound).
 */

export type ProfileType = "main" | "burner";

export interface ProfileLimits {
	followsPerDay: number;
	dmsPerDay: number;
	discoveriesPerDay: number;
}

export interface ProxyConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	stickySession: string;
	timezone?: string;
	geolocation?: string;
}

export interface ProfileConfig {
	/**
	 * Unique identifier for the profile
	 */
	id: string;

	/**
	 * Instagram username
	 */
	username: string;

	/**
	 * Instagram password (encrypted in production)
	 */
	password: string;

	/**
	 * Profile type: main (high-trust) or burner (heavy outbound)
	 */
	type: ProfileType;

	/**
	 * GoLogin profile token for authentication
	 */
	goLoginToken: string;

	/**
	 * Smartproxy configuration (optional - can use GoLogin's proxy)
	 */
	proxyConfig?: ProxyConfig;

	/**
	 * Action limits for this profile
	 */
	limits: ProfileLimits;

	/**
	 * When the profile was created
	 */
	createdAt: Date;

	/**
	 * When the profile was archived (burners only)
	 */
	archivedAt?: Date;

	/**
	 * Profile age in days
	 */
	age: number;

	/**
	 * Daily action counters (reset at midnight)
	 */
	counters: {
		followsToday: number;
		dmsToday: number;
		discoveriesToday: number;
		lastResetAt: Date;
	};

	/**
	 * Session tracking
	 */
	sessions: {
		lastSessionAt?: Date;
		sessionsToday: number;
		totalSessionTimeToday: number; // minutes
	};
}

/**
 * Default limits for main accounts (high-trust, light use)
 */
export const MAIN_PROFILE_DEFAULTS: ProfileLimits = {
	followsPerDay: 2, // ~10 per week
	dmsPerDay: 15,
	discoveriesPerDay: 100,
};

/**
 * Default limits for aged burner accounts
 */
export const BURNER_PROFILE_DEFAULTS: ProfileLimits = {
	followsPerDay: 100, // 80-150 range
	dmsPerDay: 50, // Start at 30, ramp up
	discoveriesPerDay: 2000,
};

/**
 * Create a new profile configuration
 */
export function createProfileConfig(
	id: string,
	username: string,
	password: string,
	type: ProfileType,
	goLoginToken: string,
	customLimits?: Partial<ProfileLimits>,
): ProfileConfig {
	const defaultLimits =
		type === "main" ? MAIN_PROFILE_DEFAULTS : BURNER_PROFILE_DEFAULTS;

	return {
		id,
		username,
		password,
		type,
		goLoginToken,
		limits: { ...defaultLimits, ...customLimits },
		createdAt: new Date(),
		age: 0,
		counters: {
			followsToday: 0,
			dmsToday: 0,
			discoveriesToday: 0,
			lastResetAt: new Date(),
		},
		sessions: {
			sessionsToday: 0,
			totalSessionTimeToday: 0,
		},
	};
}

/**
 * Calculate profile age in days
 */
export function calculateProfileAge(createdAt: Date): number {
	const now = new Date();
	const diffTime = Math.abs(now.getTime() - createdAt.getTime());
	return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if profile is in new burner period (first 7 days)
 */
export function isNewBurner(profile: ProfileConfig): boolean {
	if (profile.type !== "burner") return false;
	return profile.age < 7;
}

/**
 * Check if profile is archived
 */
export function isArchived(profile: ProfileConfig): boolean {
	return profile.archivedAt !== undefined;
}

/**
 * Check if profile has reached its daily limit for an action
 */
export function hasReachedLimit(
	profile: ProfileConfig,
	action: "follow" | "dm" | "discover",
): boolean {
	switch (action) {
		case "follow":
			return profile.counters.followsToday >= profile.limits.followsPerDay;
		case "dm":
			return profile.counters.dmsToday >= profile.limits.dmsPerDay;
		case "discover":
			return (
				profile.counters.discoveriesToday >= profile.limits.discoveriesPerDay
			);
		default:
			return false;
	}
}

/**
 * Get remaining actions for a profile
 */
export function getRemainingActions(
	profile: ProfileConfig,
	action: "follow" | "dm" | "discover",
): number {
	switch (action) {
		case "follow":
			return Math.max(
				0,
				profile.limits.followsPerDay - profile.counters.followsToday,
			);
		case "dm":
			return Math.max(0, profile.limits.dmsPerDay - profile.counters.dmsToday);
		case "discover":
			return Math.max(
				0,
				profile.limits.discoveriesPerDay - profile.counters.discoveriesToday,
			);
		default:
			return 0;
	}
}
