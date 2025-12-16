/**
 * Browser setup and page creation utilities.
 * Provides unified browser creation with consistent configuration.
 */
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getUserDataDir } from "../../auth/sessionManager/sessionManager.ts";
import {
	BROWSERLESS_TOKEN,
	LOCAL_BROWSER,
} from "../../shared/config/config.ts";

// Initialize puppeteer-extra with stealth and proxy plugins
const extra = puppeteer as unknown as {
	use: (plugin: unknown) => void;
	launch: (options: object) => Promise<Browser>;
	connect: (options: object) => Promise<Browser>;
};
extra.use(StealthPlugin());

// BrowserLess stealth handles all proxy needs automatically

export interface BrowserOptions {
	headless?: boolean;
	userDataDir?: string | null;
}

export interface PageOptions {
	defaultNavigationTimeout?: number;
	defaultTimeout?: number;
	viewport?: { width: number; height: number };
	userAgent?: string;
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
 */
export async function createBrowser(
	options: BrowserOptions = {},
): Promise<Browser> {
	const { headless = true, userDataDir: providedUserDataDir } = options;

	if (LOCAL_BROWSER) {
		// For headed browsers, use unique directory to avoid singleton lock conflicts
		// For headless browsers, use persistent directory to save cookies
		const userDataDir =
			providedUserDataDir !== undefined
				? providedUserDataDir
				: headless
					? getUserDataDir()
					: getUniqueUserDataDir();

		const browser = await extra.launch({
			headless,
			args: [
				"--no-sandbox",
				"--disable-dev-shm-usage",
				"--disable-features=VizDisplayCompositor", // Allow multiple instances
			],
			userDataDir, // Persistent profile to save cookies
		});

		return browser;
	} else {
		if (!BROWSERLESS_TOKEN) {
			throw new Error(
				"BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER",
			);
		}

		// BrowserLess stealth includes residential proxies and all anti-detection by default
		const wsEndpoint = `wss://chrome.browserless.io/chrome/stealth?token=${BROWSERLESS_TOKEN}`;

		return await extra.connect({
			browserWSEndpoint: wsEndpoint,
		});
	}
}

/**
 * Create a page with consistent configuration.
 */
export async function createPage(
	browser: Browser,
	options: PageOptions = {},
): Promise<Page> {
	const {
		defaultNavigationTimeout = 20000,
		defaultTimeout = 12000,
		viewport = { width: 1440, height: 900 },
		userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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

	return page;
}
