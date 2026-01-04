/**
 * Unified Human-Like Interaction Module using Ghost Cursor
 *
 * This is the ONLY module that should be used for browser interactions.
 * ALL clicks, scrolls, and mouse movements go through ghost-cursor.
 *
 * Ghost Cursor Features Used:
 * - createCursor(page, startCoords, performRandomMoves) - cursor with random moves
 * - cursor.click(selector, options) - with hesitate, waitForClick, moveDelay, paddingPercentage
 * - cursor.move(selector, destination, options) - with moveSpeed, overshootThreshold
 * - cursor.moveTo(coords, options) - move to coordinates
 * - cursor.scrollIntoView(selector, options) - with scrollSpeed, scrollDelay
 * - cursor.scrollTo(direction) - scroll to top/bottom/left/right
 * - cursor.scroll(coords, options) - scroll with delays
 *
 * NO DIRECT PUPPETEER INTERACTIONS:
 * ❌ element.click()
 * ❌ page.click()
 * ❌ page.mouse.move/click/down/up()
 * ❌ window.scrollBy() / window.scrollTo()
 * ❌ (el as HTMLElement).click() in evaluate
 */

import { createCursor, type GhostCursor } from "ghost-cursor";
import type { ElementHandle, Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";
import { sleep } from "../../timing/sleep/sleep.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

let logger: ReturnType<typeof createLogger> | null = null;
function getLogger() {
	if (!logger) {
		logger = createLogger();
	}
	return logger;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GHOST CURSOR MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get or create ghost cursor instance for a page.
 * The cursor is cached on the page object for reuse.
 * Enables performRandomMoves for natural behavior.
 */
export async function getGhostCursor(page: Page): Promise<GhostCursor> {
	const pageWithCursor = page as Page & { _ghostCursor?: GhostCursor };
	if (!pageWithCursor._ghostCursor) {
		// Create cursor with random starting position and enable random moves
		const startX = 100 + Math.random() * 400;
		const startY = 100 + Math.random() * 300;
		pageWithCursor._ghostCursor = createCursor(
			page,
			{ x: startX, y: startY },
			true, // performRandomMoves - adds natural random movements
		);
	}
	return pageWithCursor._ghostCursor;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ELEMENT TYPES FOR CONTEXT-AWARE TIMING
// ═══════════════════════════════════════════════════════════════════════════════

export type ElementType = "button" | "link" | "input" | "generic";

/**
 * Get context-aware timing based on element type.
 * Different elements have different natural hesitation patterns.
 */
function getTimingForElement(elementType: ElementType): {
	hesitate: number;
	waitForClick: number;
	moveDelay: number;
} {
	switch (elementType) {
		case "button":
			return {
				hesitate: 80 + Math.random() * 150, // Quick, confident
				waitForClick: 30 + Math.random() * 70, // Short press
				moveDelay: 50 + Math.random() * 150,
			};
		case "link":
			return {
				hesitate: 50 + Math.random() * 120, // Very quick
				waitForClick: 20 + Math.random() * 50,
				moveDelay: 40 + Math.random() * 120,
			};
		case "input":
			return {
				hesitate: 120 + Math.random() * 200, // More careful, reading
				waitForClick: 40 + Math.random() * 80,
				moveDelay: 80 + Math.random() * 200,
			};
		default:
			return {
				hesitate: 100 + Math.random() * 200,
				waitForClick: 35 + Math.random() * 85,
				moveDelay: 60 + Math.random() * 180,
			};
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUMAN-LIKE CLICKING
// ═══════════════════════════════════════════════════════════════════════════════

export interface HumanClickOptions {
	elementType?: ElementType;
	/** Override hesitation before clicking (ms) */
	hesitate?: number;
	/** Override click hold duration (ms) */
	waitForClick?: number;
	/** Override delay after clicking before next action (ms) */
	moveDelay?: number;
	/** Where to click within element (0-100, default 30 = inner 30-70%) */
	paddingPercentage?: number;
	/** Scroll element into view first */
	scrollIntoView?: boolean;
}

/**
 * Human-like click on an ElementHandle using ghost-cursor.
 * Uses ghost-cursor's full click simulation with hesitation, hold, and delays.
 */
export async function humanClick(
	page: Page,
	target: ElementHandle,
	options: HumanClickOptions = {},
): Promise<void> {
	const {
		elementType = "generic",
		scrollIntoView = true,
		paddingPercentage = 30,
	} = options;

	getLogger().debug("ACTION", `humanClick: ${elementType} element`);

	const cursor = await getGhostCursor(page);
	const timing = getTimingForElement(elementType);

	// Scroll element into view using ghost-cursor if needed
	if (scrollIntoView) {
		const box = await target.boundingBox();
		if (box) {
			// Check if element is in viewport
			const viewport = page.viewport();
			const isInView =
				viewport &&
				box.y >= 0 &&
				box.y + box.height <= viewport.height &&
				box.x >= 0 &&
				box.x + box.width <= viewport.width;

			if (!isInView) {
				// Use ghost-cursor's scrollIntoView for the element (requires ElementHandle)
				try {
					await cursor.scrollIntoView(target, {
						scrollSpeed: 50 + Math.random() * 50,
						scrollDelay: 200 + Math.random() * 300,
						inViewportMargin: 50,
					});
				} catch {
					// Fallback: use element's scrollIntoView (smooth)
					await target.evaluate((el: Element) => {
						(el as HTMLElement)?.scrollIntoView?.({
							block: "center",
							inline: "center",
							behavior: "smooth",
						});
					});
					await sleep(500 + Math.random() * 300);
				}
			}
		}
	}

	// Get bounding box for clicking
	const box = await target.boundingBox();
	if (!box) {
		throw new Error("Cannot perform humanClick: element has no bounding box");
	}

	// Calculate target point within element using paddingPercentage
	const padding = paddingPercentage / 100;
	const targetX =
		box.x + box.width * (padding + Math.random() * (1 - 2 * padding));
	const targetY =
		box.y + box.height * (padding + Math.random() * (1 - 2 * padding));

	// Move to element and click with full ghost-cursor options
	await cursor.moveTo({ x: targetX, y: targetY });

	// Use ghost-cursor's click with all timing options
	await cursor.click(undefined, {
		hesitate: options.hesitate ?? timing.hesitate,
		waitForClick: options.waitForClick ?? timing.waitForClick,
		moveDelay: options.moveDelay ?? timing.moveDelay,
		randomizeMoveDelay: true,
		paddingPercentage: paddingPercentage,
	});
}

/**
 * Human-like click on an element by CSS selector.
 */
export async function humanClickSelector(
	page: Page,
	selector: string,
	options: HumanClickOptions & { waitTimeout?: number } = {},
): Promise<void> {
	const {
		waitTimeout = 10000,
		elementType = "generic",
		paddingPercentage = 30,
	} = options;

	getLogger().debug(
		"ACTION",
		`humanClickSelector: "${selector}" (${elementType})`,
	);

	// Wait for element
	await page.waitForSelector(selector, { timeout: waitTimeout });

	const cursor = await getGhostCursor(page);
	const timing = getTimingForElement(elementType);

	// Use ghost-cursor's built-in selector clicking
	await cursor.click(selector, {
		hesitate: options.hesitate ?? timing.hesitate,
		waitForClick: options.waitForClick ?? timing.waitForClick,
		moveDelay: options.moveDelay ?? timing.moveDelay,
		randomizeMoveDelay: true,
		paddingPercentage: paddingPercentage,
	});
}

/**
 * Human-like click at specific coordinates.
 */
export async function humanClickAt(
	page: Page,
	x: number,
	y: number,
	options: Omit<HumanClickOptions, "scrollIntoView" | "paddingPercentage"> = {},
): Promise<void> {
	const { elementType = "generic" } = options;

	getLogger().debug(
		"ACTION",
		`humanClickAt: (${Math.round(x)}, ${Math.round(y)})`,
	);

	const cursor = await getGhostCursor(page);
	const timing = getTimingForElement(elementType);

	await cursor.moveTo({ x, y });
	await cursor.click(undefined, {
		hesitate: options.hesitate ?? timing.hesitate,
		waitForClick: options.waitForClick ?? timing.waitForClick,
		moveDelay: options.moveDelay ?? timing.moveDelay,
		randomizeMoveDelay: true,
	});
}

/**
 * Human-like click on the first element matching any of the provided text labels.
 * Useful for dismissing popups, clicking buttons by text, etc.
 *
 * @returns true if an element was found and clicked, false otherwise
 */
export async function humanClickByText(
	page: Page,
	texts: string[],
	options: HumanClickOptions = {},
): Promise<boolean> {
	if (page.isClosed()) {
		throw new Error("Page is closed, cannot click elements");
	}

	getLogger().debug(
		"ACTION",
		`humanClickByText: searching for [${texts.join(", ")}]`,
	);

	for (const text of texts) {
		try {
			// Find element by text content
			const elementInfo = await page.evaluate((searchText) => {
				const elements = document.querySelectorAll(
					'button, a, [role="button"], span[role="link"]',
				);
				for (let i = 0; i < elements.length; i++) {
					const el = elements[i];
					const elText = el.textContent?.trim();
					if (
						elText === searchText ||
						elText?.toLowerCase() === searchText.toLowerCase()
					) {
						return { found: true, index: i };
					}
				}
				return { found: false };
			}, text);

			if (elementInfo.found && typeof elementInfo.index === "number") {
				const elements = await page.$$(
					'button, a, [role="button"], span[role="link"]',
				);
				const targetElement = elements[elementInfo.index];
				if (targetElement) {
					getLogger().debug("ACTION", `humanClickByText: found "${text}"`);
					await humanClick(page, targetElement, {
						elementType: "button",
						...options,
					});
					return true;
				}
			}

			// Try XPath methods
			const xpathSelectors = [
				`xpath/.//button[normalize-space()="${text}"]`,
				`xpath/.//a[normalize-space()="${text}"]`,
				`xpath/.//div[@role="button"][normalize-space()="${text}"]`,
			];

			for (const xpath of xpathSelectors) {
				const handle = await page.$(xpath);
				if (handle) {
					await humanClick(page, handle, {
						elementType: "button",
						...options,
					});
					return true;
				}
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (
				errorMsg.includes("Target closed") ||
				errorMsg.includes("TargetCloseError")
			) {
				throw err;
			}
			// Continue to next text option
		}
	}

	return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUMAN-LIKE SCROLLING (using ghost-cursor)
// ═══════════════════════════════════════════════════════════════════════════════

export interface HumanScrollOptions {
	/** Scroll speed (0-100, default 50) */
	speed?: number;
	/** Delay after scrolling (ms) */
	delay?: number;
}

/**
 * Scroll to a direction using ghost-cursor.
 */
export async function humanScrollTo(
	page: Page,
	direction: "top" | "bottom" | "left" | "right",
	options: HumanScrollOptions = {},
): Promise<void> {
	getLogger().debug("ACTION", `humanScrollTo: ${direction}`);

	const cursor = await getGhostCursor(page);
	await cursor.scrollTo(direction);
	if (options.delay) {
		await sleep(options.delay);
	}
}

/**
 * Scroll by a specific amount using ghost-cursor.
 */
export async function humanScroll(
	page: Page,
	options: {
		/** Pixels to scroll (positive = down/right, negative = up/left) */
		deltaY?: number;
		deltaX?: number;
		/** Scroll speed (0-100) */
		speed?: number;
		/** Delay after scrolling */
		delay?: number;
	} = {},
): Promise<void> {
	const {
		deltaY = 300 + Math.random() * 400,
		deltaX = 0,
		speed = 50 + Math.random() * 50,
		delay = 300 + Math.random() * 500,
	} = options;

	getLogger().debug(
		"ACTION",
		`humanScroll: deltaY=${Math.round(deltaY)}, deltaX=${Math.round(deltaX)}`,
	);

	const cursor = await getGhostCursor(page);

	// Get current scroll position
	const currentScroll = await page.evaluate(() => ({
		x: window.scrollX,
		y: window.scrollY,
	}));

	// Calculate target position
	const targetX = currentScroll.x + deltaX;
	const targetY = currentScroll.y + deltaY;

	await cursor.scroll(
		{ x: targetX, y: targetY },
		{
			scrollSpeed: speed,
			scrollDelay: delay,
		},
	);
}

/**
 * Scroll an element into view using ghost-cursor.
 */
export async function humanScrollToElement(
	page: Page,
	selector: string,
	options: HumanScrollOptions = {},
): Promise<void> {
	const { speed = 50 + Math.random() * 50, delay = 200 + Math.random() * 300 } =
		options;

	getLogger().debug("ACTION", `humanScrollToElement: "${selector}"`);

	const element = await page.$(selector);
	if (!element) {
		throw new Error(`Element not found: ${selector}`);
	}

	const cursor = await getGhostCursor(page);
	await cursor.scrollIntoView(element, {
		scrollSpeed: speed,
		scrollDelay: delay,
		inViewportMargin: 50,
	});
}

/**
 * Scroll element handle into view.
 */
export async function humanScrollElementIntoView(
	page: Page,
	element: ElementHandle,
	options: HumanScrollOptions = {},
): Promise<void> {
	const { speed = 50 + Math.random() * 50, delay = 200 + Math.random() * 300 } =
		options;

	getLogger().debug("ACTION", "humanScrollElementIntoView: element");

	const cursor = await getGhostCursor(page);
	await cursor.scrollIntoView(element, {
		scrollSpeed: speed,
		scrollDelay: delay,
		inViewportMargin: 50,
	});
}

// ═══════════════════════════════════════════════════════════════════════════════
// HUMAN-LIKE MOUSE MOVEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface HumanMoveOptions {
	/** Movement speed (default randomized) */
	moveSpeed?: number;
	/** Delay after moving */
	moveDelay?: number;
	/** Randomize delay */
	randomizeMoveDelay?: boolean;
	/** Overshoot threshold - how far past target before correcting */
	overshootThreshold?: number;
}

/**
 * Move cursor to specific coordinates using ghost-cursor.
 */
export async function humanMove(
	page: Page,
	target: { x: number; y: number },
	options: HumanMoveOptions = {},
): Promise<void> {
	getLogger().debug(
		"ACTION",
		`humanMove: (${Math.round(target.x)}, ${Math.round(target.y)})`,
	);

	const cursor = await getGhostCursor(page);
	await cursor.moveTo(target, {
		moveSpeed: options.moveSpeed,
		moveDelay: options.moveDelay ?? 50 + Math.random() * 150,
		randomizeMoveDelay: options.randomizeMoveDelay ?? true,
	});
}

/**
 * Move cursor to an element using ghost-cursor.
 */
export async function humanMoveToElement(
	page: Page,
	selector: string,
	options: HumanMoveOptions & { paddingPercentage?: number } = {},
): Promise<void> {
	const { paddingPercentage = 30, ...moveOptions } = options;

	getLogger().debug("ACTION", `humanMoveToElement: "${selector}"`);

	const cursor = await getGhostCursor(page);

	await cursor.move(selector, {
		paddingPercentage: paddingPercentage,
		moveSpeed: moveOptions.moveSpeed,
		moveDelay: moveOptions.moveDelay ?? 50 + Math.random() * 150,
		randomizeMoveDelay: moveOptions.randomizeMoveDelay ?? true,
		overshootThreshold: moveOptions.overshootThreshold ?? 500,
		maxTries: 3,
	});
}

/**
 * Move cursor to an ElementHandle.
 */
export async function humanMoveToHandle(
	page: Page,
	element: ElementHandle,
	options: HumanMoveOptions = {},
): Promise<void> {
	getLogger().debug("ACTION", "humanMoveToHandle: element");

	const box = await element.boundingBox();
	if (!box) {
		throw new Error("Cannot move to element: no bounding box");
	}

	const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
	const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);

	await humanMove(page, { x: targetX, y: targetY }, options);
}

/**
 * Random mouse wiggle for natural behavior.
 * Moves mouse to a random position using ghost-cursor.
 */
export async function humanWiggle(page: Page): Promise<void> {
	getLogger().debug("ACTION", "humanWiggle: random movement");

	const viewport = page.viewport();
	const maxX = viewport?.width ?? 1200;
	const maxY = viewport?.height ?? 800;

	const x = 100 + Math.random() * (maxX - 200);
	const y = 100 + Math.random() * (maxY - 200);

	await humanMove(page, { x, y });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED API OBJECT
// ═══════════════════════════════════════════════════════════════════════════════

export const human = {
	// Clicking
	click: humanClick,
	clickSelector: humanClickSelector,
	clickAt: humanClickAt,
	clickByText: humanClickByText,

	// Scrolling
	scroll: humanScroll,
	scrollTo: humanScrollTo,
	scrollToElement: humanScrollToElement,
	scrollElementIntoView: humanScrollElementIntoView,

	// Mouse movement
	move: humanMove,
	moveToElement: humanMoveToElement,
	moveToHandle: humanMoveToHandle,
	wiggle: humanWiggle,

	// Cursor access
	getCursor: getGhostCursor,
};
