/**
 * Profile Loader - Load profiles from profiles.config.json
 *
 * Loads profile configurations including:
 * - Instagram credentials
 * - AdsPower profile IDs for browser connection
 * - Proxy settings (Decodo or Smartproxy)
 * - Daily limits
 * - Session schedules
 * - Ramp-up schedules
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

export interface ProxyConfig {
	provider?: "decodo" | "smartproxy"; // Default: decodo
	country?: string;
	city?: string;
	stickySessionMinutes?: number;
}

export interface SessionConfig {
	enabled: boolean;
	time: string; // HH:mm format
	durationMinutes: number;
	dmWeight: number; // 0.0-1.0 (proportion of daily DM goal)
}

export interface ProfileLimits {
	followsPerDay: number;
	dmsPerDay: number;
	discoveriesPerDay: number;
}

export interface RampSchedule {
	enabled?: boolean;
	day1?: number;
	day3?: number;
	day7?: number;
	day14?: number;
	day21?: number;
	day30?: number;
}

export interface ProfileConfig {
	id: string;
	username: string;
	password: string;
	type: "main" | "burner";
	/**
	 * AdsPower profile user_id for browser connection
	 * Found in AdsPower app under profile settings
	 */
	adsPowerProfileId: string;
	proxyConfig?: ProxyConfig;
	limits: ProfileLimits;
	rampSchedule?: RampSchedule;
	sessions: {
		morning: SessionConfig;
		afternoon: SessionConfig;
		evening: SessionConfig;
	};
	createdAt?: string; // ISO date when profile was created
	archivedAt?: string; // ISO date when profile was archived
}

export interface GlobalSettings {
	warmupMinutes?: number;
	engagementRatio?: number;
	sessionStaggerMinutes?: number;
	weeklyScheduleVariance?: boolean;
	dmStrategy?: "cold" | "warm" | "pitch";
	enableVisionAI?: boolean;
}

export interface ProfilesConfig {
	profiles: ProfileConfig[];
	globalSettings?: GlobalSettings;
}

let cachedConfig: ProfilesConfig | null = null;

/**
 * Load profiles configuration from file
 */
export function loadProfilesConfig(
	configPath: string = "profiles.config.json",
): ProfilesConfig {
	// Return cached config if available
	if (cachedConfig) return cachedConfig;

	const fullPath = join(process.cwd(), configPath);

	if (!existsSync(fullPath)) {
		throw new Error(
			`Profiles config not found: ${fullPath}\n` +
				"Please create profiles.config.json from profiles.config.example.json",
		);
	}

	try {
		const data = readFileSync(fullPath, "utf-8");
		const config: ProfilesConfig = JSON.parse(data);

		// Validate profiles
		if (!config.profiles || config.profiles.length === 0) {
			throw new Error("No profiles found in profiles.config.json");
		}

		// Validate each profile
		for (const profile of config.profiles) {
			validateProfile(profile);
		}

		// Cache the config
		cachedConfig = config;

		logger.info(
			"PROFILES",
			`Loaded ${config.profiles.length} profile(s) from ${configPath}`,
		);

		return config;
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in profiles.config.json: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Validate a profile configuration
 */
function validateProfile(profile: ProfileConfig): void {
	const required = ["id", "username", "password", "type"];
	for (const field of required) {
		if (!profile[field as keyof ProfileConfig]) {
			throw new Error(
				`Profile ${profile.id || "unknown"} missing field: ${field}`,
			);
		}
	}

	// Must have adsPowerProfileId
	if (!profile.adsPowerProfileId) {
		throw new Error(
			`Profile ${profile.id} must have "adsPowerProfileId" (AdsPower profile user_id)`,
		);
	}

	if (!["main", "burner"].includes(profile.type)) {
		throw new Error(`Profile ${profile.id} has invalid type: ${profile.type}`);
	}

	if (!profile.limits) {
		throw new Error(`Profile ${profile.id} missing limits configuration`);
	}

	if (!profile.sessions) {
		throw new Error(`Profile ${profile.id} missing sessions configuration`);
	}
}

/**
 * Get a profile by ID
 */
export function getProfile(profileId: string): ProfileConfig | null {
	const config = loadProfilesConfig();
	return config.profiles.find((p) => p.id === profileId) || null;
}

/**
 * Get all profiles of a specific type
 */
export function getProfilesByType(type: "main" | "burner"): ProfileConfig[] {
	const config = loadProfilesConfig();
	return config.profiles.filter((p) => p.type === type);
}

/**
 * Get all active profiles (not archived)
 */
export function getActiveProfiles(): ProfileConfig[] {
	const config = loadProfilesConfig();
	return config.profiles.filter((p) => !p.archivedAt);
}

/**
 * Get global settings
 */
export function getGlobalSettings(): GlobalSettings {
	const config = loadProfilesConfig();
	return (
		config.globalSettings || {
			warmupMinutes: 1.5,
			engagementRatio: 4,
			sessionStaggerMinutes: 5,
			weeklyScheduleVariance: true,
			dmStrategy: "cold",
			enableVisionAI: false,
		}
	);
}

/**
 * Get current DM limit for a profile based on ramp schedule
 */
export function getCurrentDMLimit(profile: ProfileConfig): number {
	if (!profile.rampSchedule || !profile.rampSchedule.enabled) {
		return profile.limits.dmsPerDay;
	}

	// Calculate days since profile creation
	if (!profile.createdAt) {
		return profile.limits.dmsPerDay;
	}

	const createdDate = new Date(profile.createdAt);
	const now = new Date();
	const daysSinceCreation = Math.floor(
		(now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
	);

	// Get ramp schedule limit based on days
	const schedule = profile.rampSchedule;
	if (daysSinceCreation >= 30 && schedule.day30) return schedule.day30;
	if (daysSinceCreation >= 21 && schedule.day21) return schedule.day21;
	if (daysSinceCreation >= 14 && schedule.day14) return schedule.day14;
	if (daysSinceCreation >= 7 && schedule.day7) return schedule.day7;
	if (daysSinceCreation >= 3 && schedule.day3) return schedule.day3;
	if (daysSinceCreation >= 1 && schedule.day1) return schedule.day1;

	// Default to base limit
	return profile.limits.dmsPerDay;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearProfileCache(): void {
	cachedConfig = null;
}

/**
 * List all profiles with basic info
 */
export function listProfiles(): void {
	const config = loadProfilesConfig();

	console.log("\n📋 Loaded Profiles:\n");

	for (const profile of config.profiles) {
		const dmLimit = getCurrentDMLimit(profile);
		const status = profile.archivedAt ? "🔴 ARCHIVED" : "🟢 ACTIVE";

		console.log(`${status} ${profile.id}`);
		console.log(`   Username: @${profile.username}`);
		console.log(`   Type: ${profile.type}`);
		console.log(`   Browser: AdsPower (ID: ${profile.adsPowerProfileId})`);
		console.log(`   DM Limit: ${dmLimit}/day`);
		console.log(`   Follow Limit: ${profile.limits.followsPerDay}/day`);
		console.log(
			`   Proxy: ${profile.proxyConfig?.provider || "decodo"} - ${profile.proxyConfig?.city || "none"}, ${profile.proxyConfig?.country || "none"}`,
		);
		console.log(
			`   Sessions: ${Object.values(profile.sessions).filter((s) => s.enabled).length}/3 enabled`,
		);
		console.log("");
	}

	console.log(`Total: ${config.profiles.length} profile(s)\n`);
}
