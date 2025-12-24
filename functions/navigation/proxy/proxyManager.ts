/**
 * Proxy Manager for Residential Sticky Sessions
 *
 * Supports:
 * - Decodo residential proxies (20-30 min sticky)
 * - Smartproxy residential proxies (15-30 min sticky) - LEGACY
 * - Session ID tracking for consistent IP
 * - Automatic rotation on expiry
 * - Timezone/geolocation matching
 *
 * Usage:
 *   const proxy = createStickyProxy({ provider: 'decodo' });
 *   const proxyUrl = proxy.getProxyUrl();
 *   // Use in browser args: --proxy-server=proxyUrl
 */

import { randomBytes } from "node:crypto";
import { createLogger } from "../../shared/logger/logger.ts";
import {
	DECODO_USERNAME,
	DECODO_PASSWORD,
	DECODO_HOST,
	DECODO_PORT,
	DECODO_STICKY_SESSION_MIN,
	DECODO_STICKY_SESSION_MAX,
	SMARTPROXY_USERNAME,
	SMARTPROXY_PASSWORD,
	SMARTPROXY_HOST,
	SMARTPROXY_PORT,
	SMARTPROXY_STICKY_SESSION_MIN,
	SMARTPROXY_STICKY_SESSION_MAX,
} from "../../shared/config/config.ts";

const logger = createLogger();

export type ProxyProvider = "decodo" | "smartproxy";

export interface ProxyConfig {
	provider?: ProxyProvider; // Default: "decodo"
	host: string;
	port: number;
	username: string;
	password: string;
	stickySessionMinutes?: number;
	country?: string; // ISO country code (e.g. "us", "gb", "ca")
	city?: string; // City name (e.g. "newyork", "london")
}

export interface ProxySession {
	sessionId: string;
	createdAt: Date;
	expiresAt: Date;
	country?: string;
	city?: string;
}

export class ProxyManager {
	private config: ProxyConfig;
	private currentSession: ProxySession | null = null;

	constructor(config: ProxyConfig) {
		const provider = config.provider || "decodo";
		
		// Set default sticky session duration based on provider
		const defaultSessionMin = provider === "decodo" 
			? DECODO_STICKY_SESSION_MIN 
			: SMARTPROXY_STICKY_SESSION_MIN;
		const defaultSessionMax = provider === "decodo"
			? DECODO_STICKY_SESSION_MAX
			: SMARTPROXY_STICKY_SESSION_MAX;

		this.config = {
			provider,
			stickySessionMinutes:
				config.stickySessionMinutes ||
				defaultSessionMin +
					Math.floor(
						Math.random() * (defaultSessionMax - defaultSessionMin),
					),
			...config,
		};

		logger.info(
			"PROXY",
			`Initialized proxy manager: ${provider} (${this.config.host}:${this.config.port})`,
		);
	}

	/**
	 * Generate a new sticky session ID
	 */
	private generateSessionId(): string {
		// 10-character random session ID
		return randomBytes(5).toString("hex");
	}

	/**
	 * Create a new sticky session
	 */
	private createNewSession(): ProxySession {
		const sessionId = this.generateSessionId();
		const createdAt = new Date();
		const expiresAt = new Date(
			createdAt.getTime() +
				(this.config.stickySessionMinutes || 20) * 60 * 1000,
		);

		this.currentSession = {
			sessionId,
			createdAt,
			expiresAt,
			country: this.config.country,
			city: this.config.city,
		};

		logger.info(
			"PROXY",
			`Created new sticky session: ${sessionId} (expires in ${this.config.stickySessionMinutes}min)`,
		);

		return this.currentSession;
	}

	/**
	 * Check if current session is expired
	 */
	private isSessionExpired(): boolean {
		if (!this.currentSession) return true;
		return new Date() >= this.currentSession.expiresAt;
	}

	/**
	 * Get or create a sticky session
	 */
	getSession(): ProxySession {
		if (!this.currentSession || this.isSessionExpired()) {
			if (this.currentSession) {
				logger.info("PROXY", "Session expired, rotating to new IP...");
			}
			return this.createNewSession();
		}
		return this.currentSession;
	}

