/**
 * Browser setup and page creation utilities.
 * Provides unified browser creation with consistent configuration.
 */
import { join } from "node:path";
import fs from "node:fs/promises";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getUserDataDir } from "../../auth/sessionManager/sessionManager.ts";
import {
	BROWSERLESS_TOKEN,
	LOCAL_BROWSER,
} from "../../shared/config/config.ts";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

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
	const { userDataDir: providedUserDataDir } = options;

	// Connect to browser (respect LOCAL_BROWSER setting for visibility)
	const usingLocalBrowser = process.env.LOCAL_BROWSER === "true";
	logger.info(
		"ACTION",
		`Connecting to browser (${usingLocalBrowser ? "visible" : "headless"})...`,
	);

	const headless = !usingLocalBrowser;

	if (usingLocalBrowser) {
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

		logger.info("SUCCESS", "Browser connected successfully");

		return browser;
	} else {
		if (!BROWSERLESS_TOKEN) {
			throw new Error(
				"BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER",
			);
		}

		// BrowserLess stealth endpoint
		// The /stealth endpoint automatically handles:
		// - Fingerprint rotation (user agents, viewports, navigator properties)
		// - Residential proxy rotation (automatically enabled on $50+ plans)
		// - Advanced anti-detection techniques
		// - Canvas/WebGL fingerprint spoofing
		// Note: Residential proxies are configured in your Browserless dashboard
		// and are automatically used with the /stealth endpoint on paid plans
		const wsEndpoint = `wss://chrome.browserless.io/chrome/stealth?token=${BROWSERLESS_TOKEN}`;

		const browser = await extra.connect({
			browserWSEndpoint: wsEndpoint,
		});

		logger.info("SUCCESS", "Browser connected successfully");

		return browser;
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
		defaultNavigationTimeout = 30000, // Increased for better reliability
		defaultTimeout = 15000, // Increased for better reliability
		viewport = { width: 1440, height: 900 },
		// Default user agent - Browserless stealth will handle fingerprint rotation automatically
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

	// Set up console logging to capture errors and warnings
	// Filter out non-critical errors that we can safely ignore
	page.on("console", (msg) => {
		const type = msg.type();
		const text = msg.text();

		// Filter out known non-critical warnings/errors
		const ignoredPatterns = [
			"Permissions-Policy header", // Browser feature warnings
			"GroupMarkerNotSet", // Chrome internal warnings
			"Automatic fallback to software WebGL", // WebGL warnings (non-critical)
		];

		const shouldIgnore = ignoredPatterns.some((pattern) =>
			text.includes(pattern),
		);

		if ((type === "error" || type === "warn") && !shouldIgnore) {
			// eslint-disable-next-line no-console
			console.log(`[Browser Console ${type.toUpperCase()}]: ${text}`);
		}
	});

	// Capture page errors - filter out known non-critical errors
	page.on("pageerror", (error) => {
		const errorMessage = error.message;

		// Filter out known non-critical errors from Instagram's code
		const ignoredErrors = [
			"__name is not defined", // Instagram's internal code issue, not ours
			"is not defined", // Generic undefined variable errors from Instagram
		];

		const shouldIgnore = ignoredErrors.some((pattern) =>
			errorMessage.includes(pattern),
		);

		if (!shouldIgnore) {
			// eslint-disable-next-line no-console
			console.log(`[Page Error]: ${errorMessage}`);
		}
	});

	// Capture failed requests - filter out non-critical failures
	page.on("requestfailed", (request) => {
		const url = request.url();
		const errorText = request.failure()?.errorText || "Unknown error";

		// Filter out non-critical request failures
		const ignoredPatterns = [
			"images/assets_DO_NOT_HARDCODE", // Instagram image assets (non-critical)
			".png", // Image failures are usually non-critical
			".jpg",
			".jpeg",
			".gif",
			".webp",
			"favicon.ico", // Favicon failures are non-critical
			"net::ERR_ABORTED", // User-initiated aborts (often non-critical)
		];

		const shouldIgnore = ignoredPatterns.some(
			(pattern) => url.includes(pattern) || errorText.includes(pattern),
		);

		if (!shouldIgnore) {
			// eslint-disable-next-line no-console
			console.log(`[Request Failed]: ${url} - ${errorText}`);
		}
	});

	// Add human-like delays before any interaction (helps avoid detection)
	// This simulates real user behavior - humans don't interact instantly
	await new Promise((resolve) =>
		setTimeout(resolve, 2000 + Math.random() * 3000),
	);

	// If we're using Browserless, request a Live Debugger URL and persist it for the UI.
	if (!LOCAL_BROWSER && BROWSERLESS_TOKEN) {
		const pageWithCDP = page as unknown as {
			createCDPSession?: () => Promise<{
				send: (method: string, params?: unknown) => Promise<unknown>;
			}>;
		};
		if (typeof pageWithCDP.createCDPSession === "function") {
			try {
				const cdp = await pageWithCDP.createCDPSession();
				const resp = (await cdp.send("Browserless.liveURL")) as {
					liveURL?: string;
				};
				if (resp?.liveURL) {
					await fs.mkdir("tmp", { recursive: true });
					await fs.writeFile(
						"tmp/live-session-url.json",
						JSON.stringify({ liveURL: resp.liveURL, ts: Date.now() }),
						"utf8",
					);
				} else {
					// eslint-disable-next-line no-console
					console.warn(
						"[browser] Browserless.liveURL did not return a liveURL. " +
							"This usually means your Browserless plan/endpoint does not support the Live Debugger.",
					);
				}
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn(
					"[browser] Failed to obtain Browserless live URL via CDP. " +
						"Live viewer in Scout Studio will be blank.\n",
					err,
				);
			}
		}
	}

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
			// Note: Browserless stealth handles fingerprint rotation automatically
			// We only set defaults here - Browserless will handle rotation
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
	// NOTE: Removed "Accept", "Cache-Control", and "Upgrade-Insecure-Requests" headers as they cause CORS issues with Instagram
	// Let the browser use default headers for better compatibility
	const pageWithHeaders = page as unknown as {
		setExtraHTTPHeaders?: (headers: Record<string, string>) => Promise<void>;
	};
	if (typeof pageWithHeaders.setExtraHTTPHeaders === "function") {
		await pageWithHeaders.setExtraHTTPHeaders({
			// Removed "Accept" - causes CORS errors with Instagram CDN
			"Accept-Encoding": "gzip, deflate, br, zstd",
			"Accept-Language": "en-US,en;q=0.9",
			// Removed "Cache-Control" - causes CORS errors with Instagram
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
