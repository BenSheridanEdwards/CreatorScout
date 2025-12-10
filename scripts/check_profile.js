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
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';

puppeteer.use(StealthPlugin());

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function snapshot(page, label) {
  await fs.mkdir('tmp', { recursive: true });
  const ts = Date.now();
  const file = `tmp/${label}-${ts}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function classifyWithApp(imagePath) {
  const abs = path.resolve(imagePath);
  const cmd = `
python3 - <<'PY'
import json
from vision import is_confirmed_creator
path = r"""${abs}"""
ok, data = is_confirmed_creator(path, threshold=70)
print(json.dumps({"ok": ok, "data": data or {}}))
PY
  `;
  const out = execSync(cmd, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    return JSON.parse(out.trim());
  } catch (e) {
    return { ok: false, data: { error: `parse_fail: ${e}` } };
  }
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

  // Wait for login form or already logged in state
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

  // Wait for navigation after login
  await page.waitForSelector('a[href="/direct/inbox/"]', { timeout: 10000 });

  // Dismiss popups
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
    const el = await page.$(sel);
    if (el) {
      const txt = await el.evaluate((node) => node.innerText);
      const trimmed = txt?.trim();
      if (trimmed) return trimmed;
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

async function runProfileCheck(username) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(20000);
  page.setDefaultTimeout(12000);

  const result = {
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
    await login(page);

    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    await sleep(1500);

    // Check profile availability
    const status = await page.evaluate(() => {
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
    if (status.notFound) {
      result.errors.push('Profile not found or unavailable');
      return result;
    }
    if (status.isPrivate) {
      result.errors.push('Profile is private');
      return result;
    }

    // Bio and links
    result.bio = await getBioFromPage(page);

    const candidates = new Set();
    const primary = await getLinkFromBio(page);
    if (primary) candidates.add(primary);

    const headerHrefs = await page.$$eval('header a', (els) =>
      els.map((e) => e.getAttribute('href')).filter(Boolean)
    );
    headerHrefs.forEach((h) => candidates.add(h));

    const html = await page.content();
    const urlMatches = html.match(/https?:\/\/[^"'\s]+/gi) || [];
    urlMatches
      .filter((u) => /linktr\.ee|patreon\.com|beacons\.ai|allmylinks/i.test(u))
      .forEach((u) => candidates.add(u));

    const jsonLink = html.match(/\"external_url\":\"(https?:[^\\"\s]+)\"/i);
    if (jsonLink) candidates.add(jsonLink[1].replace(/\\u0026/g, '&'));

    const uniqueLinks = [...candidates].filter(
      (u) => u && u.startsWith('http') && !u.includes('instagram.com')
    );
    result.links = uniqueLinks;

    // Direct Patreon shortcut
    if (uniqueLinks.some((u) => u.toLowerCase().includes('patreon.com'))) {
      result.isCreator = true;
      result.confidence = 90;
      result.reason = 'direct_patreon_link';
    }

    // Follow link aggregators if needed
    if (!result.isCreator && uniqueLinks.length) {
      const aggregators = uniqueLinks.filter((u) =>
        /linktr\.ee|link\.me|beacons\.ai|allmylinks|linkin\.bio|bio\.link|stan\.store|fanhouse/i.test(
          u
        )
      );

      for (const u of aggregators) {
        if (result.isCreator) break;
        const safeUrl = (
          u.startsWith('http') ? u : `https://${u.replace(/^[\\/]+/, '')}`
        ).replace(/^http:\/\//i, 'https://');

        const extPage = await browser.newPage();
        try {
          const response = await extPage.goto(safeUrl, {
            waitUntil: 'networkidle2',
            timeout: 15000,
          });
          const finalUrl = response?.url() || safeUrl;
          if (finalUrl.toLowerCase().includes('patreon.com')) {
            result.isCreator = true;
            result.confidence = 90;
            result.reason = 'redirect_patreon';
            await extPage.close();
            break;
          }

          await sleep(2000);
          const shot = await snapshot(extPage, `linkagg_${username}`);
          result.screenshots.push(shot);

          const visionResult = classifyWithApp(shot);
          if (visionResult.ok) {
            result.isCreator = true;
            result.confidence = visionResult.data?.confidence || 70;
            result.indicators = visionResult.data?.indicators || [];
            result.reason = visionResult.data?.reason || 'vision_detected';
          }
        } catch (e) {
          result.errors.push(`Aggregator load failed: ${e.message}`);
        } finally {
          await extPage.close().catch(() => {});
        }
      }
    }
  } catch (e) {
    result.errors.push(e.message || String(e));
  } finally {
    await browser.close().catch(() => {});
  }

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
