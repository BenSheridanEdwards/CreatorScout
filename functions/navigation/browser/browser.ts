/**
 * Browser setup and page creation utilities.
 * Supports:
 * - AdsPower (Local API connection) - RECOMMENDED
 * - Local Puppeteer (development)
 *
 * AdsPower handles fingerprinting automatically.
 * No stealth plugins needed when using AdsPower profiles.
 */
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";
import { getUserDataDir } from "../../auth/sessionManager/sessionManager.ts";
import { LOCAL_BROWSER } from "../../shared/config/config.ts";
import { createLogger } from "../../shared/logger/logger.ts";
import { createStickyProxy, type ProxyManager } from "../proxy/proxyManager.ts";
import { connectToAdsPowerProfile } from "./adsPowerConnector.ts";

const logger = createLogger();

export interface BrowserOptions {
	headless?: boolean;
	userDataDir?: string | null;
	/**
	 * AdsPower profile user_id (from AdsPower app)
	 * When provided, connects via AdsPower Local API
	 */
	adsPowerProfileId?: string;
	/**
	 * ProxyManager instance for residential proxy (optional)
	 * If not provided and proxy credentials exist, one will be created automatically
	 * Note: AdsPower profiles typically have their own proxy configured
	 */
	proxyManager?: ProxyManager;
	/**
	 * Geo-targeting for proxy (if auto-creating proxy)
	 */
	proxyCountry?: string;
	proxyCity?: string;
}

export interface PageOptions {
	defaultNavigationTimeout?: number;
	defaultTimeout?: number;
	viewport?: { width: number; height: number };
	userAgent?: string;
	/**
	 * Apply minimal local stealth patches (webdriver removal, basic navigator props).
	 * Should be false when using AdsPower (it already handles fingerprinting/stealth).
	 */
	applyStealth?: boolean;
}

/**
 * Get a unique user data directory to prevent singleton lock conflicts.
 * This allows multiple browser instances without affecting user browsers.
 */
export function getUniqueUserDataDir(prefix: string = "browser"): string {
	const timestamp = Date.now();
	const randomId = Math.random().toString(36).substring(2, 8);
	return join(process.cwd(), ".sessions", `${prefix}_${timestamp}_${randomId}`);
}

/**
 * Create a browser instance with consistent configuration.
 *
 * Priority:
 * 1. If LOCAL_BROWSER=true, use local Puppeteer
 * 2. If adsPowerProfileId provided, use AdsPower (RECOMMENDED)
 * 3. Otherwise, fall back to local Puppeteer
 */
