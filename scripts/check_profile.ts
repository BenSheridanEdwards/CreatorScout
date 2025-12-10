/**
 * Reusable profile checker used by tests and app scripts.
 * Exposes runProfileCheck(username) that:
 *  - logs into Instagram (puppeteer + stealth)
 *  - loads profile, extracts bio + external links
 *  - follows link aggregators, screenshots, and calls Python vision pipeline
 * Returns structured result with reasons, indicators, confidence, and screenshots.
 *
 * Usage:
 *   node scripts/check_profile.js --user username
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { sleep } from '../functions/sleep.ts';
import { snapshot } from '../functions/snapshot.ts';
import { classifyWithApp } from '../functions/classifyWithApp.ts';
import { login } from '../functions/login.ts';
import { getBioFromPage } from '../functions/getBioFromPage.ts';
import { getLinkFromBio } from '../functions/getLinkFromBio.ts';
import {
  buildUniqueLinks,
  collectAggregatorLinks,
  hasDirectCreatorLink,
  toSafeHttps,
} from '../functions/linkExtraction.ts';
import { parseProfileStatus } from '../functions/profileStatus.ts';
import type { ProfileCheckResult } from '../functions/types.ts';

// puppeteer-extra typings don't expose .use; cast to any for plugin registration.
(puppeteer as any).use(StealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const IG_USER = process.env.INSTAGRAM_USERNAME;
const IG_PASS = process.env.INSTAGRAM_PASSWORD;

if (!IG_USER || !IG_PASS) {
  throw new Error(
    'INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env'
  );
}

async function runProfileCheck(username: string): Promise<ProfileCheckResult> {
  console.log(`\n🚀 Starting profile check for @${username}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('Step 1: Launching browser...');
  // Allow non-headless mode for debugging via HEADLESS=false env var
  const headless = process.env.HEADLESS !== 'false';
  console.log(`   Browser mode: ${headless ? 'headless' : 'headed (visible)'}`);
  const browser: Browser = await (puppeteer as any).launch({
    headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(20000);
  page.setDefaultTimeout(12000);
  console.log('✅ Browser launched');

  const result: ProfileCheckResult = {
    username,
    isCreator: false,
    confidence: 0,
    indicators: [],
    bio: null,
    links: [],
    screenshots: [],
    errors: [],
    reason: null,
  };

  try {
    console.log('Step 2: Logging into Instagram...');
    console.log(`   Username: ${IG_USER}`);
    await login(page, { username: IG_USER, password: IG_PASS });
    console.log('✅ Successfully logged in');

    console.log(`Step 3: Navigating to @${username} profile...`);
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });
    // Wait for profile content to load
    console.log('   Waiting for profile content to load...');
    await sleep(3000);
    // Try to wait for header to be present
    try {
      await page.waitForSelector('header', { timeout: 5000 });
    } catch {
      console.log('   ⚠️  Header not found, continuing anyway...');
    }
    console.log('✅ Profile page loaded');

    // Check profile availability
    console.log('Step 4: Checking profile availability...');
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    const status = parseProfileStatus(bodyText);
    if (status.notFound) {
      console.log('❌ Profile not found or unavailable');
      result.errors.push('Profile not found or unavailable');
      return result;
    }
    if (status.isPrivate) {
      console.log('🔒 Profile is private');
      result.errors.push('Profile is private');
      return result;
    }
    console.log('✅ Profile is accessible');

    // Bio and links
    console.log('Step 5: Extracting bio and links...');
    // Add a small delay to ensure page is fully rendered
    await sleep(1000);
    result.bio = await getBioFromPage(page);
    if (result.bio) {
      console.log(
        `   Bio found: ${result.bio.substring(0, 80)}${
          result.bio.length > 80 ? '...' : ''
        }`
      );
    } else {
      console.log('   No bio found');
      // Take screenshot if running locally and bio extraction failed
      const isLocal = process.env.HEADLESS === 'false' || !process.env.CI;
      if (isLocal) {
        try {
          const screenshotPath = await snapshot(
            page,
            `bio_extraction_failed_${username}`
          );
          console.log(
            `   📸 Screenshot saved for debugging: ${screenshotPath}`
          );
        } catch (e) {
          console.log(`   ⚠️  Could not take screenshot: ${e}`);
        }
      }
    }

    const primary = await getLinkFromBio(page);
    if (primary) {
      console.log(`   Primary link: ${primary}`);
    }
    const headerHrefs = await page.$$eval('header a', (els) =>
      els.map((e) => e.getAttribute('href')).filter(Boolean)
    );
    if (headerHrefs.length > 0) {
      console.log(`   Found ${headerHrefs.length} header links`);
    }
    const html = await page.content();
    const uniqueLinks = buildUniqueLinks(html, headerHrefs, primary);
    result.links = uniqueLinks;
    console.log(`✅ Found ${uniqueLinks.length} unique link(s)`);
    if (uniqueLinks.length > 0) {
      console.log('   Links:');
      uniqueLinks.forEach((link, idx) => {
        console.log(`     ${idx + 1}. ${link}`);
      });
    }

    // Direct Patreon shortcut
    console.log('Step 6: Checking for direct creator links...');
    if (hasDirectCreatorLink(uniqueLinks)) {
      console.log('🎯 Direct creator link detected!');
      result.isCreator = true;
      result.confidence = 90;
      result.reason = 'direct_patreon_link';
    } else {
      console.log('   No direct creator links found');
    }

    // Follow link aggregators if needed
    if (!result.isCreator && uniqueLinks.length) {
      console.log('Step 7: Checking link aggregators...');
      const aggregators = collectAggregatorLinks(uniqueLinks);
      console.log(`   Found ${aggregators.length} aggregator link(s) to check`);

      for (let i = 0; i < aggregators.length; i++) {
        if (result.isCreator) break;
        const u = aggregators[i];
        const safeUrl = toSafeHttps(u);
        console.log(`   [${i + 1}/${aggregators.length}] Checking: ${safeUrl}`);

        const extPage = await browser.newPage();
        try {
          const response = await extPage.goto(safeUrl, {
            waitUntil: 'networkidle2',
            timeout: 15000,
          });
          const finalUrl = response?.url() || safeUrl;
          console.log(`      Final URL: ${finalUrl}`);

          if (finalUrl.toLowerCase().includes('patreon.com')) {
            console.log('      🎯 Redirected to Patreon!');
            result.isCreator = true;
            result.confidence = 90;
            result.reason = 'redirect_patreon';
            await extPage.close();
            break;
          }

          console.log('      Taking screenshot for vision analysis...');
          await sleep(2000);
          const shot = await snapshot(extPage, `linkagg_${username}`);
          result.screenshots.push(shot);
          console.log(`      Screenshot saved: ${shot}`);

          console.log('      Running vision pipeline...');
          const visionResult = await classifyWithApp(shot);
          if (visionResult.ok) {
            console.log(
              `      ✅ Vision detected creator (confidence: ${
                visionResult.data?.confidence || 70
              }%)`
            );
            result.isCreator = true;
            result.confidence = visionResult.data?.confidence || 70;
            result.indicators = visionResult.data?.indicators || [];
            result.reason = visionResult.data?.reason || 'vision_detected';
            if (
              visionResult.data?.indicators &&
              visionResult.data.indicators.length > 0
            ) {
              console.log(
                `      Indicators: ${visionResult.data.indicators.join(', ')}`
              );
            }
          } else {
            console.log('      ❌ Vision analysis did not detect creator');
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.log(`      ⚠️  Error: ${message}`);
          result.errors.push(`Aggregator load failed: ${message}`);
        } finally {
          await extPage.close().catch(() => {});
        }
      }
    } else if (!result.isCreator) {
      console.log('Step 7: Skipped (no links to check)');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`❌ Error occurred: ${message}`);
    result.errors.push(message);

    // Take failure screenshot when running locally
    const isLocal = process.env.HEADLESS === 'false' || !process.env.CI;
    if (isLocal) {
      try {
        const screenshotPath = await snapshot(page, `error_${username}`);
        console.log(`   📸 Error screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        console.log(
          `   ⚠️  Could not take error screenshot: ${screenshotError}`
        );
      }
    }
  } finally {
    console.log('Step 8: Closing browser...');
    await browser.close().catch(() => {});
    console.log('✅ Browser closed');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return result;
}

// CLI usage
if (process.argv.includes('--user')) {
  const idx = process.argv.indexOf('--user');
  const user = process.argv[idx + 1];
  if (!user) {
    console.error('Usage: node scripts/check_profile.js --user <username>');
    process.exit(1);
  }
  runProfileCheck(user)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { runProfileCheck };
