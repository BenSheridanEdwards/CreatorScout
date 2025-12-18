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
				"--disable-blink-features=AutomationControlled", // Hide automation
				"--disable-features=IsolateOrigins,site-per-process", // Better compatibility
				"--disable-web-security", // Allow cross-origin requests
				"--disable-features=BlockInsecurePrivateNetworkRequests", // Better compatibility
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
		// Updated to latest Chrome version (as of 2024)
		userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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

	// Additional stealth techniques
	const pageWithEval = page as unknown as {
		evaluateOnNewDocument?: (fn: () => void) => Promise<void>;
	};
	if (typeof pageWithEval.evaluateOnNewDocument === "function") {
		await pageWithEval.evaluateOnNewDocument(() => {
			// ===== CRITICAL: Remove all webdriver traces =====
			Object.defineProperty(navigator, "webdriver", { get: () => undefined });
			delete (navigator as { webdriver?: unknown }).webdriver;

			// Remove __webdriver_evaluate, __selenium_unwrapped, etc.
			Object.defineProperty(window, "navigator", {
				get: () => {
					const nav = Object.create(navigator);
					nav.webdriver = undefined;
					return nav;
				},
			});

			// ===== Navigator Properties =====
			const languages = ["en-US", "en"];
			Object.defineProperty(navigator, "languages", { get: () => languages });
			Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
			Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
			Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });

			// Add realistic plugins
			Object.defineProperty(navigator, "plugins", {
				get: () => [
					{ name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
					{
						name: "Chrome PDF Viewer",
						filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
					},
					{ name: "Native Client", filename: "internal-nacl-plugin" },
				],
			});

			// ===== Canvas Fingerprinting Protection =====
			const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
			HTMLCanvasElement.prototype.toDataURL = function (
				type?: string,
				quality?: number,
			) {
				const context = this.getContext("2d");
				if (context) {
					const imageData = context.getImageData(0, 0, this.width, this.height);
					for (let i = 0; i < imageData.data.length; i += 4) {
						imageData.data[i] += Math.floor(Math.random() * 10) - 5;
					}
					context.putImageData(imageData, 0, 0);
				}
				return originalToDataURL.apply(this, [type, quality]);
			};

			// ===== WebGL Fingerprinting Protection =====
			const getParameter = WebGLRenderingContext.prototype.getParameter;
			WebGLRenderingContext.prototype.getParameter = function (
				parameter: number,
			) {
				if (parameter === 37445) {
					// UNMASKED_VENDOR_WEBGL
					return "Intel Inc.";
				}
				if (parameter === 37446) {
					// UNMASKED_RENDERER_WEBGL
					return "Intel Iris OpenGL Engine";
				}
				return getParameter.apply(this, [parameter]);
			};

			// ===== Permissions API =====
			const originalQuery = window.navigator.permissions.query;
			window.navigator.permissions.query = (parameters) =>
				parameters.name === "notifications"
					? Promise.resolve({
							state: Notification.permission,
						} as PermissionStatus)
					: originalQuery(parameters);

			// ===== Chrome Runtime =====
			(window as { chrome?: unknown }).chrome = {
				runtime: {},
			};

			// ===== Battery API (can be used for fingerprinting) =====
			const nav = navigator as { getBattery?: () => Promise<unknown> };
			if (nav.getBattery) {
				Object.defineProperty(navigator, "getBattery", {
					get: () => () =>
						Promise.resolve({
							charging: true,
							chargingTime: 0,
							dischargingTime: Infinity,
							level: 0.8 + Math.random() * 0.2,
						}),
				});
			}

			// ===== Connection API =====
			const navWithConnection = navigator as { connection?: unknown };
			if (navWithConnection.connection) {
				Object.defineProperty(navigator, "connection", {
					get: () => ({
						effectiveType: "4g",
						rtt: 50,
						downlink: 10,
						saveData: false,
					}),
				});
			}
		});
	}

	// Set extra HTTP headers to look more human
	// NOTE: Removed "Upgrade-Insecure-Requests" header as it causes CORS issues with Instagram
	const pageWithHeaders = page as unknown as {
		setExtraHTTPHeaders?: (headers: Record<string, string>) => Promise<void>;
	};
	if (typeof pageWithHeaders.setExtraHTTPHeaders === "function") {
		await pageWithHeaders.setExtraHTTPHeaders({
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
			"Accept-Encoding": "gzip, deflate, br, zstd",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "max-age=0",
			"Sec-Ch-Ua":
				'"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
			"Sec-Ch-Ua-Mobile": "?0",
			"Sec-Ch-Ua-Platform": '"macOS"',
			"Sec-Ch-Ua-Platform-Version": '"14.4.0"',
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "none",
			"Sec-Fetch-User": "?1",
			// Removed "Upgrade-Insecure-Requests" - causes CORS errors with Instagram
		});
	}

	return page;
}
