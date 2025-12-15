import type { Page } from "puppeteer";

export async function getLinkFromBio(page: Page): Promise<string | null> {
	const linkSelectors = [
		// Direct creator links
		'header a[href*="patreon.com"]',
		// Aggregator links
		'header a[href*="linktr.ee"]',
		'header a[href*="link.me"]',
		'header a[href*="beacons.ai"]',
		'header a[href*="allmylinks"]',
		'header a[href*="linkin.bio"]',
		'header a[href*="bio.link"]',
		'header a[href*="stan.store"]',
		'header a[href*="fanhouse"]',
		// General external links
		'header a[rel*="nofollow"]',
		'header a[target="_blank"]',
		'header a[href^="http"]',
	];
	for (const sel of linkSelectors) {
		const el = await page.$(sel);
		if (el) {
			const href = await el.evaluate((node) => node.getAttribute("href"));
			if (href) return href;
		}
	}
	return null;
}
