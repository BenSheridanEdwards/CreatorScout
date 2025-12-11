/**
 * Instagram modal operations - following modal, username extraction, scrolling.
 */
import type { Page } from 'puppeteer';
import { sleep } from './sleep.ts';

/**
 * Open the "Following" modal for a profile.
 */
export async function openFollowingModal(page: Page): Promise<boolean> {
  try {
    // Look for "Following" link/button
    const followingSelector = 'a[href*="/following/"]';
    await page.waitForSelector(followingSelector, { timeout: 5000 });
    await page.click(followingSelector);
    await sleep(2000); // Wait for modal to open
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract usernames from the following modal.
 * Returns array of usernames (without @ symbol).
 */
export async function extractFollowingUsernames(
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
    // Could not extract usernames
  }

  return usernames;
}

/**
 * Scroll the following modal to load more profiles.
 */
export async function scrollFollowingModal(
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
    // Could not scroll modal
  }
}
