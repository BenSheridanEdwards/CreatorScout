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
import { isLikelyCreator } from '../functions/bioMatcher.ts';
import { isConfirmedCreator } from '../functions/vision.ts';
import { getDelay } from '../functions/humanize.ts';
import {
  MAX_DMS_PER_DAY,
  DM_MESSAGE,
  CONFIDENCE_THRESHOLD,
  SKIP_VISION,
  LOCAL_BROWSER,
  BROWSERLESS_TOKEN,
  IG_USER,
  IG_PASS,
} from '../functions/config.ts';
import { getBioFromPage } from '../functions/getBioFromPage.ts';
import { getLinkFromBio } from '../functions/getLinkFromBio.ts';
import { snapshot } from '../functions/snapshot.ts';
import { sleep } from '../functions/sleep.ts';

// puppeteer-extra typings don't expose .use; cast to any for plugin registration.
(puppeteer as any).use(StealthPlugin());

initDb();

/**
 * Extract usernames from the following modal.
 * Returns array of usernames (without @ symbol).
 */
async function extractFollowingUsernames(
  page: Page,
  batchSize: number = 10
): Promise<string[]> {
  const usernames: string[] = [];

  try {
    // Wait for modal to be visible
    await page.waitForSelector('div[role="dialog"]', { timeout: 5000 });

    // Get all list items in the modal
    const items = await page.$$('div[role="dialog"] ul li');

    for (let i = 0; i < Math.min(items.length, batchSize); i++) {
      try {
        // Get the username from the link
        const username = await items[i].evaluate((el) => {
          const link = el.querySelector('a[href^="/"]');
          if (link) {
            const href = link.getAttribute('href') || '';
            // Extract username from href like "/username/" or "/username"
            const match = href.match(/^\/([^\/]+)/);
            return match ? match[1] : null;
          }
          return null;
        });

        if (username && !usernames.includes(username)) {
          usernames.push(username);
        }
      } catch {
        // Skip this item if we can't extract username
        continue;
      }
    }
  } catch {
    console.log('   ⚠️  Could not extract usernames from modal');
  }

  return usernames;
}

/**
 * Open the "Following" modal for a profile.
 */
async function openFollowingModal(page: Page): Promise<boolean> {
  try {
    // Look for "Following" link/button
    const followingSelector = 'a[href*="/following/"]';
    await page.waitForSelector(followingSelector, { timeout: 5000 });
    await page.click(followingSelector);
    await sleep(2000); // Wait for modal to open
    return true;
  } catch {
    console.log('   ⚠️  Could not open following modal');
    return false;
  }
}

/**
 * Scroll the following modal to load more profiles.
 */
async function scrollFollowingModal(
  page: Page,
  scrollAmount: number = 500
): Promise<void> {
  try {
    const modalSelector = 'div[role="dialog"]';
    await page.evaluate(
      (selector, amount) => {
        const modal = document.querySelector(selector);
        if (modal) {
          modal.scrollTop += amount;
        }
      },
      modalSelector,
      scrollAmount
    );
    await sleep(1500); // Wait for new profiles to load
  } catch {
    console.log('   ⚠️  Could not scroll modal');
  }
}

/**
 * Check if we're logged in by looking for inbox link.
 */
async function verifyLoggedIn(page: Page): Promise<boolean> {
  try {
    const inboxLink = await page.$('a[href="/direct/inbox/"]');
    return inboxLink !== null;
  } catch {
    return false;
  }
}

/**
 * Send a DM to a user.
 */
async function sendDM(page: Page, username: string): Promise<boolean> {
  try {
    // Navigate to DM page
    await page.goto(`https://www.instagram.com/direct/inbox/`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });

    // Click "New Message" or search for user
    await sleep(2000);

    // Try to find existing conversation or start new one
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.type(username, { delay: 50 });
      await sleep(2000);

      // Click first result
      const firstResult = await page.$('div[role="button"]');
      if (firstResult) {
        await firstResult.click();
        await sleep(2000);
      }
    }

    // Check if conversation already has messages
    const messages = await page.$$('div[role="textbox"]');
    if (messages.length > 0) {
      console.log(
        `   ⚠️  Conversation with @${username} already exists, skipping DM`
      );
      return false;
    }

    // Type message
    const messageInput = await page.$('div[role="textbox"]');
    if (messageInput) {
      await messageInput.click();
      await sleep(500);
      await page.keyboard.type(DM_MESSAGE, { delay: 50 });
      await sleep(1000);

      // Send (Enter key or Send button)
      await page.keyboard.press('Enter');
      await sleep(2000);

      // Take screenshot as proof
      const proofPath = await snapshot(page, `dm_${username}`);
      markDmSent(username, proofPath);

      console.log(`   ✅ DM sent to @${username}`);
      return true;
    }

    return false;
  } catch (err) {
    console.log(`   ⚠️  Failed to send DM to @${username}: ${err}`);
    return false;
  }
}

