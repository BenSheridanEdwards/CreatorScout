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
		duration?: number; // Total movement time in ms (auto-calculated if not provided)
		steps?: number; // Number of movement steps
		randomize?: boolean; // Add slight randomization
		distance?: number; // Override distance calculation
	} = {},
): Promise<boolean> {
	const {
		offsetX = 0,
		offsetY = 0,
		duration,
		steps = 35, // Reduced from 50 for smoother movement
		randomize = true,
		distance: providedDistance,
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
		targetX += (Math.random() - 0.5) * 16; // ±8px randomization (more precise)
		targetY += (Math.random() - 0.5) * 16;
	}

	// Get current mouse position
	const currentPos = await page.evaluate(() => ({
		x: window.mouseX || 0,
		y: window.mouseY || 0,
	}));

	// Calculate distance for dynamic duration
	const distance =
		providedDistance ??
		Math.sqrt(
			Math.pow(targetX - currentPos.x, 2) +
				Math.pow(targetPos.y - currentPos.y, 2),
		);

	// Dynamic duration based on distance (50-200ms per 100px, more realistic)
	const calculatedDuration =
		duration ??
		Math.max(
			300, // Minimum 300ms
			Math.min(1500, distance * 1.8 + 200), // 180ms per 100px + base delay
		);

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

	// Animate along the curve with dynamic timing
	const stepDuration = calculatedDuration / steps;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const point = bezierPoint(
			currentPos,
			controlPoint,
			{ x: targetX, y: targetY },
			t,
		);

		// Add micro-randomization for each step (±1px for precision)
		const microX = randomize ? point.x + (Math.random() - 0.5) * 2 : point.x;
		const microY = randomize ? point.y + (Math.random() - 0.5) * 2 : point.y;

		await page.mouse.move(microX, microY);

		// Variable timing between steps (more human-like acceleration/deceleration)
		let timingVariation = 1.0;
		if (randomize) {
			// Accelerate in middle, decelerate at ends (Fitts' Law)
			const acceleration = Math.sin(t * Math.PI); // Sine wave for smooth acceleration
			timingVariation = 0.7 + acceleration * 0.6; // 0.7-1.3x variation
		}
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
		hoverDelay?: number; // Delay before clicking (context-dependent)
		elementType?: "button" | "link" | "input" | "generic"; // Affects timing
	} = {},
): Promise<boolean> {
	const {
		offsetX = 0,
		offsetY = 0,
		button = "left",
		clickCount = 1,
		hoverDelay,
		elementType = "generic",
	} = options;

	// Move mouse to element with appropriate speed for element type
	const moveOptions: any = { offsetX, offsetY };

	// Different movement speeds based on element type
	switch (elementType) {
		case "button":
			// Buttons: confident, direct movement
			moveOptions.duration = 400 + Math.random() * 200;
			break;
		case "link":
			// Links: slightly faster, more confident
			moveOptions.duration = 350 + Math.random() * 150;
			break;
		case "input":
			// Inputs: slower, more careful
			moveOptions.duration = 500 + Math.random() * 250;
			break;
		default:
			// Generic: standard timing
			break; // Use default calculated duration
	}

	const moved = await moveMouseToElement(page, selector, moveOptions);
	if (!moved) return false;

	// Context-aware hover delay (different for different element types)
	const calculatedHoverDelay =
		hoverDelay ??
		(() => {
			switch (elementType) {
				case "button":
					return 80 + Math.random() * 150; // Quick decision
				case "link":
					return 50 + Math.random() * 120; // Very quick
				case "input":
					return 120 + Math.random() * 200; // More careful
				default:
					return 100 + Math.random() * 200; // Standard
			}
		})();

	if (calculatedHoverDelay > 0) {
		await sleep(calculatedHoverDelay);
	}

	// More realistic click timing (based on Fitts' Law and human studies)
	await page.mouse.down({ button });
	const clickDuration = 35 + Math.random() * 85; // 35-120ms (more realistic)
	await sleep(clickDuration);
	await page.mouse.up({ button });

	// Handle double/triple clicks with realistic timing
	for (let i = 1; i < clickCount; i++) {
		const doubleClickDelay = 120 + Math.random() * 180; // 120-300ms between clicks
		await sleep(doubleClickDelay);
		await page.mouse.down({ button });
		await sleep(35 + Math.random() * 65); // Slightly faster subsequent clicks
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
		typeDelay?: number; // Base delay between characters (auto-adjusted)
		wordPause?: number; // Pause between words
		mistakeRate?: number; // Chance of making a typo (0.0-1.0)
		correctionDelay?: number; // Delay before correcting mistakes
	} = {},
): Promise<boolean> {
	const {
		clearFirst = true,
		typeDelay = 80, // Faster base typing (80-180ms per char)
		wordPause = 200, // Shorter word pauses
		mistakeRate = 0.02, // 2% chance of typo per character
		correctionDelay = 300,
	} = options;

	// Click on the input field first (input-specific timing)
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

			// Occasional typos (backspace and retype)
			if (Math.random() < mistakeRate && charIndex > 0) {
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
