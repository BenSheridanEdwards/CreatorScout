/**
 * AdsPower Connector - Start and connect to AdsPower browser profiles via Local API
 *
 * AdsPower's Local API allows starting/stopping profiles and connecting via Puppeteer.
 * The API runs on http://127.0.0.1:50325 by default.
 *
 * Process:
 * 1. Call API to start profile
 * 2. API returns WebSocket endpoint (ws://...)
 * 3. Connect Puppeteer to that WebSocket
 *
 * Docs: https://localapi-doc-en.adspower.com/docs/K4IsTq
 */
import type { Browser } from "puppeteer";
import puppeteer from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

/**
 * Get AdsPower API base URL (reads env var lazily)
 */
function getApiBase(): string {
	return process.env.ADSPOWER_API_BASE || "http://127.0.0.1:50325";
}

/**
 * Get AdsPower API key (reads env var lazily)
 */
function getApiKey(): string | undefined {
	return process.env.ADSPOWER_API_KEY;
}

export interface AdsPowerStartResponse {
	code: number;
	msg: string;
	data?: {
		ws: {
			puppeteer: string;
			selenium: string;
		};
		debug_port: string;
		webdriver: string;
	};
}

export interface AdsPowerProfile {
	user_id: string;
	name: string;
	serial_number: string;
	group_id: string;
	group_name: string;
	domain_name?: string;
	username?: string;
	remark?: string;
	created_time: string;
	ip?: string;
	ip_country?: string;
	password?: string;
	last_open_time?: string;
}

export interface AdsPowerListResponse {
	code: number;
	msg: string;
	data?: {
		list: AdsPowerProfile[];
		page: number;
		page_size: number;
	};
}

export interface AdsPowerProfileOptions {
	/**
	 * AdsPower profile user_id
	 */
	profileId: string;

	/**
	 * Run in headless mode
	 * @default false
	 */
	headless?: boolean;

	/**
	 * Launch arguments for the browser
	 */
	launchArgs?: string[];

	/**
	 * Timeout for API requests in milliseconds
	 * @default 30000
	 */
	timeout?: number;
}

/**
 * Get headers for API requests (includes API key if configured)
 */
function getApiHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	const apiKey = getApiKey();
	if (apiKey) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	return headers;
}

/**
 * Start an AdsPower browser profile via the Local API
 *
 * @param options - Profile start options
 * @returns API response with WebSocket endpoint
 */
export async function startAdsPowerProfile(
	options: AdsPowerProfileOptions,
): Promise<AdsPowerStartResponse> {
	const {
		profileId,
		headless = false,
		launchArgs = [],
		timeout = 30000,
	} = options;

	try {
		logger.info("ADSPOWER", `Starting profile via API...`);
		logger.info("ADSPOWER", `Profile ID: ${profileId}`);

		// Build URL with query parameters
		const params = new URLSearchParams({
			user_id: profileId,
			open_tabs: "1", // Open with one tab
			headless: headless ? "1" : "0",
		});

		if (launchArgs.length > 0) {
			params.append("launch_args", JSON.stringify(launchArgs));
		}

		const url = `${getApiBase()}/api/v1/browser/start?${params.toString()}`;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(url, {
			method: "GET",
			headers: getApiHeaders(),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(
				`AdsPower API returned ${response.status}: ${response.statusText}`,
			);
		}

		const result: AdsPowerStartResponse = await response.json();

		if (result.code !== 0 || !result.data) {
			throw new Error(`Failed to start profile: ${result.msg}`);
		}

		logger.info("SUCCESS", "Profile started successfully");
		logger.info("ADSPOWER", `WebSocket: ${result.data.ws.puppeteer}`);
		logger.info("ADSPOWER", `Debug Port: ${result.data.debug_port}`);

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("ADSPOWER", `Failed to start profile: ${errorMessage}`);

		// Provide helpful error messages
		if (errorMessage.includes("ECONNREFUSED")) {
			throw new Error(
				`Cannot connect to AdsPower API on ${getApiBase()}.\n` +
					`Make sure:\n` +
					`1. AdsPower app is running\n` +
					`2. Local API is enabled in AdsPower settings\n` +
					`3. API shows "Connection: Success" in AdsPower`,
			);
		}

		if (errorMessage.includes("abort")) {
			throw new Error(
				`Connection timeout. AdsPower API did not respond within ${options.timeout}ms.`,
			);
		}

		throw error;
	}
}

/**
 * Stop an AdsPower browser profile via the Local API
 *
 * @param profileId - Profile user_id to stop
 * @param timeout - Timeout in milliseconds (default: 10000)
 */
export async function stopAdsPowerProfile(
	profileId: string,
	timeout: number = 10000,
): Promise<void> {
	try {
		logger.info("ADSPOWER", `Stopping profile: ${profileId}`);

		const params = new URLSearchParams({
			user_id: profileId,
		});

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(
			`${getApiBase()}/api/v1/browser/stop?${params.toString()}`,
			{
				method: "GET",
				headers: getApiHeaders(),
				signal: controller.signal,
			},
		);

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(
				`AdsPower API returned ${response.status}: ${response.statusText}`,
			);
		}

		const result = await response.json();

		if (result.code !== 0) {
			throw new Error(`Failed to stop profile: ${result.msg}`);
		}

		logger.info("SUCCESS", "Profile stopped successfully");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("ADSPOWER", `Failed to stop profile: ${errorMessage}`);

		// Provide helpful error messages
		if (
			errorMessage.includes("fetch failed") ||
			errorMessage.includes("ECONNREFUSED")
		) {
			throw new Error(
				`Cannot connect to AdsPower API. Make sure AdsPower is still running and Local API is enabled.`,
			);
		}

		if (errorMessage.includes("abort")) {
			throw new Error(
				`Stop request timed out after ${timeout}ms. Profile may still be running.`,
			);
		}

		throw error;
	}
}

