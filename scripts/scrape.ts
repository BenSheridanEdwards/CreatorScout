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
import type { Page } from 'puppeteer';
import {
  initDb,
  queueAdd,
  queueNext,
  queueCount,
  wasVisited,
  markVisited,
  markAsCreator,
  wasDmSent,
  wasFollowed,
  getScrollIndex,
  updateScrollIndex,
  getStats,
} from '../functions/database.ts';
import { getDelay } from '../functions/humanize.ts';
import { MAX_DMS_PER_DAY, CONFIDENCE_THRESHOLD } from '../functions/config.ts';
import { sleep } from '../functions/sleep.ts';
import { createBrowser, createPage } from '../functions/browser.ts';
import {
  navigateToProfileAndCheck,
  ensureLoggedIn,
} from '../functions/profileNavigation.ts';
import {
  analyzeProfileBasic,
  analyzeLinkWithVision,
} from '../functions/profileAnalysis.ts';
import {
  sendDMToUser,
  followUserAccount,
  addFollowingToQueue,
} from '../functions/profileActions.ts';
import {
  openFollowingModal,
  extractFollowingUsernames,
  scrollFollowingModal,
} from '../functions/modalOperations.ts';
import { snapshot } from '../functions/snapshot.ts';

initDb();

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

  // Navigate to profile and check status
  try {
    const [profileDelayMin, profileDelayMax] = getDelay('profile_load');
    const profileDelay =
      profileDelayMin + Math.random() * (profileDelayMax - profileDelayMin);
    await sleep(profileDelay * 1000);

    const status = await navigateToProfileAndCheck(page, username, {
      timeout: 15000,
    });

    // Check if profile is accessible
    if (status.notFound) {
      console.log('   ❌ Profile not found');
      markVisited(username, undefined, undefined, 0);
      return;
    }
    if (status.isPrivate) {
      console.log('   🔒 Profile is private');
      markVisited(username, undefined, undefined, 0);
      return;
    }

    // Ensure we're logged in
    await ensureLoggedIn(page);
  } catch (err) {
    console.log(`   ❌ Failed to load profile: ${err}`);
    return;
  }

  // Basic profile analysis
  const analysis = await analyzeProfileBasic(page, username);

  if (!analysis.bio) {
    console.log('   ⚠️  No bio found');
    markVisited(username, undefined, undefined, 0);
    return;
  }

  console.log(
    `   Bio: ${analysis.bio.substring(0, 100)}${
      analysis.bio.length > 100 ? '...' : ''
    }`
  );
  console.log(`   Bio score: ${analysis.bioScore}`);

  // Mark as visited with bio and score
  markVisited(username, undefined, analysis.bio, analysis.bioScore);

  // If not promising, skip expensive vision analysis
  if (!analysis.isLikely) {
    console.log(
      `   ⏭️  Bio score too low (${analysis.bioScore} < 40), skipping`
    );
    return;
  }

  console.log(`   Link in bio: ${analysis.linkFromBio || 'none'}`);

  // If has linktree/link aggregator, do vision analysis
  let confirmedCreator = false;
  let confidence = analysis.bioScore;

  if (analysis.linkFromBio) {
    const visionResult = await analyzeLinkWithVision(
      page,
      analysis.linkFromBio,
      username,
      'linktree'
    );

    if (visionResult.isCreator) {
      confirmedCreator = true;
      confidence = visionResult.confidence || analysis.bioScore;
      console.log(
        `   ✅ Vision confirmed creator (confidence: ${confidence}%)`
      );
    } else {
      console.log(`   ❌ Vision did not confirm creator`);
    }
  } else if (analysis.bioScore >= CONFIDENCE_THRESHOLD) {
    // High bio score alone can indicate creator
    confirmedCreator = true;
    confidence = analysis.bioScore;
  }

  // If confirmed creator, take actions
  if (confirmedCreator && confidence >= CONFIDENCE_THRESHOLD) {
    console.log(`   🎯 CONFIRMED CREATOR (confidence: ${confidence}%)`);

    // Mark in database
    const proofPath = analysis.linkFromBio
      ? await snapshot(page, `creator_${username}`)
      : null;
    markAsCreator(username, confidence, proofPath);

    // Send DM (if not already sent)
    if (!wasDmSent(username)) {
      const [dmDelayMin, dmDelayMax] = getDelay('before_dm');
      const dmWait = dmDelayMin + Math.random() * (dmDelayMax - dmDelayMin);
      console.log(`   ⏳ Waiting ${Math.floor(dmWait)}s before DM...`);
      await sleep(dmWait * 1000);

      await sendDMToUser(page, username);
    } else {
      console.log(`   ℹ️  DM already sent to @${username}`);
    }

    // Follow (if not already following)
    if (!wasFollowed(username)) {
      await followUserAccount(page, username);
    } else {
      console.log(`   ℹ️  Already following @${username}`);
    }

    // Add their following to queue for expansion
    console.log(`   🌳 Adding @${username}'s following to queue...`);
    const added = await addFollowingToQueue(
      page,
      username,
      `following_of_${username}`,
      20
    );
    if (added > 0) {
      console.log(`   ✅ Added ${added} profiles to queue`);
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
    const status = await navigateToProfileAndCheck(page, seedUsername, {
      timeout: 15000,
    });

    if (status.notFound || status.isPrivate) {
      console.log(
        `❌ Seed profile @${seedUsername} is ${
          status.notFound ? 'not found' : 'private'
        }`
      );
      return;
    }

    // Ensure we're logged in
    await ensureLoggedIn(page);
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
  const browser = await createBrowser({ headless: true });
  const page = await createPage(browser);

  // Login (will use saved session if available)
  console.log('Logging in to Instagram...');
  await ensureLoggedIn(page);
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
