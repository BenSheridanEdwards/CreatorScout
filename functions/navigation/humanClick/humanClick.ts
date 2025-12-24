import { createCursor, type GhostCursor } from "ghost-cursor";
import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";

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
 * Human-like click on a specific ElementHandle using ghost-cursor
 *
 * Fully encapsulated - handles everything:
 * 1. Identifies the element target (gets bounding box)
 * 2. Moves cursor over it in a random curve like a human (via ghost-cursor)
 * 3. Clicks using ghost-cursor's click method for proper event handling
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
		elementType?: "button" | "link" | "input" | "generic";
		duration?: number;
	} = {},
): Promise<void> {
	const { hoverDelay, elementType = "generic" } = options;

	// STEP 1: Ensure element is in view
	try {
		await handle.evaluate((el: Element) => {
			(el as HTMLElement | null)?.scrollIntoView?.({
				block: "center",
				inline: "center",
			});
		});
		// Wait for scroll to complete
		await sleep(300 + Math.random() * 200);
	} catch {
		// ignore scroll failures; we'll still attempt to click
	}

	const box = await handle.boundingBox();
	if (!box) {
		throw new Error(
			"Cannot perform humanLikeClick: element has no bounding box",
		);
	}

	// STEP 2: Get cursor and move to element
	const cursor = await getGhostCursor(page);

	// Calculate target point (30-70% of element width/height for natural clicking)
	const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
	const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

	// Move to target using ghost-cursor's sophisticated movement algorithm
	await cursor.moveTo({ x: targetX, y: targetY });

	// Brief hover before clicking (context-aware timing)
	await sleep(getContextualHoverDelay(elementType, hoverDelay));

	// STEP 3: Click using ghost-cursor's click method
	// This handles the click event more naturally than manual mouse.down/up
	await cursor.click();

	// Small post-click pause to mimic human reaction time
	await sleep(100 + Math.random() * 200);
}

/**
 * Human-like click directly at coordinates using ghost-cursor
 */
export async function humanLikeClickAt(
	page: Page,
	x: number,
	y: number,
	options: {
		hoverDelay?: number;
		elementType?: "button" | "link" | "input" | "generic";
	} = {},
): Promise<void> {
	const { hoverDelay, elementType = "generic" } = options;

	const cursor = await getGhostCursor(page);

	// Move to target
	await cursor.moveTo({ x, y });

	// Brief hover before clicking
	await sleep(getContextualHoverDelay(elementType, hoverDelay));

	// Click
	await cursor.click();

	// Post-click pause
	await sleep(100 + Math.random() * 200);
}

/**
 * Human-like click on an element by selector using ghost-cursor
 */
export async function humanLikeClickSelector(
	page: Page,
	selector: string,
	options: {
		hoverDelay?: number;
		elementType?: "button" | "link" | "input" | "generic";
		waitTimeout?: number;
	} = {},
): Promise<void> {
	const { hoverDelay, elementType = "generic", waitTimeout = 10000 } = options;

	// Wait for element to be present
	await page.waitForSelector(selector, { timeout: waitTimeout });

	const cursor = await getGhostCursor(page);

	// Brief hover before clicking
	await sleep(getContextualHoverDelay(elementType, hoverDelay));

	// Use ghost-cursor's move method which handles selectors
	await cursor.click(selector);

	// Post-click pause
	await sleep(100 + Math.random() * 200);
}
