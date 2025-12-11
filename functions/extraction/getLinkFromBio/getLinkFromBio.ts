import type { Page } from 'puppeteer';

export async function getLinkFromBio(page: Page): Promise<string | null> {
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
