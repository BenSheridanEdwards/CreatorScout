// Standalone test to check if a specific profile is an Patreon model
// Run with: TEST_USERNAME=someprofile npm run test:profile
//
// Example:
//   TEST_USERNAME=svagtillstark npm run test:profile

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;
const TEST_USERNAME = process.env.TEST_USERNAME;

if (!IG_USER || !IG_PASS) {
  throw new Error(
    'INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env'
  );
}

if (!TEST_USERNAME) {
  throw new Error(
    'TEST_USERNAME must be set. Run with: TEST_USERNAME=someprofile npm run test:profile'
  );
}

console.log(`\n🔍 Checking profile: @${TEST_USERNAME}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page, label) {
  await fs.mkdir('tmp', { recursive: true });
  const ts = Date.now();
  const file = `tmp/${label}-${ts}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function clickAny(page, texts) {
  for (const t of texts) {
    const handle = await page.$(
      `xpath//button[contains(normalize-space(), "${t}")]`
    );
    if (handle) {
      await handle.click({ delay: 10 });
      await sleep(200);
      return true;
    }
  }
  return false;
}

async function login(page) {
  await page.goto('https://www.instagram.com/', {
    waitUntil: 'networkidle2',
    timeout: 15000,
  });

  await clickAny(page, [
    'Allow all cookies',
    'Allow essential and optional cookies',
    'Decline optional cookies',
  ]);

  try {
    await page.waitForSelector('input[name="username"]', { timeout: 5000 });
  } catch {
    const loggedIn = await page.$('a[href="/direct/inbox/"]');
    if (loggedIn) return;
    throw new Error('Could not find login form');
  }

  await page.type('input[name="username"]', IG_USER, { delay: 5 });
  await page.type('input[name="password"]', IG_PASS, { delay: 5 });
  await page.click('button[type="submit"]');

  try {
    await page.waitForSelector('a[href="/direct/inbox/"]', { timeout: 10000 });
  } catch {
    const errorText = await page.evaluate(() => {
      const el = document.body;
      return (
        el?.innerText?.includes("couldn't connect") ||
        el?.innerText?.includes('incorrect') ||
        el?.innerText?.includes('Sorry')
      );
    });
    if (errorText) {
      const shot = await snapshot(page, 'login_failed');
      throw new Error(`Login failed - see ${shot}`);
    }
  }

  await clickAny(page, ['Not Now', 'Not now', 'Skip']);
  await clickAny(page, ['Not Now', 'Not now', 'Skip']);
}

async function getBioFromPage(page) {
  const selectors = [
    'header section > div.-vDIg > span',
    'header section span:not([class])',
    'div[class*="biography"]',
    'section > div > span',
    'header section h1 + span',
    'header section h1 + div span',
    'header section div[role="presentation"] span',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const txt = await el.evaluate((node) => node.innerText);
        const trimmed = txt?.trim();
        if (trimmed) return trimmed;
      }
    } catch {
      continue;
    }
  }
  const header = await page.$('header');
  if (header) {
    const txt = await header.evaluate((node) => node.innerText);
    return txt || null;
  }
  return null;
}

async function getLinkFromBio(page) {
  const linkSelectors = [
    'header a[href*="linktr.ee"]',
    'header a[href*="beacons.ai"]',
    'header a[href*="allmylinks"]',
    'header a[href*="patreon.com"]',
    'header a[rel*="nofollow"]',
    'header section a[target="_blank"]',
  ];
  for (const sel of linkSelectors) {
    const el = await page.$(sel);
    if (el) {
      const href = await el.evaluate((node) => node.getAttribute('href'));
      if (href) return href;
    }
  }
  return null;
}

