/**
 * Browser setup and page creation utilities.
 * Provides unified browser creation with consistent configuration.
 */
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getUserDataDir } from '../../auth/sessionManager/sessionManager.ts';
import {
  LOCAL_BROWSER,
  BROWSERLESS_TOKEN,
} from '../../shared/config/config.ts';

// Initialize puppeteer-extra with stealth plugin
(puppeteer as any).use(StealthPlugin());

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
 * Create a browser instance with consistent configuration.
 */
export async function createBrowser(
  options: BrowserOptions = {}
): Promise<Browser> {
  const { headless = true, userDataDir: providedUserDataDir } = options;

  if (LOCAL_BROWSER) {
    // Use persistent user data directory to save cookies between sessions
    const userDataDir =
      providedUserDataDir !== undefined
        ? providedUserDataDir
        : getUserDataDir();

    return await (puppeteer as any).launch({
      headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      userDataDir, // Persistent profile to save cookies
    });
  } else {
    if (!BROWSERLESS_TOKEN) {
      throw new Error(
        'BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER'
      );
    }
    return await (puppeteer as any).connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`,
    });
  }
}

/**
 * Create a page with consistent configuration.
 */
export async function createPage(
  browser: Browser,
  options: PageOptions = {}
): Promise<Page> {
  const {
    defaultNavigationTimeout = 20000,
    defaultTimeout = 12000,
    viewport = { width: 1440, height: 900 },
    userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  } = options;

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(defaultNavigationTimeout);
  page.setDefaultTimeout(defaultTimeout);
  await page.setViewport(viewport);
  await page.setUserAgent(userAgent);

  return page;
}
