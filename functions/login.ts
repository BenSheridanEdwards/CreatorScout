import type { Page } from 'puppeteer';
import { clickAny } from './clickAny.js';

export type Credentials = {
  username: string;
  password: string;
};

export async function login(page: Page, creds: Credentials): Promise<void> {
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
    const loggedIn = await page.$('a[href="/direct/inbox/"]');
    if (loggedIn) return;
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
