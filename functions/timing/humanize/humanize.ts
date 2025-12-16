/**
 * Humanization helpers - delays, timeouts, and human-like behaviors.
 */
import type { Page } from "puppeteer";
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
	times?: number | null,
): Promise<void> {
	if (times === null || times === undefined) {
		times = DELAY_SCALE < 1 ? randomInt(2, 5) : randomInt(3, 7);
	}
	for (let i = 0; i < times; i++) {
		await page.evaluate(`window.scrollBy(0, ${randomInt(300, 701)})`);
		await delay("after_scroll");
	}
}

export async function mouseWiggle(page: Page): Promise<void> {
	const steps = DELAY_SCALE < 1 ? randomInt(8, 21) : randomInt(15, 36);
	await page.mouse.move(randomInt(200, 1601), randomInt(200, 901), { steps });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED MOUSE MOVEMENT - HUMAN-LIKE CURVES TO UI ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

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
 * Calculate a point on a quadratic Bezier curve
 */
function bezierPoint(
	start: { x: number; y: number },
	control: { x: number; y: number },
	end: { x: number; y: number },
	t: number,
): { x: number; y: number } {
	const x =
		(1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x;
	const y =
		(1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y;
	return { x, y };
}

/**
 * Generate a smooth, human-like mouse movement to a UI element
 */
export async function moveMouseToElement(
	page: Page,
	selector: string,
	options: {
		offsetX?: number; // Offset from center (for buttons, forms, etc.)
		offsetY?: number;
		duration?: number; // Total movement time in ms
		steps?: number; // Number of movement steps
		randomize?: boolean; // Add slight randomization
	} = {},
): Promise<boolean> {
	const {
		offsetX = 0,
		offsetY = 0,
		duration = 800,
		steps = 50,
		randomize = true,
	} = options;

	// Get target element position
	const targetPos = await getElementCenter(page, selector);
	if (!targetPos) {
		console.warn(`Element not found: ${selector}`);
		return false;
	}

	// Apply offset and randomization
	let targetX = targetPos.x + offsetX;
	let targetY = targetPos.y + offsetY;

	if (randomize) {
		targetX += (Math.random() - 0.5) * 20; // ±10px randomization
		targetY += (Math.random() - 0.5) * 20;
	}

	// Get current mouse position
	const currentPos = await page.evaluate(() => ({
		x: window.mouseX || 0,
		y: window.mouseY || 0,
	}));

	// Calculate control point for curved movement
	const controlPoint = {
		x:
			currentPos.x +
			(targetX - currentPos.x) * 0.5 +
			(Math.random() - 0.5) * 100,
		y:
			currentPos.y +
			(targetY - currentPos.y) * 0.3 +
			(Math.random() - 0.5) * 50,
	};

	// Animate along the curve
	const stepDuration = duration / steps;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const point = bezierPoint(
			currentPos,
			controlPoint,
			{ x: targetX, y: targetY },
			t,
		);

		// Add micro-randomization for each step
		const microX = randomize ? point.x + (Math.random() - 0.5) * 2 : point.x;
		const microY = randomize ? point.y + (Math.random() - 0.5) * 2 : point.y;

		await page.mouse.move(microX, microY);

		// Variable timing between steps (more human-like)
		const timingVariation = randomize ? Math.random() * 0.5 + 0.75 : 1;
		await sleep(stepDuration * timingVariation);
	}

	// Update global mouse position for future movements
	await page.evaluate(
		({ x, y }) => {
			(window as any).mouseX = x;
			(window as any).mouseY = y;
		},
		{ x: targetX, y: targetY },
	);

	return true;
}

/**
 * Human-like click on a UI element with mouse movement
 */
export async function humanClickElement(
	page: Page,
	selector: string,
	options: {
		offsetX?: number;
		offsetY?: number;
		button?: "left" | "right" | "middle";
		clickCount?: number;
		hoverDelay?: number; // Delay before clicking (like reading)
	} = {},
): Promise<boolean> {
	const {
		offsetX = 0,
		offsetY = 0,
		button = "left",
		clickCount = 1,
		hoverDelay = 200,
	} = options;

	// Move mouse to element
	const moved = await moveMouseToElement(page, selector, { offsetX, offsetY });
	if (!moved) return false;

	// Add human-like pause (like reading the button text)
	if (hoverDelay > 0) {
		await sleep(hoverDelay + Math.random() * 300);
	}

	// Click the element
	await page.mouse.down({ button });
	await sleep(50 + Math.random() * 100); // Human click duration
	await page.mouse.up({ button });

	// Handle double/triple clicks
	for (let i = 1; i < clickCount; i++) {
		await sleep(100 + Math.random() * 200);
		await page.mouse.down({ button });
		await sleep(50 + Math.random() * 100);
		await page.mouse.up({ button });
	}

	return true;
}

/**
 * Hover over an element with smooth mouse movement
 */
export async function humanHoverElement(
	page: Page,
	selector: string,
	hoverDuration: number = 1000,
): Promise<boolean> {
	const moved = await moveMouseToElement(page, selector);
	if (!moved) return false;

	// Add realistic hover duration
	await sleep(hoverDuration + Math.random() * 500);
	return true;
}

/**
 * Type text into a form field with human-like timing
 */
export async function humanTypeText(
	page: Page,
	selector: string,
	text: string,
	options: {
		clearFirst?: boolean;
		typeDelay?: number; // Delay between characters
		wordPause?: number; // Pause between words
	} = {},
): Promise<boolean> {
	const { clearFirst = true, typeDelay = 100, wordPause = 300 } = options;

	// Click on the input field first
	const clicked = await humanClickElement(page, selector);
	if (!clicked) return false;

	// Clear existing text if requested
	if (clearFirst) {
		await page.keyboard.down("Control");
		await page.keyboard.press("a");
		await page.keyboard.up("Control");
		await page.keyboard.press("Backspace");
		await sleep(100);
	}

	// Type text with human-like timing
	const words = text.split(" ");
	for (let i = 0; i < words.length; i++) {
		const word = words[i];

		for (const char of word) {
			await page.keyboard.type(char);
			await sleep(typeDelay + Math.random() * 50);
		}

		// Add space between words (except for last word)
		if (i < words.length - 1) {
			await page.keyboard.type(" ");
			await sleep(wordPause + Math.random() * 200);
		}
	}

	return true;
}
