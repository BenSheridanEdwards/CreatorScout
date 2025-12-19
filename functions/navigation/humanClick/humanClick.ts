import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";

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
 * Human-like click on a specific ElementHandle.
 * 
 * Fully encapsulated - handles everything:
 * 1. Identifies the element target (gets bounding box)
 * 2. Moves cursor over it in a random curve like a human (Bezier curve)
 * 3. Clicks with the cursor (realistic mouse down/up timing)
 * 
 * @param page - Puppeteer page instance
 * @param handle - ElementHandle to click
 * @param options - Optional click behavior options
 */
export async function humanLikeClickHandle(
	page: Page,
	handle: ElementHandle,
	options: {
		offsetX?: number;
		offsetY?: number;
		hoverDelay?: number;
		button?: "left" | "right" | "middle";
		elementType?: "button" | "link" | "input" | "generic"; // Preserves element-type timing
		duration?: number; // Optional override for movement duration
	} = {},
): Promise<void> {
	const {
		offsetX = 0,
		offsetY = 0,
		hoverDelay,
		button = "left",
		elementType = "generic",
		duration: providedDuration,
	} = options;

	// STEP 1: Identify the element target
	// Ensure element is in view
	try {
		await handle.evaluate((el: Element) => {
			(el as HTMLElement | null)?.scrollIntoView?.({
				block: "center",
				inline: "center",
			});
		});
	} catch {
		// ignore scroll failures; we'll still attempt to click
	}

	const box = await handle.boundingBox();
	if (!box) {
		throw new Error("Cannot perform humanLikeClick: element has no bounding box");
	}

	// Choose a point inside the element, away from the extreme edges
	const targetX = box.x + box.width * (0.3 + Math.random() * 0.4) + offsetX; // 30–70% width
	const targetY = box.y + box.height * (0.3 + Math.random() * 0.4) + offsetY; // 30–70% height

	// STEP 2: Move cursor over it in a random curve like a human
	// Get current mouse position
	const currentPos = await page.evaluate(() => ({
		x: (window as any).mouseX || 0,
		y: (window as any).mouseY || 0,
	}));

	// Calculate distance for dynamic duration
	const distance = Math.sqrt(
		Math.pow(targetX - currentPos.x, 2) + Math.pow(targetY - currentPos.y, 2),
	);

	// Calculate duration - FASTER but still natural
	// If provided, use it; otherwise calculate based on element type or distance
	let duration: number;
	if (providedDuration !== undefined) {
		duration = providedDuration;
	} else {
		// Element-type-specific speeds (preserved from humanClickElement, but faster)
		switch (elementType) {
			case "button":
				// Buttons: confident, direct movement - FASTER
				duration = 250 + Math.random() * 150; // 250-400ms (was 400-600ms)
				break;
			case "link":
				// Links: slightly faster, more confident - FASTER
				duration = 200 + Math.random() * 100; // 200-300ms (was 350-500ms)
				break;
			case "input":
				// Inputs: slower, more careful - slightly faster
				duration = 350 + Math.random() * 150; // 350-500ms (was 500-750ms)
				break;
			default:
				// Generic: distance-based but FASTER
				// Reduced from 1.8ms/px to 1.2ms/px, base from 200ms to 150ms
				duration = Math.max(
					200, // Minimum 200ms (was 300ms)
					Math.min(1000, distance * 1.2 + 150), // 120ms per 100px + 150ms base, max 1000ms (was 1500ms)
				);
		}
	}

	// Calculate control point for curved movement (Bezier curve)
	const controlPoint = {
		x:
			currentPos.x +
			(targetX - currentPos.x) * 0.5 +
			(Math.random() - 0.5) * 100, // Random curve variation
		y:
			currentPos.y +
			(targetY - currentPos.y) * 0.3 +
			(Math.random() - 0.5) * 50, // Random curve variation
	};

	// Move along the curve in smooth steps
	const steps = 35;
	const stepDuration = duration / steps;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const point = bezierPoint(
			currentPos,
			controlPoint,
			{ x: targetX, y: targetY },
			t,
		);

		// Add micro-randomization for each step (±1px for precision)
		const microX = point.x + (Math.random() - 0.5) * 2;
		const microY = point.y + (Math.random() - 0.5) * 2;

		await page.mouse.move(microX, microY);

		// Variable timing between steps (human-like acceleration/deceleration)
		const acceleration = Math.sin(t * Math.PI); // Sine wave for smooth acceleration
		const timingVariation = 0.7 + acceleration * 0.6; // 0.7-1.3x variation
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

	// Brief hover before clicking (context-aware, preserved from humanClickElement)
	const calculatedHoverDelay =
		hoverDelay ??
		(() => {
			switch (elementType) {
				case "button":
					return 80 + Math.random() * 150; // Quick decision (preserved)
				case "link":
					return 50 + Math.random() * 120; // Very quick (preserved)
				case "input":
					return 120 + Math.random() * 200; // More careful (preserved)
				default:
					return 100 + Math.random() * 200; // Standard (preserved)
			}
		})();

	await sleep(calculatedHoverDelay);

	// STEP 3: Click with the cursor
	// Mouse down/up with realistic press duration (preserved)
	await page.mouse.down({ button });
	const clickDuration = 35 + Math.random() * 85; // 35-120ms (preserved)
	await sleep(clickDuration);
	await page.mouse.up({ button });

	// Small post-click pause to mimic human reaction time (preserved)
	await sleep(60 + Math.random() * 180);
}