/**
 * Follow a user.
 */
async function followUser(page: Page, username: string): Promise<boolean> {
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });
    await sleep(2000);

    // Find follow button
    const followButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        if (text === 'follow') {
          return true;
        }
      }
      return false;
    });

    if (followButton) {
      await page.click('button:has-text("Follow")');
      await sleep(2000);
      markFollowed(username);
      console.log(`   ✅ Followed @${username}`);
      return true;
    } else {
      console.log(`   ℹ️  Already following @${username} or button not found`);
      return false;
    }
  } catch (err) {
    console.log(`   ⚠️  Failed to follow @${username}: ${err}`);
    return false;
  }
}

/**
 * Process a single profile: visit, analyze, and take actions if creator.
 */
async function processProfile(
  username: string,
  page: Page,
  source: string
): Promise<void> {
  console.log(`\n[${source}] Processing @${username}...`);

  // Skip if already visited
  if (wasVisited(username)) {
    console.log(`   ⏭️  Already visited, skipping`);
    return;
  }

  // Navigate to profile
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });
    const [profileDelayMin, profileDelayMax] = getDelay('profile_load');
    const profileDelay =
      profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
    await sleep(profileDelay * 1000);

    // Check if logged in
    const isLoggedIn = await verifyLoggedIn(page);
    if (!isLoggedIn) {
      console.log('   ⚠️  Not logged in, re-logging...');
      if (!IG_USER || !IG_PASS) {
        throw new Error('Instagram credentials not configured');
      }
      await login(page, { username: IG_USER, password: IG_PASS });
      await page.goto(`https://www.instagram.com/${username}/`, {
        waitUntil: 'networkidle2',
      });
      await sleep(2000);
    }
  } catch (err) {
    console.log(`   ❌ Failed to load profile: ${err}`);
    return;
  }

  // Extract bio
  const bio = await getBioFromPage(page);
  if (!bio) {
    console.log('   ⚠️  No bio found');
    markVisited(username, undefined, undefined, 0);
    return;
  }

  console.log(
    `   Bio: ${bio.substring(0, 100)}${bio.length > 100 ? '...' : ''}`
  );

  // Bio matching (cheap - no API call)
  const [isLikely, scoreData] = isLikelyCreator(bio, 40, username);
  const bioScore = scoreData.score;

  console.log(`   Bio score: ${bioScore}`);

  // Mark as visited with bio and score
  markVisited(username, undefined, bio, bioScore);

  // If not promising, skip expensive vision analysis
  if (!isLikely) {
    console.log(`   ⏭️  Bio score too low (${bioScore} < 40), skipping`);
    return;
  }

  // Extract link from bio
  const linkFromBio = await getLinkFromBio(page);
  console.log(`   Link in bio: ${linkFromBio || 'none'}`);

  // If has linktree/link aggregator, do vision analysis
  let confirmedCreator = false;
  let confidence = bioScore;

  if (linkFromBio && !SKIP_VISION) {
    try {
      console.log('   🔍 Opening link for vision analysis...');
      await page.goto(linkFromBio, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });
      await sleep(3000);

      // Take screenshot
      const screenshotPath = await snapshot(page, `linktree_${username}`);
      console.log(`   📸 Screenshot: ${screenshotPath}`);

      // Vision analysis
      console.log('   🤖 Running vision AI analysis...');
      const [isCreator, visionData] = await isConfirmedCreator(screenshotPath);

      if (isCreator && visionData) {
        confirmedCreator = true;
        confidence = visionData.confidence || bioScore;
        console.log(
          `   ✅ Vision confirmed creator (confidence: ${confidence}%)`
        );
      } else {
        console.log(`   ❌ Vision did not confirm creator`);
      }
    } catch (err) {
      console.log(`   ⚠️  Vision analysis failed: ${err}`);
    }
  } else if (SKIP_VISION) {
    console.log('   ⏭️  Vision analysis skipped (SKIP_VISION=true)');
    // If skipping vision, use bio score as confidence
    if (bioScore >= CONFIDENCE_THRESHOLD) {
      confirmedCreator = true;
      confidence = bioScore;
    }
  }

  // If confirmed creator, take actions
  if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
    console.log(`   🎯 CONFIRMED CREATOR (confidence: ${confidence}%)`);

    // Mark in database
    const proofPath = linkFromBio
      ? await snapshot(page, `creator_${username}`)
      : null;
    markAsCreator(username, confidence, proofPath);

    // Send DM (if not already sent)
    if (!wasDmSent(username)) {
      const [dmDelayMin, dmDelayMax] = getDelay('before_dm');
      const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
      console.log(`   ⏳ Waiting ${Math.floor(dmWait)}s before DM...`);
      await sleep(dmWait * 1000);

      await sendDM(page, username);
    } else {
      console.log(`   ℹ️  DM already sent to @${username}`);
    }

    // Follow (if not already following)
    if (!wasFollowed(username)) {
      await followUser(page, username);
    } else {
      console.log(`   ℹ️  Already following @${username}`);
    }

    // Add their following to queue for expansion
    console.log(`   🌳 Adding @${username}'s following to queue...`);
    const followingOpened = await openFollowingModal(page);
    if (followingOpened) {
      const followingUsernames = await extractFollowingUsernames(page, 20);
      for (const followingUsername of followingUsernames) {
        if (!wasVisited(followingUsername)) {
          queueAdd(followingUsername, 50, `following_of_${username}`);
        }
      }
      console.log(`   ✅ Added ${followingUsernames.length} profiles to queue`);
      await page.keyboard.press('Escape'); // Close modal
      await sleep(1000);
    }
  } else {
    console.log(
      `   ⏭️  Not confirmed (confidence: ${confidence}% < ${CONFIDENCE_THRESHOLD}%)`
    );
  }

  // Human-like delay before next profile
  const [profileDelayMin, profileDelayMax] = getDelay('between_profiles');
  const profileWait =
    profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
  console.log(
    `   ⏳ Waiting ${Math.floor(profileWait)}s before next profile...`
  );
  await sleep(profileWait * 1000);
}