test(`Check if @${TEST_USERNAME} is an Patreon model`, async (t) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(20000);
  page.setDefaultTimeout(12000);

  t.after(async () => {
    await browser.close();
  });

  // Login
  console.log('📱 Logging into Instagram...');
  await login(page);
  console.log('✅ Logged in\n');

  // Navigate to profile
  console.log(`🔗 Navigating to @${TEST_USERNAME}...`);
  await page.goto(`https://www.instagram.com/${TEST_USERNAME}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await sleep(1500);

  // Check if profile exists
  const profileStatus = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    const isPrivate =
      bodyText.includes('This account is private') ||
      bodyText.includes('This Account is Private');
    const notFound =
      bodyText.includes("Sorry, this page isn't available") ||
      bodyText.includes('Page Not Found') ||
      bodyText.includes("Profile isn't available") ||
      bodyText.includes('may have been removed');
    return { isPrivate, notFound };
  });

  if (profileStatus.notFound) {
    console.log('❌ Profile not found or unavailable\n');
    assert.fail(`Profile @${TEST_USERNAME} does not exist or is unavailable`);
  }

  if (profileStatus.isPrivate) {
    console.log('🔒 Profile is private - cannot check for creator links\n');
    t.diagnostic('Profile is private');
    return;
  }

  console.log('✅ Profile found\n');

  // Extract bio
  console.log('📝 Extracting bio...');
  const bio = await getBioFromPage(page);
  if (bio) {
    console.log(
      `Bio: "${bio.slice(0, 150)}${bio.length > 150 ? '...' : ''}"\n`
    );
  } else {
    console.log('Bio: (none found)\n');
  }

  // Collect all candidate links
  console.log('🔗 Searching for external links...');
  const candidates = new Set();

  // Method 1: Direct link extraction
  const primary = await getLinkFromBio(page);
  if (primary) {
    console.log(`  Found bio link: ${primary}`);
    candidates.add(primary);
  }

  // Method 2: All header links
  const headerHrefs = await page.$$eval('header a', (els) =>
    els.map((e) => e.getAttribute('href')).filter(Boolean)
  );
  headerHrefs.forEach((h) => candidates.add(h));

  // Method 3: URL matching in page HTML
  const html = await page.content();
  const urlMatches = html.match(/https?:\/\/[^"'\\s]+/gi) || [];
  urlMatches
    .filter((u) => /linktr\.ee|patreon\.com|beacons\.ai|allmylinks/i.test(u))
    .forEach((u) => candidates.add(u));

  // Method 4: external_url JSON field
  const jsonLink = html.match(/\"external_url\":\"(https?:[^\"\\s]+)\"/i);
  if (jsonLink) candidates.add(jsonLink[1].replace(/\\u0026/g, '&'));

  // Method 5: Hydration globals
  try {
    const hydrUrl = await page.evaluate(() => {
      const w = window;
      const fromAdditional = (() => {
        const data = w.__additionalData;
        if (!data) return null;
        for (const key of Object.keys(data)) {
          const node = data[key];
          const u =
            node?.data?.user?.external_url ||
            node?.graphql?.user?.external_url ||
            node?.entry_data?.ProfilePage?.[0]?.graphql?.user?.external_url;
          if (u) return u;
        }
        return null;
      })();
      if (fromAdditional) return fromAdditional;
      const sd = w._sharedData;
      if (sd?.entry_data?.ProfilePage?.[0]?.graphql?.user?.external_url) {
        return sd.entry_data.ProfilePage[0].graphql.user.external_url;
      }
      return null;
    });
    if (hydrUrl) candidates.add(hydrUrl);
  } catch (e) {
    t.diagnostic(`Hydration parse failed: ${e}`);
  }

  // Method 6: API fallback
  try {
    const apiLink = await page.evaluate(async (username) => {
      try {
        const res = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
          {
            credentials: 'include',
            headers: {
              'X-IG-App-ID': '936619743392459',
              'X-Requested-With': 'XMLHttpRequest',
            },
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data?.user?.external_url || null;
      } catch (_) {
        return null;
      }
    }, TEST_USERNAME);
    if (apiLink) candidates.add(apiLink);
  } catch (e) {
    t.diagnostic(`API fallback failed: ${e}`);
  }

  // Filter to only external links (http/https)
  const unique = [...candidates].filter(
    (u) => u && u.startsWith('http') && !u.includes('instagram.com')
  );
  console.log(`\n📋 Found ${unique.length} external link(s):`);
  unique.forEach((u) => console.log(`  - ${u}`));

  if (!unique.length) {
    console.log('\n❌ No external links found\n');
    console.log('='.repeat(50));
    console.log(`RESULT: @${TEST_USERNAME} is NOT detected as Patreon model`);
    console.log('        (no external links in bio)');
    console.log('='.repeat(50));
    return;
  }

  // Check for direct creator link
  let hasPatreon = unique.some((u) =>
    u.toLowerCase().includes('patreon.com')
  );

  if (hasPatreon) {
    console.log('\n✅ Direct creator link found!\n');
  }

  // Follow link aggregators to find Patreon
  if (!hasPatreon) {
    console.log('\n🔍 Following link aggregators to check for Patreon...');

    // Filter to likely link aggregators (not threads, not instagram)
    const aggregators = unique.filter((u) =>
      /linktr\.ee|link\.me|beacons\.ai|allmylinks|linkin\.bio|bio\.link|stan\.store|fanhouse/i.test(
        u
      )
    );

    if (aggregators.length === 0) {
      console.log('  No link aggregators found to check');
    }

    for (const u of aggregators) {
      if (hasPatreon) break;

      const url = u.startsWith('http')
        ? u
        : `https://${u.replace(/^[\\/]+/, '')}`;
      const safeUrl = url.replace(/^http:\/\//i, 'https://');

      console.log(`  Checking: ${safeUrl}`);

      // Use Puppeteer to load JavaScript-rendered pages
      const extPage = await browser.newPage();
      try {
        const response = await extPage.goto(safeUrl, {
          waitUntil: 'networkidle2',
          timeout: 15000,
        });

        const finalUrl = response?.url() || safeUrl;
        if (finalUrl.toLowerCase().includes('patreon.com')) {
          console.log(`    → Redirects to Patreon!`);
          hasPatreon = true;
          await extPage.close();
          break;
        }

        // Wait a moment for JS to render
        await sleep(2000);

        // Screenshot the link aggregator page
        const linkShot = await snapshot(extPage, `linkagg_${TEST_USERNAME}`);
        console.log(`    📸 Screenshot: ${linkShot}`);

        const pageContent = await extPage.content();
        const pageText = await extPage.evaluate(() => document.body.innerText);
        const lowerContent = pageContent.toLowerCase();
        const lowerText = pageText.toLowerCase();

        // Check for various premium content platforms
        const platforms = [
          { name: 'Patreon', patterns: ['patreon.com', 'patreon'] },
          { name: 'Ko-fi', patterns: ['ko-fi.com', 'ko-fi'] },
          { name: 'Fanvue', patterns: ['fanvue.com', 'fanvue'] },
          { name: 'Sheer', patterns: ['sheer.com'] },
          { name: 'Fanhouse', patterns: ['fanhouse.com', 'fanhouse.app'] },
        ];

        for (const platform of platforms) {
          for (const pattern of platform.patterns) {
            if (lowerContent.includes(pattern) || lowerText.includes(pattern)) {
              console.log(`    → Contains ${platform.name} link!`);
              if (platform.name === 'Patreon') {
                hasPatreon = true;
              } else {
                t.diagnostic(`Found ${platform.name} (not Patreon)`);
              }
              break;
            }
          }
          if (hasPatreon) break;
        }

        if (!hasPatreon) {
          console.log(`    → No Patreon found`);
        }
      } catch (e) {
        console.log(`    → Failed to load: ${e.message}`);
      } finally {
        await extPage.close().catch(() => {});
      }
    }
  }

  // Final result
  console.log('\n' + '='.repeat(50));
  if (hasPatreon) {
    console.log(`✅ RESULT: @${TEST_USERNAME} IS an Patreon model`);
  } else {
    console.log(
      `❌ RESULT: @${TEST_USERNAME} is NOT detected as Patreon model`
    );
  }
  console.log('='.repeat(50) + '\n');

  // Save screenshot
  const shot = await snapshot(page, `profile_${TEST_USERNAME}`);
  console.log(`📸 Screenshot saved: ${shot}\n`);
});