	/**
	 * Force rotate to a new IP (new session)
	 */
	rotateSession(): ProxySession {
		logger.info("PROXY", "Manually rotating to new IP...");
		return this.createNewSession();
	}

	/**
	 * Get formatted proxy URL for browser
	 * Format: http://username-session-{sessionId}:password@host:port
	 */
	getProxyUrl(): string {
		const session = this.getSession();

		// Build username with session ID and geo params
		let username = `${this.config.username}-session-${session.sessionId}`;

		// Add country targeting if specified
		if (this.config.country) {
			username += `-country-${this.config.country}`;
		}

		// Add city targeting if specified
		if (this.config.city) {
			username += `-city-${this.config.city}`;
		}

		return `http://${username}:${this.config.password}@${this.config.host}:${this.config.port}`;
	}

	/**
	 * Get proxy credentials for browser authentication
	 */
	getProxyCredentials(): {
		server: string;
		username: string;
		password: string;
	} {
		const session = this.getSession();

		// Build username with session ID and geo params
		let username = `${this.config.username}-session-${session.sessionId}`;

		if (this.config.country) {
			username += `-country-${this.config.country}`;
		}

		if (this.config.city) {
			username += `-city-${this.config.city}`;
		}

		return {
			server: `${this.config.host}:${this.config.port}`,
			username,
			password: this.config.password,
		};
	}

	/**
	 * Get session info
	 */
	getSessionInfo(): ProxySession | null {
		return this.currentSession;
	}

	/**
	 * Get time remaining in current session (minutes)
	 */
	getTimeRemaining(): number {
		if (!this.currentSession) return 0;
		const now = new Date();
		const remaining = this.currentSession.expiresAt.getTime() - now.getTime();
		return Math.max(0, Math.floor(remaining / 60000));
	}
}

/**
 * Create a sticky proxy manager with Decodo or Smartproxy
 * Returns undefined if proxy credentials are not configured
 */
export function createStickyProxy(
	options: {
		provider?: ProxyProvider;
		country?: string;
		city?: string;
		stickySessionMinutes?: number;
	} = {},
): ProxyManager | undefined {
	const provider = options.provider || "decodo";

	// Use Decodo by default
	if (provider === "decodo") {
		if (!DECODO_USERNAME || !DECODO_PASSWORD) {
			logger.warn(
				"PROXY",
				"Decodo proxy credentials not configured - skipping proxy",
			);
			return undefined;
		}

		return new ProxyManager({
			provider: "decodo",
			host: DECODO_HOST,
			port: DECODO_PORT,
			username: DECODO_USERNAME,
			password: DECODO_PASSWORD,
			country: options.country,
			city: options.city,
			stickySessionMinutes: options.stickySessionMinutes,
		});
	}

	// Legacy: Smartproxy fallback
	if (!SMARTPROXY_USERNAME || !SMARTPROXY_PASSWORD) {
		logger.warn(
			"PROXY",
			"Smartproxy credentials not configured - skipping proxy",
		);
		return undefined;
	}

	return new ProxyManager({
		provider: "smartproxy",
		host: SMARTPROXY_HOST,
		port: SMARTPROXY_PORT,
		username: SMARTPROXY_USERNAME,
		password: SMARTPROXY_PASSWORD,
		country: options.country,
		city: options.city,
		stickySessionMinutes: options.stickySessionMinutes,
	});
}

/**
 * Get common US cities for geo-targeting
 */
export const US_CITIES = [
	"newyork",
	"losangeles",
	"chicago",
	"houston",
	"phoenix",
	"philadelphia",
	"sanantonio",
	"sandiego",
	"dallas",
	"sanjose",
	"austin",
	"jacksonville",
	"fortworth",
	"columbus",
	"charlotte",
	"sanfrancisco",
	"indianapolis",
	"seattle",
	"denver",
	"boston",
	"miami",
	"atlanta",
	"lasvegas",
	"portland",
];

/**
 * Get random US city for proxy
 */
export function getRandomUSCity(): string {
	return US_CITIES[Math.floor(Math.random() * US_CITIES.length)];
}