/**
 * Check if a profile is currently active/running
 *
 * @param profileId - Profile user_id to check
 * @returns True if profile is running
 */
export async function isAdsPowerProfileActive(
	profileId: string,
): Promise<boolean> {
	try {
		const params = new URLSearchParams({
			user_id: profileId,
		});

		const response = await fetch(
			`${getApiBase()}/api/v1/browser/active?${params.toString()}`,
			{
				method: "GET",
				headers: getApiHeaders(),
			},
		);

		if (!response.ok) {
			return false;
		}

		const result = await response.json();
		return result.code === 0 && result.data?.status === "Active";
	} catch {
		return false;
	}
}

/**
 * Connect to an AdsPower browser profile via API
 *
 * This method:
 * 1. Starts profile via AdsPower API
 * 2. Connects Puppeteer to the returned WebSocket endpoint
 * 3. Returns connected Browser instance
 *
 * @param profileId - AdsPower profile user_id
 * @param options - Profile start options
 * @returns Connected Puppeteer Browser instance
 *
 * @example
 * ```typescript
 * const browser = await connectToAdsPowerProfile('abc123');
 * const page = await browser.newPage();
 * await page.goto('https://instagram.com');
 * ```
 */
export async function connectToAdsPowerProfile(
	profileId: string,
	options: Omit<AdsPowerProfileOptions, "profileId"> = {},
): Promise<Browser> {
	try {
		// Step 1: Start profile via API
		const startResult = await startAdsPowerProfile({
			profileId,
			...options,
		});

		if (!startResult.data?.ws.puppeteer) {
			throw new Error("No WebSocket endpoint returned from AdsPower API");
		}

		const wsEndpoint = startResult.data.ws.puppeteer;

		// Step 2: Connect Puppeteer to WebSocket
		logger.info("ADSPOWER", "Connecting Puppeteer to profile...");

		const browser = await puppeteer.connect({
			browserWSEndpoint: wsEndpoint,
			defaultViewport: null,
		});

		logger.info("SUCCESS", "Connected to AdsPower profile successfully");

		// Verify connection
		const pages = await browser.pages();
		logger.info(
			"ADSPOWER",
			`Browser ready with ${pages.length} existing page(s)`,
		);

		return browser;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("ADSPOWER", `Failed to connect: ${errorMessage}`);
		throw error;
	}
}

/**
 * Check if AdsPower API is available
 *
 * @returns True if API is available
 */
export async function isAdsPowerApiAvailable(): Promise<boolean> {
	try {
		const response = await fetch(`${getApiBase()}/api/v1/user/list`, {
			method: "GET",
			headers: getApiHeaders(),
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * List all AdsPower profiles via API
 *
 * @param page - Page number (default: 1)
 * @param pageSize - Number of profiles per page (default: 100)
 * @returns List of profiles
 */
export async function listAdsPowerProfiles(
	page: number = 1,
	pageSize: number = 100,
): Promise<AdsPowerProfile[]> {
	try {
		const params = new URLSearchParams({
			page: page.toString(),
			page_size: pageSize.toString(),
		});

		const response = await fetch(
			`${getApiBase()}/api/v1/user/list?${params.toString()}`,
			{
				method: "GET",
				headers: getApiHeaders(),
			},
		);

		if (!response.ok) {
			throw new Error(`AdsPower API returned ${response.status}`);
		}

		const result: AdsPowerListResponse = await response.json();

		if (result.code !== 0 || !result.data) {
			throw new Error(`Failed to list profiles: ${result.msg}`);
		}

		return result.data.list || [];
	} catch (error) {
		logger.error("ADSPOWER", `Failed to list profiles: ${error}`);
		return [];
	}
}

/**
 * Get a specific AdsPower profile by user_id
 *
 * @param profileId - Profile user_id
 * @returns Profile details or null if not found
 */
export async function getAdsPowerProfile(
	profileId: string,
): Promise<AdsPowerProfile | null> {
	try {
		const params = new URLSearchParams({
			user_id: profileId,
		});

		const response = await fetch(
			`${getApiBase()}/api/v1/user/list?${params.toString()}`,
			{
				method: "GET",
				headers: getApiHeaders(),
			},
		);

		if (!response.ok) {
			return null;
		}

		const result: AdsPowerListResponse = await response.json();

		if (result.code !== 0 || !result.data?.list?.length) {
			return null;
		}

		return result.data.list[0];
	} catch {
		return null;
	}
}
