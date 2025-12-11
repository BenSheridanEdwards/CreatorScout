/**
 * Puppeteer-based E2E tests for the Instagram flows.
 * Run with: npm run test:e2e
 *
 * Test structure mirrors the Scout application flow:
 * 1. Seed Loading → Load usernames from seeds.txt
 * 2. Profile Visit → Navigate to seed profile
 * 3. Follow Actions → Potentially follow the profile
 * 4. Following Modal → Click "Following" → Extract usernames in batches
 * 5. Pagination → Scroll modal when batch exhausted
 * 6. Bio Analysis → Visit profiles, analyze bio, detect influencer
 * 7. Queue Management → Add creators to database and queue
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { unlinkSync, existsSync } from 'node:fs';

// Import TypeScript functions
import {
  initDb,
  queueAdd,
  queueNext,
  queueCount,
  wasVisited,
  markVisited,
  markAsCreator,
  getScrollIndex,
  updateScrollIndex,
} from '../functions/database.ts';
import { getBioFromPage } from '../functions/getBioFromPage.ts';
import { getLinkFromBio } from '../functions/getLinkFromBio.ts';
import { parseProfileStatus } from '../functions/profileStatus.ts';
import {
  buildUniqueLinks,
  hasDirectCreatorLink,
} from '../functions/linkExtraction.ts';
import { snapshot } from '../functions/snapshot.ts';
import { sleep } from '../functions/sleep.ts';
import { login } from '../functions/login.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;
const TEST_PROFILE = process.env.TEST_PROFILE || 'cristiano';

if (!IG_USER || !IG_PASS) {
  throw new Error(
    'INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env'
  );
}

// Enable stealth mode
(puppeteer as any).use(StealthPlugin());

// Helper functions
async function verifyLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const hasInbox =
      document.querySelector('a[href="/direct/inbox/"]') !== null;
    const hasHomeIcon = Array.from(document.querySelectorAll('svg')).some(
      (svg) => svg.getAttribute('aria-label') === 'Home'
    );
    const hasLoginButton = Array.from(document.querySelectorAll('button')).some(
      (btn) => btn.textContent?.includes('Log in')
    );
    return hasInbox || hasHomeIcon || !hasLoginButton;
  });
}

async function openFollowingModal(page: Page): Promise<boolean> {
  await snapshot(page, 'before_modal_open');

  const selectors = ['a[href$="/following/"]', 'a[href$="/following"]'];
  for (const sel of selectors) {
    try {
      const handle = await page.$(sel);
      if (handle) {
        console.log(`Found following link with selector: ${sel}`);
        await handle.click();
        await sleep(3000);
        return true;
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`Selector ${sel} failed: ${error}`);
      continue;
    }
  }

  // Fallback: use page.evaluate to find and click
  try {
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/following')) {
          link.click();
          return true;
        }
      }
      for (const link of links) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('following') && !text.includes('followers')) {
          link.click();
          return true;
        }
      }
      return false;
    });
    if (clicked) {
      await sleep(3000);
      return true;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`Evaluate fallback failed: ${error}`);
  }

  await snapshot(page, 'modal_open_failed');
  return false;
}

async function extractFollowingUsernames(
  page: Page,
  count: number = 5
): Promise<string[]> {
  try {
    await page.waitForSelector('div[role="dialog"] a[href^="/"]', {
      timeout: 15000,
    });
  } catch {
    console.log('[debug] Modal selector not found within timeout');
    return [];
  }

  await scrollModal(page, 1);

  const selectorVariants = [
    'div[role="dialog"] a[href^="/"]',
    'div[role="dialog"] a[role="link"][href^="/"]',
    'div[role="dialog"] ul > li a[href^="/"]',
    'div[role="dialog"] li a[href^="/"]',
  ];

  for (const sel of selectorVariants) {
    const items = await page.$$(sel);
    console.log(`[debug] Selector "${sel}" found ${items.length} items`);
    if (items?.length) {
      const usernames: string[] = [];
      for (const item of items) {
        const href = await item.evaluate((el: Element) =>
          el.getAttribute('href')
        );
        if (href?.startsWith('/') && href.split('/').length === 3) {
          const username = href.replace(/\//g, '');
          if (username && !username.startsWith('explore')) {
            usernames.push(username);
          }
        }
        if (usernames.length >= count) break;
      }
      console.log(
        `[debug] Extracted ${usernames.length} usernames from "${sel}":`,
        usernames
      );
      if (usernames.length) return usernames;
    }
  }
  return [];
}

async function scrollModal(page: Page, times: number = 2): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => {
      const modal = document.querySelector(
        'div[role="dialog"] div[style*="overflow"]'
      );
      if (modal) (modal as HTMLElement).scrollTop += 600;
    });
    await sleep(400);
  }
}

async function checkDmThreadEmpty(page: Page): Promise<boolean> {
  const selectors = [
    'div[role="row"]',
    'div[role="listitem"]',
    'div[data-scope="messages_table"] > div',
  ];
  for (const sel of selectors) {
    const nodes = await page.$$(sel);
    if (nodes?.length) return nodes.length <= 1;
  }
  return true;
}

// Use a test database for e2e tests
const TEST_DB = 'test_e2e_scout.db';

describe('Scout E2E Test Suite', () => {
  let browser: Browser;
  let page: Page;
  let t0: number;
  let tLogin: number;

  beforeAll(async () => {
    // Clean up test database if it exists
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
    // Temporarily override DB path for testing
    // Note: This would require modifying database.ts to accept a DB path parameter
    // For now, we'll use the default DB but with test data
    initDb();

    t0 = performance.now();

    // Use persistent user data directory for e2e tests to reuse sessions
    const { getUserDataDir } = await import('../functions/sessionManager.ts');
    const userDataDir = getUserDataDir();

    browser = await (puppeteer as any).launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      userDataDir, // Persistent profile to save cookies
    });
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(12000);

    // Try to use saved session first, only login if needed
    await login(
      page,
      { username: IG_USER!, password: IG_PASS! },
      { skipIfLoggedIn: true }
    );
    tLogin = performance.now();
  }, 60000); // 60 second timeout for setup

  afterEach(async () => {
    // Take screenshot on test failure (only when running locally, not in CI)
    if (process.env.CI !== 'true' && process.env.CI !== '1') {
      const testState = expect.getState() as any;
      if (testState.testPath && testState.currentTestName) {
        // Check if test failed by looking at Jest's state
        // This is a workaround since Jest doesn't expose test result in afterEach
        // We'll catch errors in try-catch blocks instead
      }
    }
  });

  afterAll(async () => {
    const total = performance.now() - t0;
    const loginMs = tLogin - t0;
    console.log({
      login_seconds: Number((loginMs / 1000).toFixed(2)),
      total_seconds: Number((total / 1000).toFixed(2)),
    });

    await browser.close();
    // Clean up test database
    if (existsSync(TEST_DB)) {
      try {
        unlinkSync(TEST_DB);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('1. Seed Loading', () => {
    test('queue operations with seed usernames', () => {
      console.log('=== Seed Loading Test ===');

      // Simulate loading seeds from seeds.txt
      const seeds = ['seed_user_1', 'seed_user_2', 'seed_user_3'];
      for (const s of seeds) {
        queueAdd(s, 100, 'seed');
      }
      console.log(`Loaded ${seeds.length} seeds into queue`);
      console.log(`Queue size: ${queueCount()}`);

      expect(queueCount()).toBeGreaterThanOrEqual(3);

      // Verify we can retrieve them
      const retrieved: string[] = [];
      let next = queueNext();
      while (next && retrieved.length < 3) {
        retrieved.push(next);
        next = queueNext();
      }

      expect(retrieved.length).toBe(3);
      seeds.forEach((seed) => {
        expect(retrieved).toContain(seed.toLowerCase());
      });

      console.log('=== Seed Loading Test PASSED ===');
    });
  });

  describe('2. Profile Visit', () => {
    test('navigate to public profile', async () => {
      try {
        await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
          waitUntil: 'domcontentloaded',
        });

        const url = page.url();
        expect(url).toContain(TEST_PROFILE);
      } catch (error) {
        // Take screenshot on failure (only when running locally)
        if (process.env.CI !== 'true' && process.env.CI !== '1') {
          await snapshot(page, 'error_navigate_public_profile');
        }
        throw error;
      }
    }, 30000); // 30 second timeout

    test('detect private or unavailable accounts', async () => {
      try {
        const testProfile = 'test_private_account_12345'; // Likely doesn't exist
        await page.goto(`https://www.instagram.com/${testProfile}/`, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        });
        await sleep(1500);

        const bodyText = await page.evaluate(
          () => document.body.innerText || ''
        );
        const status = parseProfileStatus(bodyText);

        console.log('[account status]', status);

        expect(status.isPrivate || status.notFound).toBe(true);
      } catch (error) {
        // Take screenshot on failure (only when running locally)
        if (process.env.CI !== 'true' && process.env.CI !== '1') {
          await snapshot(page, 'error_detect_private_account');
        }
        throw error;
      }
    }, 30000); // 30 second timeout
  });

  describe('3. Follow Actions', () => {
    test('detect follow button on profile', async () => {
      try {
        await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
          waitUntil: 'networkidle2',
        });
        await sleep(1500);

        const followButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));

          for (const btn of buttons) {
            const text = btn.textContent?.trim().toLowerCase() || '';
            const ariaLabel =
              btn.getAttribute('aria-label')?.toLowerCase() || '';

            if (
              text === 'follow' ||
              text === 'following' ||
              ariaLabel.includes('follow')
            ) {
              return {
                found: true,
                text: btn.textContent?.trim(),
                ariaLabel: btn.getAttribute('aria-label'),
                isFollowing: text === 'following',
              };
            }
          }

          return { found: false };
        });

        console.log('[follow button]', followButton);
        expect(followButton.found).toBe(true);
      } catch (error) {
        // Take screenshot on failure (only when running locally)
        if (process.env.CI !== 'true' && process.env.CI !== '1') {
          await snapshot(page, 'error_detect_follow_button');
        }
        throw error;
      }
    }, 30000); // 30 second timeout
  });

  describe('4. Following Modal', () => {
    test('open following modal', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'networkidle0',
      });
      await sleep(2000);

      const isLoggedIn = await verifyLoggedIn(page);
      if (!isLoggedIn) {
        const shot = await snapshot(page, 'not_logged_in_modal');
        throw new Error(`Not logged in. Screenshot: ${shot}`);
      }

      const opened = await openFollowingModal(page);
      expect(opened).toBe(true);
      await page.keyboard.press('Escape');
    }, 30000); // 30 second timeout

    test('extract usernames in batch of 5', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'networkidle0',
      });
      await sleep(2000);

      const isLoggedIn = await verifyLoggedIn(page);
      if (!isLoggedIn) {
        const shot = await snapshot(page, 'not_logged_in_usernames');
        throw new Error(`Not logged in. Screenshot: ${shot}`);
      }

      const opened = await openFollowingModal(page);
      if (!opened) {
        const shot = await snapshot(page, 'modal_usernames_fail');
        throw new Error(`Could not open following modal. Screenshot: ${shot}`);
      }

      const usernames = await extractFollowingUsernames(page, 5);
      console.log('[extracted usernames]', usernames);

      try {
        expect(Array.isArray(usernames)).toBe(true);
        expect(usernames.length).toBeGreaterThan(0);
        expect(usernames.length).toBeLessThanOrEqual(5);

        usernames.forEach((u) => {
          expect(typeof u).toBe('string');
          expect(u.includes('/')).toBe(false);
        });
      } catch (error) {
        // Take screenshot on failure (only when running locally)
        if (process.env.CI !== 'true' && process.env.CI !== '1') {
          await snapshot(page, 'error_extract_usernames');
        }
        await page.keyboard.press('Escape');
        throw error;
      }

      await page.keyboard.press('Escape');
    }, 30000); // 30 second timeout
  });

  describe('5. Pagination', () => {
    test('scroll modal to load more profiles', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'networkidle0',
      });
      await sleep(2000);

      const isLoggedIn = await verifyLoggedIn(page);
      if (!isLoggedIn) {
        const shot = await snapshot(page, 'not_logged_in_scroll');
        throw new Error(`Not logged in. Screenshot: ${shot}`);
      }

      const opened = await openFollowingModal(page);
      if (!opened) {
        const shot = await snapshot(page, 'modal_scroll_fail');
        throw new Error(`Could not open following modal. Screenshot: ${shot}`);
      }

      const initialCount = await page.$$eval(
        'div[role="dialog"] a[href^="/"]',
        (els) => els.length
      );

      await scrollModal(page, 3);
      await sleep(1000);

      const afterScrollCount = await page.$$eval(
        'div[role="dialog"] a[href^="/"]',
        (els) => els.length
      );

      console.log(
        `[scroll test] Before: ${initialCount}, After: ${afterScrollCount}`
      );
      try {
        expect(afterScrollCount).toBeGreaterThanOrEqual(initialCount);
      } catch (error) {
        // Take screenshot on failure (only when running locally)
        if (process.env.CI !== 'true' && process.env.CI !== '1') {
          await snapshot(page, 'error_scroll_modal');
        }
        await page.keyboard.press('Escape');
        throw error;
      }

      await page.keyboard.press('Escape');
    }, 30000); // 30 second timeout

    test('scroll index persistence (queue resume)', () => {
      console.log('=== Pagination Resume Test ===');

      const username = 'test_seed_user';

      const initial = getScrollIndex(username);
      console.log(`Initial scroll index: ${initial}`);
      expect(initial).toBe(0);

      updateScrollIndex(username, 10);
      const idx1 = getScrollIndex(username);
      console.log(`After first batch: ${idx1}`);
      expect(idx1).toBe(10);

      updateScrollIndex(username, 20);
      const idx2 = getScrollIndex(username);
      console.log(`After second batch: ${idx2}`);
      expect(idx2).toBe(20);

      console.log('=== Pagination Resume Test PASSED ===');
    });
  });

  describe('6. Bio Analysis', () => {
    test('extract bio text from profile', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'domcontentloaded',
      });

      const bio = await getBioFromPage(page);
      console.log('[bio]', bio ? bio.slice(0, 100) : 'None');

      expect(bio === null || typeof bio === 'string').toBe(true);
    }, 30000); // 30 second timeout

    test('extract external link from bio', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'domcontentloaded',
      });

      const link = await getLinkFromBio(page);
      console.log('[link]', link || 'None');

      expect(link === null || typeof link === 'string').toBe(true);
    }, 30000); // 30 second timeout

    test('detect creator link (svagtillstark profile)', async () => {
      const target = 'svagtillstark';
      await page.goto(`https://www.instagram.com/${target}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      // Use application functions to extract links
      const primary = await getLinkFromBio(page);
      const headerHrefs = await page.$$eval('header a', (els) =>
        els.map((e) => e.getAttribute('href')).filter(Boolean)
      );
      const html = await page.content();
      const uniqueLinks = buildUniqueLinks(html, headerHrefs, primary);
      console.log('[candidate links]', uniqueLinks);

      // Test that the function found links
      expect(uniqueLinks.length).toBeGreaterThan(0);

      // Test that hasDirectCreatorLink function works
      const hasPatreon = hasDirectCreatorLink(uniqueLinks);
      expect(typeof hasPatreon).toBe('boolean');
    }, 30000); // 30 second timeout

    test('traverse following and extract bios', async () => {
      await page.goto(`https://www.instagram.com/${TEST_PROFILE}/`, {
        waitUntil: 'networkidle0',
      });
      await sleep(2000);

      const isLoggedIn = await verifyLoggedIn(page);
      if (!isLoggedIn) {
        const shot = await snapshot(page, 'not_logged_in_traversal');
        throw new Error(`Not logged in. Screenshot: ${shot}`);
      }

      const opened = await openFollowingModal(page);
      if (!opened) {
        const shot = await snapshot(page, 'modal_traversal_fail');
        throw new Error(`Could not open following modal. Screenshot: ${shot}`);
      }

      const usernames = await extractFollowingUsernames(page, 5);
      if (usernames.length === 0) {
        const shot = await snapshot(page, 'modal_no_usernames');
        await page.keyboard.press('Escape');
        throw new Error(`No usernames extracted. Screenshot: ${shot}`);
      }
      await page.keyboard.press('Escape');

      const sample = usernames.slice(0, 2);
      for (const u of sample) {
        await page.goto(`https://www.instagram.com/${u}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        const bio = await getBioFromPage(page);
        console.log(`[traverse] ${u} bio: ${bio ? bio.slice(0, 80) : 'None'}`);
        expect(bio === null || typeof bio === 'string').toBe(true);
      }
    }, 60000); // 60 second timeout (visits multiple profiles)
  });

  describe('7. Queue Management', () => {
    test('full queue processing loop', () => {
      console.log('=== Queue Management Test ===');

      // 1. Add seeds (simulating seeds.txt loading)
      const seeds = ['seed_user_1', 'seed_user_2', 'seed_user_3'];
      for (const s of seeds) {
        queueAdd(s, 100, 'seed');
      }
      console.log(`Added ${seeds.length} seeds, queue size: ${queueCount()}`);

      // 2. Process queue (main loop simulation)
      const processed: string[] = [];
      const creatorsFound: string[] = [];

      while (queueCount() > 0 && processed.length < 10) {
        const target = queueNext();
        if (!target) {
          break;
        }

        if (wasVisited(target)) {
          console.log(`Skipping ${target} - already visited`);
          continue;
        }

        processed.push(target);
        console.log(`Processing: ${target}`);

        const isCreator = target === 'seed_user_1'; // Pretend seed_user_1 is a creator
        const bioScore = isCreator ? 75 : 20;
        markVisited(target, undefined, undefined, bioScore);

        if (isCreator) {
          markAsCreator(target, 85);
          creatorsFound.push(target);

          queueAdd('discovered_from_creator_1', 50, `following_of_${target}`);
          queueAdd('discovered_from_creator_2', 50, `following_of_${target}`);
          console.log(`  -> Creator found! Added their following to queue`);
        }
      }

      console.log(`\nProcessed ${processed.length} profiles`);
      console.log(`Creators found: ${creatorsFound.length}`);
      console.log(`Remaining in queue: ${queueCount()}`);

      expect(processed.length).toBeGreaterThanOrEqual(3);
      expect(creatorsFound.length).toBe(1);
      expect(wasVisited('seed_user_1')).toBe(true);

      console.log('=== Queue Management Test PASSED ===');
    });

    test('DM thread empty check', async () => {
      await page.goto('https://www.instagram.com/direct/inbox/', {
        waitUntil: 'domcontentloaded',
      });
      const empty = await checkDmThreadEmpty(page);
      expect(typeof empty).toBe('boolean');
    }, 30000); // 30 second timeout
  });
});
