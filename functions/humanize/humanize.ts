/**
 * Humanization helpers - delays, timeouts, and human-like behaviors.
 */
import type { Page } from 'puppeteer';
import {
  DELAY_SCALE,
  DELAY_SCALES,
  DELAYS,
  DELAY_CATEGORIES,
  TIMEOUTS,
  TIMEOUT_SCALE,
} from '../config/config.ts';
import { sleep } from '../sleep/sleep.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// DELAY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getDelay(name: string): [number, number] {
  const base = DELAYS[name] || [0.7, 2.4];
  const category = DELAY_CATEGORIES[name] || 'input';
  const categoryScale = DELAY_SCALES[category] || 1.0;

  // Apply both global and category scale
  const totalScale = DELAY_SCALE * categoryScale;

  return [
    Math.max(base[0] * totalScale, 0.05), // Floor 50ms
    Math.max(base[1] * totalScale, 0.1), // Floor 100ms
  ];
}

export async function delay(name: string): Promise<void> {
  const [lo, hi] = getDelay(name);
  const waitTime = lo + Math.random() * (hi - lo);
  await sleep(waitTime * 1000);
}

function _scaledSleepBounds(minSec: number, maxSec: number): [number, number] {
  return [
    Math.max(minSec * DELAY_SCALE, 0.05),
    Math.max(maxSec * DELAY_SCALE, 0.1),
  ];
}

export async function rnd(
  minSec: number = 0.7,
  maxSec: number = 2.4
): Promise<void> {
  const [lo, hi] = _scaledSleepBounds(minSec, maxSec);
  const waitTime = lo + Math.random() * (hi - lo);
  await sleep(waitTime * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEOUT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getTimeout(name: string): number {
  const base = TIMEOUTS[name] || 10000;
  return Math.floor(base * TIMEOUT_SCALE);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUMANIZATION BEHAVIORS
// ═══════════════════════════════════════════════════════════════════════════════

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

export async function humanScroll(
  page: Page,
  times?: number | null
): Promise<void> {
  if (times === null || times === undefined) {
    times = DELAY_SCALE < 1 ? randomInt(2, 5) : randomInt(3, 7);
  }
  for (let i = 0; i < times; i++) {
    await page.evaluate(`window.scrollBy(0, ${randomInt(300, 701)})`);
    await delay('after_scroll');
  }
}

export async function mouseWiggle(page: Page): Promise<void> {
  const steps = DELAY_SCALE < 1 ? randomInt(8, 21) : randomInt(15, 36);
  await page.mouse.move(randomInt(200, 1601), randomInt(200, 901), { steps });
}