export async function createBrowser(
	options: BrowserOptions = {},
): Promise<Browser> {
	const {
		userDataDir: providedUserDataDir,
		adsPowerProfileId,
		proxyManager,
		proxyCountry,
		proxyCity,
	} = options;

	const usingLocalBrowser =
		process.env.LOCAL_BROWSER === "true" || LOCAL_BROWSER;

	// Priority 1: AdsPower (if profile ID provided and not forcing local browser)
	if (adsPowerProfileId && !usingLocalBrowser) {
		logger.info("ACTION", "Connecting to AdsPower profile...");

		const browser = await connectToAdsPowerProfile(adsPowerProfileId, {
			timeout: 30000,
			headless: options.headless,
		});

		logger.info("SUCCESS", "AdsPower browser connected successfully");
		return browser;
	}

	// Fall back to local Puppeteer (for development)
	logger.info(
		"ACTION",
		`Launching local browser (${usingLocalBrowser ? "visible" : "headless"})...`,
	);

	const headless = !usingLocalBrowser;

	// For headed browsers, use unique directory to avoid singleton lock conflicts
	// For headless browsers, use persistent directory to save cookies
	const userDataDir =
		providedUserDataDir !== undefined && providedUserDataDir !== null
			? providedUserDataDir
			: headless
				? getUserDataDir()
				: getUniqueUserDataDir();

	// Setup proxy if provided or auto-create if credentials available
	let proxy: ProxyManager | undefined = proxyManager;
	if (!proxy && !usingLocalBrowser) {
		try {
			proxy = createStickyProxy({
				country: proxyCountry,
				city: proxyCity,
			});
			logger.info("PROXY", "Auto-created sticky proxy session");
		} catch {
			logger.warn(
				"PROXY",
				"No proxy credentials found, launching without proxy",
			);
		}
	}

	// Build browser args
	const args = [
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-features=VizDisplayCompositor", // Allow multiple instances
		"--disable-blink-features=AutomationControlled", // Hide automation
		"--disable-features=IsolateOrigins,site-per-process", // Better compatibility
		"--disable-web-security", // Allow cross-origin requests
		"--disable-features=BlockInsecurePrivateNetworkRequests", // Better compatibility
	];

	// Add proxy if available
	if (proxy) {
		const proxyUrl = proxy.getProxyUrl();
		args.push(`--proxy-server=${proxyUrl}`);
		logger.info("PROXY", `Using proxy: ${proxy.getProxyCredentials().server}`);

		const sessionInfo = proxy.getSessionInfo();
		if (sessionInfo) {
			logger.info(
				"PROXY",
				`Sticky session: ${sessionInfo.sessionId} (${proxy.getTimeRemaining()}min remaining)`,
			);
		}
	}

	const browser = await puppeteer.launch({
		headless,
		args,
		userDataDir: userDataDir || undefined, // Persistent profile to save cookies
	});

	logger.info("SUCCESS", "Local browser launched successfully");

	return browser;
}

/**
 * Create a page with consistent configuration.
 */
export async function createPage(
	browser: Browser,
	options: PageOptions = {},
): Promise<Page> {
	const {
		defaultNavigationTimeout = 30000,
		defaultTimeout = 15000,
		viewport = { width: 1440, height: 900 },
		userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		applyStealth = process.env.LOCAL_BROWSER === "true",
	} = options;

	// Close any extra pages from previous sessions to avoid multiple tabs
	const pages = await browser.pages();
	for (let i = 1; i < pages.length; i++) {
		await pages[i].close();
	}

	// Use the first (remaining) page, or create a new one if none exist
	let page: Page = pages[0];
	if (!page) {
		page = await browser.newPage();
	}

	page.setDefaultNavigationTimeout(defaultNavigationTimeout);
	page.setDefaultTimeout(defaultTimeout);
	await page.setViewport(viewport);
	await page.setUserAgent(userAgent);

	// Add small initial delay (helps avoid detection)
	await new Promise((resolve) =>
		setTimeout(resolve, 1000 + Math.random() * 2000),
	);

	// Apply minimal stealth for local browser only.
	// AdsPower handles all fingerprinting (headers, stealth, etc.) automatically.
	if (applyStealth) {
		await applyLocalBrowserStealth(page);

		// Set extra HTTP headers only for local browser - AdsPower handles this
		await page.setExtraHTTPHeaders({
			"Accept-Encoding": "gzip, deflate, br, zstd",
			"Accept-Language": "en-US,en;q=0.9",
			"Sec-Ch-Ua":
				'"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"macOS"',
			"Sec-Ch-Ua-Platform-Version": '"14.4.0"',
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "none",
			"Sec-Fetch-User": "?1",
		});
	}

	return page;
}

/**
 * Apply minimal stealth techniques for local browser only.
 * AdsPower handles all stealth automatically, so this is only for local dev.
 */
async function applyLocalBrowserStealth(page: Page): Promise<void> {
	await page.evaluateOnNewDocument(() => {
		// Remove webdriver traces
		Object.defineProperty(navigator, "webdriver", { get: () => undefined });

		// Basic navigator properties
		const languages = ["en-US", "en"];
		Object.defineProperty(navigator, "languages", { get: () => languages });
		Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
		Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
		Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });

		// Chrome runtime
		(window as { chrome?: unknown }).chrome = {
			runtime: {},
		};
	});
}
