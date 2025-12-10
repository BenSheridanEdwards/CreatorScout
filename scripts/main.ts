/**
 * Scout - Instagram Patreon Creator Discovery Agent
 *
 * Flow:
 * 1. Go to seed profile → click Following → open modal
 * 2. Get <li> list items from following modal
 * 3. For each profile (batch of 10):
 *    - Skip if already visited
 *    - Click into profile, read bio
 *    - Keyword/emoji matching on bio (cheap)
 *    - If promising: click linktree, screenshot, vision analysis (expensive)
 * 4. If confirmed creator:
 *    - Check DM thread empty → send DM
 *    - Follow if not following
 *    - Mark in database
 *    - Click their Following → repeat process
 * 5. Pagination: if all 10 visited, scroll modal and get next batch
 */

import { readFileSync, existsSync } from 'node:fs';
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  initDb,
  queueAdd,
  queueNext,
  queueCount,
  wasVisited,
  markVisited,
  markAsCreator,
  wasDmSent,
  markDmSent,
  wasFollowed,
  markFollowed,
  getScrollIndex,
  updateScrollIndex,
  getStats,
} from '../functions/database.ts';
import { login } from '../functions/login.ts';
import { isLikelyCreator, calculateScore } from '../functions/bioMatcher.ts';
import { isConfirmedCreator } from '../functions/vision.ts';
import {
  delay,
  getDelay,
  getTimeout,
  humanScroll,
  mouseWiggle,
} from '../functions/humanize.ts';
import { saveProof } from '../functions/utils.ts';
import {
  MAX_DMS_PER_DAY,
  DM_MESSAGE,
  CONFIDENCE_THRESHOLD,
  SKIP_VISION,
  FAST_MODE,
  LOCAL_BROWSER,
  BROWSERLESS_TOKEN,
  IG_USER,
  IG_PASS,
} from '../functions/config.ts';
import { getBioFromPage } from '../functions/getBioFromPage.ts';
import { getLinkFromBio } from '../functions/getLinkFromBio.ts';
import { snapshot } from '../functions/snapshot.ts';
import { sleep } from '../functions/sleep.ts';
import { clickAny } from '../functions/clickAny.ts';

// puppeteer-extra typings don't expose .use; cast to any for plugin registration.
(puppeteer as any).use(StealthPlugin());

initDb();

const BATCH_SIZE = 10; // Process 10 profiles at a time from following list

function _log(msg: string): void {
  console.log(msg);
}

async function clickSelector(
  page: Page,
  selector: string,
  timeout?: number | null
): Promise<boolean> {
  const timeoutMs = timeout ?? getTimeout('element_default');
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs });
    await page.click(selector);
    return true;
  } catch {
    return false;
  }
}

async function scrollModal(page: Page, times: number = 3): Promise<void> {
  try {
    for (let i = 0; i < times; i++) {
      await page.evaluate(`
        const modal = document.querySelector('div[role="dialog"] div[style*="overflow"]');
        if (modal) modal.scrollTop += 500;
      `);
      await delay('after_scroll');
    }
  } catch {
    // Ignore errors
  }
}

