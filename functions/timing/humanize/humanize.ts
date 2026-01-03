/**
 * Humanization helpers - delays, timeouts, and human-like behaviors.
 */

import { createCursor, type GhostCursor } from "ghost-cursor";
import type { Page } from "puppeteer";
import {
	humanScroll as humanScrollFromInteraction,
	humanWiggle,
} from "../../navigation/humanInteraction/humanInteraction.ts";
import {
	DELAY_CATEGORIES,
	DELAY_SCALE,
	DELAY_SCALES,
	DELAYS,
	TIMEOUT_SCALE,
	TIMEOUTS,
} from "../../shared/config/config.ts";
import { sleep } from "../sleep/sleep.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// DELAY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getDelay(name: string): [number, number] {
	const base = DELAYS[name] || [0.7, 2.4];
	const category = DELAY_CATEGORIES[name] || "input";
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
	maxSec: number = 2.4,
): Promise<void> {
	const [lo, hi] = _scaledSleepBounds(minSec, maxSec);
	const waitTime = lo + Math.random() * (hi - lo);
	await sleep(waitTime * 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EFFICIENT DELAY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple random delay - efficient for routine actions
 */
export async function randomDelay(min: number, max: number): Promise<void> {
	const [lo, hi] = _scaledSleepBounds(min, max);
	const delayTime = lo + Math.random() * (hi - lo);
	await sleep(delayTime * 1000);
}

/**
 * Micro-delay for rapid actions (0.5-2s default)
 * Use between quick consecutive actions
 */
export async function microDelay(
	min: number = 0.5,
	max: number = 2,
): Promise<void> {
	await randomDelay(min, max);
}

/**
 * Short delay for routine actions (1-5s)
 * Use for follows, discovery, scrolling
 */
export async function shortDelay(
	min: number = 1,
	max: number = 5,
): Promise<void> {
	await randomDelay(min, max);
}

/**
 * Medium delay for engagement (3-8s)
 * Use for watching reels, viewing stories
 */
export async function mediumDelay(
	min: number = 3,
	max: number = 8,
): Promise<void> {
	await randomDelay(min, max);
}

/**
 * Long delay for high-risk actions (10-30s)
 * Use ONLY for DMs - these are monitored closely
 */
export async function longDelay(
	min: number = 10,
	max: number = 30,
): Promise<void> {
	await randomDelay(min, max);
}

/**
 * Gaussian random number generator using Box-Muller transform
 * Creates more natural, bell-curve distribution
 */
function gaussianRandom(mean: number, stdDev: number): number {
	const u1 = Math.random();
	const u2 = Math.random();
	const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	return mean + z0 * stdDev;
}

/**
 * Gaussian delay - use for high-risk actions (DMs)
 * Creates more natural variation centered around the mean
 */
export async function gaussianDelay(min: number, max: number): Promise<void> {
	const [lo, hi] = _scaledSleepBounds(min, max);
	const mean = (lo + hi) / 2;
	const stdDev = (hi - lo) / 6; // ~99.7% within range
	const delayTime = Math.max(lo, Math.min(hi, gaussianRandom(mean, stdDev)));
	await sleep(delayTime * 1000);
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

/**
 * Natural scrolling using ghost-cursor.
 * @param page - Puppeteer page
 * @param times - Number of scroll iterations (optional, defaults based on DELAY_SCALE)
 */
export async function humanScroll(
	page: Page,
	times?: number | null,
): Promise<void> {
	if (times === null || times === undefined) {
		times = DELAY_SCALE < 1 ? randomInt(2, 5) : randomInt(3, 7);
	}
	for (let i = 0; i < times; i++) {
		await humanScrollFromInteraction(page, { deltaY: randomInt(300, 700) });
		await delay("after_scroll");
	}
}

/**
 * Natural mouse wiggle using ghost-cursor.
 */
export async function mouseWiggle(page: Page): Promise<void> {
	await humanWiggle(page);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED MOUSE MOVEMENT - HUMAN-LIKE CURVES TO UI ELEMENTS (using ghost-cursor)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get or create ghost cursor instance for a page
 * We cache it on the page object to reuse the same cursor instance
 */
async function getGhostCursor(page: Page): Promise<GhostCursor> {
	// Cache the cursor on the page object
	const pageWithCursor = page as Page & { _ghostCursor?: GhostCursor };
	if (!pageWithCursor._ghostCursor) {
		pageWithCursor._ghostCursor = createCursor(page);
	}
	return pageWithCursor._ghostCursor;
}

/**
 * Calculate context-aware hover delay based on element type
 * Different element types elicit different hesitation patterns in humans:
 * - Buttons: Quick, confident clicks (user knows what will happen)
 * - Links: Very quick clicks (familiar navigation pattern)
 * - Inputs: Slower, more careful (reading placeholder, considering input)
 * - Generic: Standard hesitation
 *
 * This variation helps evade Instagram's ML models that detect uniform timing patterns.
 */
function getContextualHoverDelay(
	elementType: "button" | "link" | "input" | "generic",
	override?: number,
): number {
	if (override !== undefined) return override;

	switch (elementType) {
		case "button":
			return 80 + Math.random() * 150; // 80-230ms - quick decision
		case "link":
			return 50 + Math.random() * 120; // 50-170ms - very quick
		case "input":
			return 120 + Math.random() * 200; // 120-320ms - more careful
		default:
			return 100 + Math.random() * 200; // 100-300ms - standard
	}
}

/**
 * Get the center coordinates of a DOM element
 */
export async function getElementCenter(
	page: Page,
	selector: string,
): Promise<{ x: number; y: number } | null> {
	try {
		const element = await page.$(selector);
		if (!element) return null;

		const boundingBox = await element.boundingBox();
		if (!boundingBox) return null;

		return {
			x: boundingBox.x + boundingBox.width / 2,
			y: boundingBox.y + boundingBox.height / 2,
		};
	} catch (error) {
		console.warn(
			`Failed to get element center for selector: ${selector}`,
			error,
		);
		return null;
	}
}

/**
 * Generate a smooth, human-like mouse movement to a UI element using ghost-cursor
 */
export async function moveMouseToElement(
	page: Page,
	selector: string,
	options: {
		offsetX?: number; // Offset from center (for buttons, forms, etc.)
		offsetY?: number;
		duration?: number; // Total movement time in ms (auto-calculated if not provided)
		steps?: number; // Number of movement steps (ignored, ghost-cursor uses its own algorithm)
		randomize?: boolean; // Add slight randomization
		distance?: number; // Override distance calculation
	} = {},
): Promise<boolean> {
	const { offsetX = 0, offsetY = 0, randomize = true } = options;

	try {
		const cursor = await getGhostCursor(page);

		// Get target element
		const element = await page.$(selector);
		if (!element) {
			console.warn(`Element not found: ${selector}`);
			return false;
		}

		// Use ghost-cursor's move function which handles bezier curves automatically
		// The paddingPercentage option adds randomization to the target point
		await cursor.move(selector, {
			paddingPercentage: randomize ? 0 : 100, // 0 = random point, 100 = center
			moveDelay: 0, // We handle delays externally
		});

		// Apply additional offset if specified
		if (offsetX !== 0 || offsetY !== 0) {
			const boundingBox = await element.boundingBox();
			if (boundingBox) {
				const currentX = boundingBox.x + boundingBox.width / 2;
				const currentY = boundingBox.y + boundingBox.height / 2;
				await cursor.moveTo({ x: currentX + offsetX, y: currentY + offsetY });
			}
		}

		return true;
	} catch (error) {
		console.warn(`Failed to move mouse to element: ${selector}`, error);
		return false;
	}
}

/**
 * Human-like click on a UI element with mouse movement using ghost-cursor
 */
export async function humanClickElement(
	page: Page,
	selector: string,
	options: {
		offsetX?: number;
		offsetY?: number;
		button?: "left" | "right" | "middle";
		clickCount?: number;
		hoverDelay?: number; // Delay before clicking (context-dependent)
		elementType?: "button" | "link" | "input" | "generic"; // Affects timing
	} = {},
): Promise<boolean> {
	const {
		button = "left",
		clickCount = 1,
		hoverDelay,
		elementType = "generic",
	} = options;

	try {
		const cursor = await getGhostCursor(page);

		// Use ghost-cursor's click function which handles movement and clicking
		await cursor.click(selector, {
			hesitate: getContextualHoverDelay(elementType, hoverDelay),
			waitForClick: 35 + Math.random() * 85, // Realistic press duration
			moveDelay: 60 + Math.random() * 180, // Post-click pause
			button: button as "left" | "right" | "middle",
			clickCount: clickCount,
			paddingPercentage: 30, // Click within 30-70% of element (more realistic)
		});

		return true;
	} catch (error) {
		console.warn(`Failed to click element: ${selector}`, error);
		return false;
	}
}

/**
 * Hover over an element with smooth mouse movement using ghost-cursor
 */
export async function humanHoverElement(
	page: Page,
	selector: string,
	hoverDuration: number = 1000,
): Promise<boolean> {
	try {
		const cursor = await getGhostCursor(page);

		// Move to element
		await cursor.move(selector, {
			paddingPercentage: 30, // Random point within element
			moveDelay: 0, // We handle delays separately
		});

		// Add realistic hover duration
		await sleep(hoverDuration + Math.random() * 500);
		return true;
	} catch (error) {
		console.warn(`Failed to hover over element: ${selector}`, error);
		return false;
	}
}

/**
 * Type text into a form field with human-like timing
 * Uses ghost-cursor for clicking, manual typing for realistic character timing
 */
export async function humanTypeText(
	page: Page,
	selector: string,
	text: string,
	options: {
		clearFirst?: boolean;
		typeDelay?: number; // Base delay between characters (auto-adjusted)
		wordPause?: number; // Pause between words
		mistakeRate?: number; // Chance of making a typo (0.0-1.0, default 0.02)
		correctionDelay?: number; // Delay before correcting mistakes (default 300ms)
	} = {},
): Promise<boolean> {
	const {
		clearFirst = true,
		typeDelay = 80, // Faster base typing (80-180ms per char)
		wordPause = 200, // Shorter word pauses
		mistakeRate = 0.02, // 2% chance of typo per character (safety feature)
		correctionDelay = 300,
	} = options;

	// Click on the input field first using ghost-cursor (input-specific timing)
	const clicked = await humanClickElement(page, selector, {
		elementType: "input",
		hoverDelay: 150, // Longer hover for inputs (focus consideration)
	});
	if (!clicked) return false;

	// Clear existing text if requested (more realistic clearing)
	if (clearFirst) {
		await page.keyboard.down("Control");
		await page.keyboard.press("a");
		await page.keyboard.up("Control");
		await sleep(50 + Math.random() * 100); // Quick clear
		await page.keyboard.press("Backspace");
		await sleep(30 + Math.random() * 70);
	}

	// Type text with realistic human patterns
	const words = text.split(" ");
	for (let i = 0; i < words.length; i++) {
		const word = words[i];

		for (let charIndex = 0; charIndex < word.length; charIndex++) {
			const char = word[charIndex];

			// Realistic typing variations
			let charDelay = typeDelay;

			// Slower for capital letters (shift press)
			if (char >= "A" && char <= "Z") {
				charDelay += 30 + Math.random() * 50;
			}

			// Slightly slower at word boundaries
			if (charIndex === 0 || charIndex === word.length - 1) {
				charDelay += 10 + Math.random() * 20;
			}

			// Occasional longer pauses (thinking)
			if (Math.random() < 0.05) {
				// 5% chance
				charDelay += 100 + Math.random() * 200;
			}

			await page.keyboard.type(char);
			await sleep(charDelay + Math.random() * 40);

			// Occasional typos (backspace and retype) - safety feature for anti-detection
			if (mistakeRate > 0 && Math.random() < mistakeRate && charIndex > 0) {
				// Wait a bit, then correct
				await sleep(correctionDelay + Math.random() * 200);
				await page.keyboard.press("Backspace");

				// Retype the character (slightly slower correction)
				await sleep(80 + Math.random() * 100);
				await page.keyboard.type(char);
				await sleep(60 + Math.random() * 80);
			}
		}

		// Space between words (except for last word)
		if (i < words.length - 1) {
			await page.keyboard.type(" ");

			// Variable word spacing (thinking between words)
			const spaceDelay = wordPause + Math.random() * 150;
			await sleep(spaceDelay);
		}
	}

	return true;
}
