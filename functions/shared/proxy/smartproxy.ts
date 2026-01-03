/**
 * Smartproxy Integration
 *
 * Manages residential sticky sessions for Instagram profiles.
 * Smartproxy provides rotating residential IPs with sticky sessions.
 */
import {
	SMARTPROXY_HOST,
	SMARTPROXY_PASSWORD,
	SMARTPROXY_PORT,
	SMARTPROXY_STICKY_SESSION_MAX,
	SMARTPROXY_STICKY_SESSION_MIN,
	SMARTPROXY_USERNAME,
} from "../config/config.ts";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

export interface ProxyConfig {
	host: string;
	port: number;
	username: string;
	password: string;
	stickySession: string;
	timezone?: string;
	geolocation?: string;
	createdAt: Date;
	expiresAt: Date;
}

// Cache of active proxy sessions per profile
const proxySessionCache = new Map<string, ProxyConfig>();

/**
 * Generate a unique sticky session ID
 */
function generateSessionId(): string {
	return `scout_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Calculate random sticky session duration
 */
function getRandomStickyDuration(): number {
	const min = SMARTPROXY_STICKY_SESSION_MIN;
	const max = SMARTPROXY_STICKY_SESSION_MAX;
	return Math.floor(min + Math.random() * (max - min));
}

/**
 * Get timezone based on geolocation
 * Maps country codes to common timezones
 */
function getTimezoneForLocation(country: string): string {
	const timezones: Record<string, string> = {
		US: "America/New_York",
		GB: "Europe/London",
		DE: "Europe/Berlin",
		FR: "Europe/Paris",
		CA: "America/Toronto",
		AU: "Australia/Sydney",
		BR: "America/Sao_Paulo",
		IN: "Asia/Kolkata",
		JP: "Asia/Tokyo",
	};
	return timezones[country] || "America/New_York";
}

/**
 * Get proxy configuration for a profile
 *
 * @param profileId - Profile ID to get proxy for
 * @param geolocation - Optional country code for geo-targeting
 * @returns Proxy configuration
 */
export async function getProxyForProfile(
	profileId: string,
	geolocation?: string,
): Promise<ProxyConfig> {
	// Check if we have a valid cached session
	const cached = proxySessionCache.get(profileId);
	if (cached && cached.expiresAt > new Date()) {
		logger.info("PROXY", `Using cached proxy session for profile ${profileId}`);
		return cached;
	}

	// Check if Smartproxy is configured
	if (!SMARTPROXY_USERNAME || !SMARTPROXY_PASSWORD) {
		logger.warn("PROXY", "Smartproxy not configured - using direct connection");
		// Return a dummy config for development
		return {
			host: "",
			port: 0,
			username: "",
			password: "",
			stickySession: "",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		};
	}

	// Generate new sticky session
	const stickySession = generateSessionId();
	const durationMinutes = getRandomStickyDuration();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

	// Build proxy config
	// Smartproxy sticky session format: user-{username}-session-{sessionid}
	const proxyConfig: ProxyConfig = {
		host: SMARTPROXY_HOST,
		port: SMARTPROXY_PORT,
		username: `user-${SMARTPROXY_USERNAME}-session-${stickySession}`,
		password: SMARTPROXY_PASSWORD,
		stickySession,
		timezone: geolocation ? getTimezoneForLocation(geolocation) : undefined,
		geolocation,
		createdAt: now,
		expiresAt,
	};

	// Cache the session
	proxySessionCache.set(profileId, proxyConfig);

	logger.info(
		"PROXY",
		`Created new proxy session for profile ${profileId} (expires in ${durationMinutes} min)`,
	);

	return proxyConfig;
}

/**
 * Rotate proxy for a profile (create new sticky session)
 *
 * @param profileId - Profile ID to rotate proxy for
 * @param geolocation - Optional country code for geo-targeting
 * @returns New proxy configuration
 */
export async function rotateProxy(
	profileId: string,
	geolocation?: string,
): Promise<ProxyConfig> {
	// Clear cached session
	proxySessionCache.delete(profileId);

	logger.info("PROXY", `Rotating proxy for profile ${profileId}`);

	// Get new session
	return getProxyForProfile(profileId, geolocation);
}

/**
 * Get proxy URL string for Puppeteer/GoLogin
 *
 * @param config - Proxy configuration
 * @returns Proxy URL string
 */
export function getProxyUrl(config: ProxyConfig): string {
	if (!config.host) return "";
	return `http://${config.username}:${config.password}@${config.host}:${config.port}`;
}

/**
 * Check if proxy session is still valid
 *
 * @param profileId - Profile ID to check
 * @returns True if session is valid
 */
export function isProxySessionValid(profileId: string): boolean {
	const cached = proxySessionCache.get(profileId);
	if (!cached) return false;
	return cached.expiresAt > new Date();
}

/**
 * Get remaining time on proxy session
 *
 * @param profileId - Profile ID to check
 * @returns Remaining minutes, or 0 if expired/not found
 */
export function getProxySessionRemainingMinutes(profileId: string): number {
	const cached = proxySessionCache.get(profileId);
	if (!cached) return 0;

	const remaining = cached.expiresAt.getTime() - Date.now();
	return Math.max(0, Math.floor(remaining / (60 * 1000)));
}

/**
 * Clear all proxy sessions
 */
export function clearAllProxySessions(): void {
	proxySessionCache.clear();
	logger.info("PROXY", "Cleared all proxy sessions");
}

/**
 * Get proxy statistics
 */
export function getProxyStats(): {
	activeSessions: number;
	profiles: string[];
} {
	const profiles: string[] = [];

	for (const [profileId, config] of proxySessionCache.entries()) {
		if (config.expiresAt > new Date()) {
			profiles.push(profileId);
		}
	}

	return {
		activeSessions: profiles.length,
		profiles,
	};
}


