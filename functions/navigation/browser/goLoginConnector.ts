/**
 * GoLogin Connector - Connect to GoLogin browser profiles via WebSocket
 *
 * GoLogin handles all fingerprinting, stealth, and proxy management automatically.
 * No need for puppeteer-extra or stealth plugins when using GoLogin profiles.
 */
import type { Browser } from "puppeteer";
import puppeteer from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

export interface GoLoginConnectionOptions {
	/**
	 * Run in headless mode (for VPS deployment)
	 * @default true
	 */
	headless?: boolean;

	/**
	 * Use local Orbita instance instead of remote GoLogin
	 * @default false
	 */
	local?: boolean;

	/**
	 * VPS IP address for local Orbita connection
	 * Only used when local=true
	 */
	vpsIp?: string;

	/**
	 * Port for local Orbita connection
	 * @default 9222
	 */
	localPort?: number;

	/**
	 * Connection timeout in milliseconds
	 * @default 30000
	 */
	timeout?: number;
}

export interface GoLoginProfile {
	id: string;
	token: string;
	name?: string;
}

/**
 * Connect to a GoLogin profile via WebSocket
 *
 * @param profileToken - GoLogin profile token or WebSocket URL
 * @param options - Connection options
 * @returns Connected Puppeteer Browser instance
 *
 * @example
 * ```typescript
 * // Connect to remote GoLogin
 * const browser = await connectToGoLoginProfile('your-profile-token');
 *
 * // Connect to local Orbita instance
 * const browser = await connectToGoLoginProfile('your-profile-token', {
 *   local: true,
 *   vpsIp: '192.168.1.100'
 * });
 * ```
 */
export async function connectToGoLoginProfile(
	profileToken: string,
	options: GoLoginConnectionOptions = {},
): Promise<Browser> {
	const { local = false, vpsIp = "localhost", localPort = 9222 } = options;

	let wsEndpoint: string;

	if (local) {
		// Local Orbita exposes a DevTools HTTP endpoint on the debugging port.
		// Puppeteer should connect via `browserURL`, not a bare ws://host:port.
		wsEndpoint = `http://${vpsIp}:${localPort}`;
		logger.info(
			"GOLOGIN",
			`Connecting to local Orbita at ${vpsIp}:${localPort}...`,
		);
	} else {
		// Connect to remote GoLogin service
		// GoLogin handles fingerprint rotation, proxies, and stealth automatically
		wsEndpoint = `wss://remote.gologin.com:443/connect?token=${profileToken}`;
		logger.info("GOLOGIN", "Connecting to GoLogin remote service...");
	}

	try {
		const browser = await puppeteer.connect(
			local
				? {
						browserURL: wsEndpoint,
						defaultViewport: null,
					}
				: {
						browserWSEndpoint: wsEndpoint,
						defaultViewport: null,
					},
		);

		logger.info("SUCCESS", "Connected to GoLogin profile successfully");

		// Verify connection is working
		const pages = await browser.pages();
		logger.info("GOLOGIN", `Connected with ${pages.length} existing page(s)`);

		return browser;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("GOLOGIN", `Failed to connect to GoLogin: ${errorMessage}`);

		// Provide helpful error messages
		if (errorMessage.includes("ECONNREFUSED")) {
			throw new Error(
				`GoLogin connection refused. ${
					local
						? `Make sure Orbita is running on ${vpsIp}:${localPort}`
						: "Check your internet connection and GoLogin token"
				}`,
			);
		}

		if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
			throw new Error(
				"GoLogin authentication failed. Check your profile token.",
			);
		}

		throw error;
	}
}

/**
 * Get WebSocket URL for connecting to a GoLogin profile
 *
 * @param profileToken - GoLogin profile token
 * @param local - Use local Orbita instance
 * @param vpsIp - VPS IP for local connection
 * @param port - Port for local connection
 * @returns WebSocket endpoint URL
 */
export function getGoLoginWebSocketUrl(
	profileToken: string,
	local: boolean = false,
	vpsIp: string = "localhost",
	port: number = 9222,
): string {
	if (local) {
		// Local Orbita debugging endpoint is HTTP.
		return `http://${vpsIp}:${port}`;
	}
	return `wss://remote.gologin.com:443/connect?token=${profileToken}`;
}

/**
 * Check if a GoLogin profile is available for connection
 *
 * @param profileToken - GoLogin profile token
 * @param options - Connection options
 * @returns True if profile is available
 */
export async function isGoLoginProfileAvailable(
	profileToken: string,
	options: GoLoginConnectionOptions = {},
): Promise<boolean> {
	try {
		const browser = await connectToGoLoginProfile(profileToken, {
			...options,
			timeout: 10000, // Quick timeout for availability check
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

/**
 * Start a local Orbita instance (for VPS deployment)
 *
 * Note: This function provides the command to run, but actual execution
 * should be handled by the VPS setup script or systemd service.
 *
 * @returns Command to start Orbita
 */
export function getOrbitaStartCommand(port: number = 9222): string {
	// Orbita binary path varies by OS
	// Linux: /opt/gologin/orbita
	// macOS: /Applications/GoLogin.app/Contents/MacOS/Orbita
	// Windows: C:\Users\{user}\AppData\Local\Programs\GoLogin\Orbita.exe
	return `orbita --no-sandbox --remote-debugging-port=${port} --headless`;
}
