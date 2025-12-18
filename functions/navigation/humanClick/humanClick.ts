import type { ElementHandle, Page } from "puppeteer";
import { sleep } from "../../timing/sleep/sleep.ts";

/**
 * Human-like click on a specific ElementHandle.
 *
 * - Scrolls element into view
 * - Moves mouse in small steps to a slightly-random point inside the element
 * - Adds a short hover
 * - Performs mouse down/up with a natural press duration
 */
export async function humanLikeClickHandle(
	page: Page,
	handle: ElementHandle,
): Promise<void> {
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
	const targetX =
		box.x + box.width * (0.3 + Math.random() * 0.4); // 30–70% width
	const targetY =
		box.y + box.height * (0.3 + Math.random() * 0.4); // 30–70% height

	// Start from a point near the target to avoid huge jumps
	const startX = targetX + (Math.random() * 80 - 40);
	const startY = targetY + (Math.random() * 80 - 40);

	// Move near the element first
	await page.mouse.move(startX, startY);
	await sleep(40 + Math.random() * 80);

	// Then move in several small steps into the final target point
	const steps = 8 + Math.floor(Math.random() * 10); // 8–17 steps
	for (let i = 0; i < steps; i++) {
		const t = (i + 1) / steps;
		const x = startX + (targetX - startX) * t;
		const y = startY + (targetY - startY) * t;
		await page.mouse.move(x, y);
		await sleep(6 + Math.random() * 24); // 6–30ms between moves
	}

	// Brief hover before clicking
	await sleep(80 + Math.random() * 220); // 80–300ms hover

	// Mouse down/up with realistic press duration
	await page.mouse.down();
	await sleep(40 + Math.random() * 110); // 40–150ms press
	await page.mouse.up();

	// Small post-click pause to mimic human reaction time
	await sleep(60 + Math.random() * 180);
}