/**
 * Process the following list of a seed profile.
 */
async function processFollowingList(
  seedUsername: string,
  page: Page
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing following list of @${seedUsername}`);
  console.log('='.repeat(60));

  // Navigate to seed profile
  try {
    await page.goto(`https://www.instagram.com/${seedUsername}/`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });
    await sleep(2000);

    // Check login
    const isLoggedIn = await verifyLoggedIn(page);
    if (!isLoggedIn) {
      console.log('⚠️  Not logged in, re-logging...');
      if (!IG_USER || !IG_PASS) {
        throw new Error('Instagram credentials not configured');
      }
      await login(page, { username: IG_USER, password: IG_PASS });
      await page.goto(`https://www.instagram.com/${seedUsername}/`, {
        waitUntil: 'networkidle2',
      });
      await sleep(2000);
    }
  } catch (err) {
    console.log(`❌ Failed to load seed profile: ${err}`);
    return;
  }

  // Open following modal
  const modalOpened = await openFollowingModal(page);
  if (!modalOpened) {
    console.log('❌ Could not open following modal');
    return;
  }

  // Get current scroll index
  let scrollIndex = getScrollIndex(seedUsername);
  console.log(`📍 Starting from scroll index: ${scrollIndex}`);

  // If we've scrolled before, scroll to that position
  if (scrollIndex > 0) {
    console.log(`   Scrolling to position ${scrollIndex}...`);
    for (let i = 0; i < Math.floor(scrollIndex / 500); i++) {
      await scrollFollowingModal(page, 500);
    }
    await sleep(2000);
  }

  let processedInBatch = 0;
  const batchSize = 10;

  while (true) {
    // Extract usernames from modal
    const usernames = await extractFollowingUsernames(page, batchSize);

    if (usernames.length === 0) {
      console.log('   ℹ️  No more usernames in modal');
      break;
    }

    console.log(`\n   📋 Batch of ${usernames.length} profiles:`);
    for (const u of usernames) {
      console.log(`      - @${u}`);
    }

    // Process each username
    let allVisited = true;
    for (const username of usernames) {
      if (!wasVisited(username)) {
        allVisited = false;
        await processProfile(username, page, `following_of_${seedUsername}`);
        processedInBatch++;
      } else {
        console.log(`   ⏭️  @${username} already visited, skipping`);
      }
    }

    // If all in batch were already visited, scroll for more
    if (allVisited) {
      console.log('   ⬇️  All profiles in batch already visited, scrolling...');
      await scrollFollowingModal(page, 500);
      scrollIndex += 500;
      updateScrollIndex(seedUsername, scrollIndex);
      await sleep(2000);
    } else {
      // Processed new profiles, continue with next batch
      break;
    }

    // Safety: don't process too many in one go
    if (processedInBatch >= 50) {
      console.log('   ⚠️  Processed 50 profiles, pausing...');
      break;
    }
  }

  console.log(`\n✅ Finished processing following list of @${seedUsername}`);
  console.log(`   Processed ${processedInBatch} new profiles`);
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
    // Use persistent user data directory to save cookies between sessions
    const { getUserDataDir } = await import('../functions/sessionManager.ts');
    const userDataDir = getUserDataDir();

    browser = await (puppeteer as any).launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      userDataDir, // Persistent profile to save cookies
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

  // Login (will use saved session if available)
  console.log('Logging in to Instagram...');
  if (!IG_USER || !IG_PASS) {
    throw new Error('Instagram credentials not configured');
  }
  await login(
    page,
    { username: IG_USER, password: IG_PASS },
    { skipIfLoggedIn: true }
  );
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
