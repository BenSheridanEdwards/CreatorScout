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
import type { Browser } from 'puppeteer';
import dotenv from 'dotenv';
import { snapshot } from '../functions/shared/snapshot/snapshot.ts';
import { classifyWithApp } from '../functions/profile/classifyWithApp/classifyWithApp.ts';
import {
  collectAggregatorLinks,
  hasDirectCreatorLink,
  toSafeHttps,
} from '../functions/extraction/linkExtraction/linkExtraction.ts';
import type { ProfileCheckResult } from '../functions/shared/types/types.ts';
import {
  createBrowser,
  createPage,
} from '../functions/navigation/browser/browser.ts';
import {
  navigateToProfileAndCheck,
  ensureLoggedIn,
} from '../functions/navigation/profileNavigation/profileNavigation.ts';
import { analyzeProfileComprehensive } from '../functions/profile/profileAnalysis/profileAnalysis.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function runProfileCheck(username: string): Promise<ProfileCheckResult> {
  console.log(`\n🚀 Starting profile check for @${username}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('Step 1: Launching browser...');
  // Allow non-headless mode for debugging via HEADLESS=false env var
  const headless = process.env.HEADLESS !== 'false';
  console.log(`   Browser mode: ${headless ? 'headless' : 'headed (visible)'}`);

  const browser: Browser = await createBrowser({ headless });
  const page = await createPage(browser);
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
    await ensureLoggedIn(page);
    console.log('✅ Successfully logged in');

    console.log(`Step 3: Navigating to @${username} profile...`);
    const status = await navigateToProfileAndCheck(page, username, {
      timeout: 20000,
      waitForHeader: true,
    });
    console.log('✅ Profile page loaded');

    // Check profile availability
    console.log('Step 4: Checking profile availability...');
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

    // Comprehensive profile analysis
    console.log('Step 5: Running comprehensive profile analysis...');
    const analysis = await analyzeProfileComprehensive(page, username);

    // Map analysis results to ProfileCheckResult
    result.bio = analysis.bio;
    result.links = analysis.links;
    result.confidence = analysis.confidence;
    result.indicators = analysis.indicators;
    result.screenshots = analysis.screenshots;
    result.isCreator = analysis.isCreator;
    result.reason = analysis.reason;

    console.log(`✅ Analysis complete`);
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

    console.log(`   Bio score: ${analysis.bioScore}`);
    if (analysis.stats) {
      console.log(
        `   Followers: ${analysis.stats.followers?.toLocaleString() || 'N/A'}`
      );
      console.log(
        `   Following: ${analysis.stats.following?.toLocaleString() || 'N/A'}`
      );
      if (analysis.stats.ratio) {
        console.log(`   Ratio: ${analysis.stats.ratio.toFixed(2)}`);
      }
    }
    if (analysis.highlights.length > 0) {
      console.log(`   Found ${analysis.highlights.length} highlight(s)`);
      analysis.highlights.forEach((h) => {
        console.log(`      - "${h.title}"`);
      });
    }
    console.log(`✅ Found ${result.links.length} unique link(s)`);
    if (result.links.length > 0) {
      console.log('   Links:');
      result.links.forEach((link, idx) => {
        console.log(`     ${idx + 1}. ${link}`);
      });
    }

    // Direct Patreon shortcut (already checked in comprehensive analysis, but log it)
    console.log('Step 6: Checking for direct creator links...');
    if (hasDirectCreatorLink(result.links)) {
      console.log('🎯 Direct creator link detected!');
      // Already set in comprehensive analysis
    } else {
      console.log('   No direct creator links found');
    }

    // Follow link aggregators if needed (unique to check_profile.ts)
    if (!result.isCreator && result.links.length) {
      console.log('Step 7: Checking link aggregators...');
      const aggregators = collectAggregatorLinks(result.links);
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

    // Final decision based on combined signals (already handled in comprehensive analysis)
    if (result.isCreator && result.reason === 'combined_signals') {
      console.log('Step 8: Combined signals indicate creator...');
      console.log(
        `   ✅ Flagged as creator (confidence: ${result.confidence}%)`
      );
      console.log(`   Indicators: ${result.indicators.join(', ')}`);
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