async function extractFollowingUsernames(
  page: Page,
  startIndex: number = 0,
  count: number = BATCH_SIZE
): Promise<string[]> {
  const usernames: string[] = [];

  try {
    // Wait for the modal to be present
    await page.waitForSelector('div[role="dialog"]', {
      timeout: getTimeout('element_modal'),
    });
    await delay('after_modal_open');

    // Try multiple selectors for following modal
    const modalSelectors = [
      'div[role="dialog"] a[role="link"][href^="/"]', // Current
      'div[role="dialog"] ul > li a[href^="/"]', // Suggested
      'div[role="dialog"] li a[href^="/"]', // Generic
    ];

    let items: any[] = [];
    for (const selector of modalSelectors) {
      items = await page.$$(selector);
      if (items.length > 0) {
        break;
      }
    }

    // Extract usernames from href attributes
    for (let i = 0; i < items.length; i++) {
      if (i < startIndex) {
        continue;
      }
      if (usernames.length >= count) {
        break;
      }

      try {
        const href = await items[i].evaluate((el: Element) =>
          el.getAttribute('href')
        );
        if (href && href.startsWith('/') && href.split('/').length === 3) {
          const username = href.replace(/\//g, '');
          if (username && !username.startsWith('explore')) {
            usernames.push(username);
          }
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    console.error(`  Error extracting usernames: ${e}`);
  }

  return usernames;
}

async function checkDmThreadEmpty(page: Page): Promise<boolean> {
  const dmSelectors = [
    'div[role="row"]',
    'div[role="listitem"]',
    'div[data-scope="messages_table"] > div',
  ];

  for (const selector of dmSelectors) {
    try {
      const messages = await page.$$(selector);
      if (messages.length > 0) {
        return messages.length <= 1;
      }
    } catch {
      continue;
    }
  }

  return true; // Assume empty if nothing found
}

async function processProfile(
  username: string,
  page: Page
): Promise<{
  username: string;
  visited: boolean;
  bio_score: number;
  is_creator: boolean;
  dm_sent: boolean;
  followed: boolean;
  explore_following: boolean;
}> {
  const result = {
    username,
    visited: true,
    bio_score: 0,
    is_creator: false,
    dm_sent: false,
    followed: false,
    explore_following: false,
  };

  console.log(`\n  → Checking ${username}`);

  // Navigate to profile
  await page.goto(`https://instagram.com/${username}/`);
  await delay('after_navigate');
  await mouseWiggle(page);

  // Check if account is private
  try {
    const privateText = await page.$('text="This account is private"');
    if (privateText) {
      console.log(`    Account is private, skipping`);
      markVisited(username, undefined, undefined, 0);
      return result;
    }
  } catch {
    // Continue
  }

  // Extract bio
  const bio = await getBioFromPage(page);
  const linkUrl = await getLinkFromBio(page);

  if (!bio) {
    console.log(`    No bio found, skipping`);
    markVisited(username, undefined, undefined, 0);
    return result;
  }

  // === STEP 1: Keyword/emoji matching (cheap) ===
  const [isLikely, matchData] = isLikelyCreator(bio, 40);
  result.bio_score = matchData.score;

  console.log(
    `    Bio score: ${matchData.score} | Emojis: ${
      matchData.emojis
    } | Keywords: ${matchData.keywords.slice(0, 3).join(', ')}`
  );

  markVisited(username, undefined, bio, matchData.score, linkUrl || undefined);

  if (!isLikely) {
    console.log(`    Score too low, skipping`);
    return result;
  }

  // === STEP 2: If promising and has link, explore with vision ===
  if (linkUrl && matchData.score >= 40) {
    if (SKIP_VISION) {
      console.log(
        '    FAST_MODE/SKIP_VISION enabled - skipping linktree vision step'
      );
    } else {
      console.log(`    Exploring linktree: ${linkUrl.substring(0, 50)}...`);

      try {
        // Click the link to open linktree
        const linkElement = await page.$(`a[href="${linkUrl}"]`);
        if (linkElement) {
          await linkElement.click();
          await delay('after_linktree_click');

          // Screenshot the linktree page
          const screenshotPath = await snapshot(page, `linktree_${username}`);
          console.log(`    Screenshot saved: ${screenshotPath}`);

          // Vision analysis
          const [isCreator, visionData] = await isConfirmedCreator(
            screenshotPath,
            CONFIDENCE_THRESHOLD
          );

          if (visionData) {
            console.log(
              `    Vision: creator=${isCreator}, confidence=${
                visionData.confidence || 0
              }`
            );
            console.log(
              `    Indicators: ${visionData.indicators?.join(', ') || 'none'}`
            );
          }

          if (isCreator && visionData) {
            result.is_creator = true;
            markAsCreator(username, visionData.confidence || 0, screenshotPath);
          }

          // Go back to profile
          await page.goBack();
          await delay('after_go_back');
        }
      } catch (e) {
        console.error(`    Error exploring linktree: ${e}`);
      }
    }
  } else if (matchData.score >= 70) {
    // High bio score alone can indicate creator (e.g., direct creator mention)
    console.log(`    High bio score - likely creator`);
    result.is_creator = true;
    markAsCreator(username, matchData.score);
  }

  // === STEP 3: If confirmed creator, send DM and follow ===
  if (result.is_creator) {
    // Check if we already DMed
    if (wasDmSent(username)) {
      console.log(`    Already DMed, skipping`);
    } else {
      try {
        // Click Message button
        const handle = await page.waitForSelector('div[role="button"]', {
          timeout: getTimeout('element_button'),
        });
        if (handle) {
          await handle.click();
        }
        await delay('after_message_open');

        // Check if thread is empty
        if (await checkDmThreadEmpty(page)) {
          const el = await page.waitForSelector(
            'textarea[placeholder*="Message"]',
            {
              timeout: getTimeout('element_input'),
            }
          );
          if (el) {
            await el.click();
            await page.type('textarea[placeholder*="Message"]', DM_MESSAGE);
          }
          await delay('after_dm_type');
          await page.keyboard.press('Enter');
          await delay('after_dm_send');

          // Screenshot proof
          const proofPath = await saveProof(username, page);

          markDmSent(username, proofPath);
          result.dm_sent = true;
          console.log(`    ✓ DM sent!`);
        } else {
          console.log(`    Thread not empty, skipping DM`);
        }

        // Go back to profile
        await page.goBack();
        await delay('after_go_back');
      } catch (e) {
        console.error(`    DM failed: ${e}`);
      }
    }

    // Follow if not already
    if (!wasFollowed(username)) {
      try {
        const btn = await page.waitForSelector('button', {
          timeout: getTimeout('follow'),
        });
        if (btn) {
          await btn.click();
        }
        markFollowed(username);
        result.followed = true;
        console.log(`    ✓ Followed!`);
        await delay('after_follow');
      } catch {
        // Might already be following
      }
    }

    // Mark to explore their following list
    result.explore_following = true;
  }

  return result;
}

async function processFollowingList(
  seedUsername: string,
  page: Page
): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing Following of: ${seedUsername}`);
  console.log(`${'='.repeat(50)}`);

  // Navigate to seed profile
  await page.goto(`https://instagram.com/${seedUsername}/`);
  await delay('after_navigate');
  await humanScroll(page, 2);

  // Click Following to open modal
  try {
    const ok = await clickSelector(
      page,
      'a[href$="/following/"]',
      getTimeout('element_default')
    );
    await delay('after_modal_open');
    if (!ok) {
      console.log('Could not open following modal');
      return;
    }
  } catch (e) {
    console.error(`Could not open following modal: ${e}`);
    return;
  }

  // Get starting scroll index (for pagination)
  let scrollIndex = getScrollIndex(seedUsername);

  // Scroll to previous position if resuming
  if (scrollIndex > 0) {
    console.log(`Resuming from index ${scrollIndex}`);
    await scrollModal(page, Math.floor(scrollIndex / 5));
  }

  let newProfilesFound = 0;
  let creatorsFound = 0;
  let consecutiveAllVisited = 0;

  while (consecutiveAllVisited < 3) {
    // Stop after 3 batches of all-visited
    // Extract usernames from modal
    const usernames = await extractFollowingUsernames(
      page,
      scrollIndex,
      BATCH_SIZE
    );

    if (usernames.length === 0) {
      console.log('No more usernames to extract');
      break;
    }

    console.log(
      `\nBatch starting at index ${scrollIndex}: ${usernames.length} usernames`
    );

    // Process each username
    let allVisited = true;
    for (const username of usernames) {
      if (wasVisited(username)) {
        console.log(`  [skip] ${username} - already visited`);
        continue;
      }

      allVisited = false;
      newProfilesFound++;

      // Close the modal before visiting profile
      await page.keyboard.press('Escape');
      await delay('after_modal_close');

      // Process this profile
      const result = await processProfile(username, page);

      if (result.is_creator) {
        creatorsFound++;

        // If confirmed creator, add their following to queue for later
        if (result.explore_following) {
          queueAdd(username, 50, `following_of_${seedUsername}`);
          console.log(`    Added ${username}'s following to queue`);
        }
      }

      // Re-open the following modal
      await page.goto(`https://instagram.com/${seedUsername}/`);
      await delay('after_navigate');
      await clickSelector(
        page,
        'a[href$="/following/"]',
        getTimeout('element_default')
      );
      await delay('after_modal_open');

      // Scroll back to position
      if (scrollIndex > 0) {
        await scrollModal(page, Math.floor(scrollIndex / 5));
      }

      // Random delay between profiles
      await delay('between_profiles');
    }

    // Update pagination
    scrollIndex += BATCH_SIZE;
    updateScrollIndex(seedUsername, scrollIndex);

    if (allVisited) {
      consecutiveAllVisited++;
      console.log(
        `All ${BATCH_SIZE} profiles in batch already visited (${consecutiveAllVisited}/3)`
      );
    } else {
      consecutiveAllVisited = 0;
    }

    // Scroll modal for next batch
    await scrollModal(page, 2);
    await delay('after_scroll_batch');
  }

  console.log(
    `\nFinished ${seedUsername}: ${newProfilesFound} new profiles, ${creatorsFound} creators found`
  );

  // Close modal
  await page.keyboard.press('Escape');
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  Scout - Instagram Patreon Creator Discovery Agent');
  console.log('='.repeat(60));

  // Connect to browser
  console.log('\nConnecting to browser...');
  let browser: Browser;
  let page: Page;

  if (LOCAL_BROWSER) {
    browser = await (puppeteer as any).launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    page = await browser.newPage();
  } else {
    if (!BROWSERLESS_TOKEN) {
      throw new Error(
        'BROWSERLESS_TOKEN must be set when not using LOCAL_BROWSER'
      );
    }
    browser = await (puppeteer as any).connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_TOKEN}`,
    });
    page = await browser.newPage();
  }

  await page.setViewport({ width: 1440, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Login
  console.log('Logging in to Instagram...');
  await login(page, { username: IG_USER!, password: IG_PASS! });
  console.log('✓ Logged in!');

  // Load seeds
  if (existsSync('seeds.txt')) {
    const seedsContent = readFileSync('seeds.txt', 'utf-8');
    const lines = seedsContent.split('\n');
    let seedsLoaded = 0;
    for (const line of lines) {
      const u = line.trim().toLowerCase();
      if (u && !u.startsWith('#')) {
        queueAdd(u, 100, 'seed');
        seedsLoaded++;
      }
    }
    console.log(`✓ Loaded ${seedsLoaded} seeds`);
  } else {
    console.log('⚠ No seeds.txt found!');
    await browser.close();
    return;
  }

  // Main processing loop
  let dmsSent = 0;
  let profilesProcessed = 0;

  while (dmsSent < MAX_DMS_PER_DAY) {
    // Get next profile from queue
    const target = queueNext();

    if (!target) {
      const [waitMin, waitMax] = getDelay('queue_empty');
      const waitTime = waitMin + Math.random() * (waitMax - waitMin);
      console.log(`\nQueue empty - sleeping ${Math.floor(waitTime)}s...`);
      await sleep(waitTime * 1000);
      continue;
    }

    console.log(`\n[Queue: ${queueCount()} remaining]`);

    // Process their following list
    await processFollowingList(target, page);
    profilesProcessed++;

    // Print stats
    const stats = getStats();
    console.log(`\n--- Stats ---`);
    console.log(
      `Visited: ${stats.total_visited} | Creators: ${stats.confirmed_creators} | DMs: ${stats.dms_sent} | Queue: ${stats.queue_size}`
    );

    dmsSent = stats.dms_sent;

    // Long delay between seed profiles
    const [seedDelayMin, seedDelayMax] = getDelay('between_seeds');
    const seedWait =
      seedDelayMin + Math.random() * (seedDelayMax - seedDelayMin);
    console.log(`\nWaiting ${Math.floor(seedWait)}s before next seed...`);
    await sleep(seedWait * 1000);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Session complete!');
  const stats = getStats();
  console.log(`Total visited: ${stats.total_visited}`);
  console.log(`Confirmed creators: ${stats.confirmed_creators}`);
  console.log(`DMs sent: ${stats.dms_sent}`);
  console.log('='.repeat(60));

  await browser.close();
}

// Run if executed directly
if (
  import.meta.url.endsWith(process.argv[1]?.replace(process.cwd(), '') || '')
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
