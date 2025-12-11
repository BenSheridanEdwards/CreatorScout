import type { Page } from 'puppeteer';
import { clickAny } from '../../navigation/clickAny/clickAny.ts';
import {
  loadCookies,
  saveCookies,
  isLoggedIn,
} from '../sessionManager/sessionManager.ts';

export type Credentials = {
  username: string;
  password: string;
};

export async function login(
  page: Page,
  creds: Credentials,
  options?: { skipIfLoggedIn?: boolean }
): Promise<void> {
  // Navigate to Instagram first (required before setting cookies)
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });

  // Try to load saved cookies after navigation
  const cookiesLoaded = await loadCookies(page);

  // Check if we're already logged in (either from cookies or previous session)
  if (options?.skipIfLoggedIn !== false) {
    // Wait a moment for cookies to take effect
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const alreadyLoggedIn = await isLoggedIn(page);
    if (alreadyLoggedIn) {
      console.log('   ✅ Already logged in (using saved session)');
      // Refresh cookies to extend expiration
      await saveCookies(page);
      return;
    }
  }

  // If cookies were loaded but we're not logged in, they may be expired
  if (cookiesLoaded) {
    console.log(
      '   ⚠️  Cookies loaded but session expired, logging in again...'
    );
  }

  // Reload page to ensure we're on the login page
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'networkidle2',
    timeout: 15000,
  });

  await clickAny(page, [
    'Allow all cookies',
    'Allow essential and optional cookies',
    'Decline optional cookies',
  ]);

  // Wait for login form or already logged in state
  try {
    await page.waitForSelector('input[name="username"]', { timeout: 5000 });
  } catch {
    // Check if we're already logged in (maybe cookies worked)
    const loggedIn = await page.$('a[href="/direct/inbox/"]');
    if (loggedIn) {
      console.log('   ✅ Already logged in (cookies restored session)');
      // Save cookies again to refresh expiration
      await saveCookies(page);
      return;
    }
    throw new Error('Could not find login form');
  }

  console.log('   Filling in credentials...');
  await page.type('input[name="username"]', creds.username, { delay: 5 });
  await page.type('input[name="password"]', creds.password, { delay: 5 });
  console.log('   Submitting login form...');
  await page.click('button[type="submit"]');

  // Wait for navigation after login
  console.log('   Waiting for login to complete...');
  try {
    await page.waitForSelector('a[href="/direct/inbox/"]', { timeout: 15000 });
    console.log('   Login successful - inbox link found');

    // Save cookies after successful login
    await saveCookies(page);
  } catch {
    const currentUrl = page.url();
    console.log(`   Login timeout - current URL: ${currentUrl}`);

    // Check if login failed with an error message
    const errorText = await page.evaluate(() => {
      const el = document.body;
      return (
        el?.innerText?.includes("couldn't connect") ||
        el?.innerText?.includes('incorrect') ||
        el?.innerText?.includes('Sorry') ||
        el?.innerText?.includes('suspended') ||
        el?.innerText?.includes('challenge') ||
        el?.innerText?.includes('verify') ||
        el?.innerText?.includes('suspicious')
      );
    });
    if (errorText) {
      const bodyText = await page.evaluate(() => document.body.innerText || '');
      const errorPreview = bodyText.substring(0, 300).replace(/\n/g, ' ');
      throw new Error(
        `Login failed - Instagram may be showing an error or challenge. Page preview: ${errorPreview}`
      );
    }
    // Check if we're already on a different page (maybe logged in but different UI)
    if (
      currentUrl.includes('instagram.com') &&
      !currentUrl.includes('/accounts/login')
    ) {
      console.log(
        '   ⚠️  Login may have succeeded but inbox link not found. Continuing anyway...'
      );
      // Try to continue - might be logged in but UI changed
      return;
    }
    throw new Error(
      'Login timeout - could not find inbox link after 15 seconds. Instagram may be blocking headless browsers or requiring verification.'
    );
  }

  // Dismiss popups
  await clickAny(page, ['Not Now', 'Not now', 'Skip']);
  await clickAny(page, ['Not Now', 'Not now', 'Skip']);
}
