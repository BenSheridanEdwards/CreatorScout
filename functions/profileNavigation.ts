/**
 * Profile navigation and status checking utilities.
 */
import type { Page } from 'puppeteer';
import { login } from './login.ts';
import { parseProfileStatus } from './profileStatus.ts';
import { IG_USER, IG_PASS } from './config.ts';
import { sleep } from './sleep.ts';

export interface ProfileStatus {
  isPrivate: boolean;
  notFound: boolean;
  isAccessible: boolean;
}

/**
 * Navigate to a profile and wait for it to load.
 */
export async function navigateToProfile(
  page: Page,
  username: string,
  options?: { timeout?: number; waitForHeader?: boolean }
): Promise<void> {
  const { timeout = 20000, waitForHeader = false } = options || {};

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: 'networkidle2',
    timeout,
  });

  // Wait for profile content to load
  await sleep(3000);

  if (waitForHeader) {
    try {
      await page.waitForSelector('header', { timeout: 5000 });
    } catch {
      // Header not found, but continue anyway
    }
  }
}

/**
 * Check profile status (private, not found, accessible).
 */
export async function checkProfileStatus(page: Page): Promise<ProfileStatus> {
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  const status = parseProfileStatus(bodyText);

  return {
    isPrivate: status.isPrivate,
    notFound: status.notFound,
    isAccessible: !status.isPrivate && !status.notFound,
  };
}

/**
 * Ensure we're logged in, re-logging if necessary.
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  // Check if logged in by looking for inbox link
  const inboxLink = await page.$('a[href="/direct/inbox/"]');
  if (inboxLink !== null) {
    return; // Already logged in
  }

  // Need to log in
  if (!IG_USER || !IG_PASS) {
    throw new Error('Instagram credentials not configured');
  }

  await login(
    page,
    { username: IG_USER, password: IG_PASS },
    { skipIfLoggedIn: false }
  );
}

/**
 * Navigate to profile and ensure it's accessible.
 * Returns status information.
 */
export async function navigateToProfileAndCheck(
  page: Page,
  username: string,
  options?: { timeout?: number; waitForHeader?: boolean }
): Promise<ProfileStatus> {
  await navigateToProfile(page, username, options);
  return await checkProfileStatus(page);
}
