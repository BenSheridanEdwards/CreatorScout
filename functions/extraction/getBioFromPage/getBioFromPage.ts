import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

export async function getBioFromPage(page: Page): Promise<string | null> {
	const selectors = [
		"header section > div.-vDIg > span",
		"header section span:not([class])",
		'div[class*="biography"]',
		"section > div > span",
		"header section h1 + span",
		"header section h1 + div span",
		'header section div[role="presentation"] span',
		// Additional selectors that might work
		"header section span",
		"header span",
		'div[dir="auto"] span',
	];

	for (let i = 0; i < selectors.length; i++) {
		const sel = selectors[i];
		try {
			const el = await page.$(sel);
			if (el) {
				const txt = await el.evaluate(
					(node: Element) => (node as HTMLElement).innerText as string,
				);
				const trimmed = txt?.trim();
				// Filter out very short text that's likely not the bio (usernames, etc.)
				if (trimmed && trimmed.length > 10) {
					logger.info(
						"ANALYSIS",
						`Found bio with selector ${i + 1}/${selectors.length}: ${sel.substring(
							0,
							50,
						)}`,
					);
					return trimmed;
				} else if (trimmed) {
					logger.debug(
						"ANALYSIS",
						`Selector ${i + 1} found text but too short (${trimmed.length} chars): "${trimmed.substring(
							0,
							30,
						)}"`,
					);
				}
			}
		} catch (_e) {}
	}

	logger.debug("ANALYSIS", "All specific selectors failed, trying fallback...");

	// Fallback: get all text from header and try to extract bio
	try {
		const header = await page.$("header");
		if (header) {
			const txt = await header.evaluate(
				(node) => (node as HTMLElement).innerText,
			);
			if (txt) {
				// Try to find the bio text (usually after username, before links)
				const lines = txt
					.split("\n")
					.filter((line: string) => line.trim().length > 10);
				// Bio is usually one of the longer text blocks in the header
				for (const line of lines) {
					if (
						line.length > 20 &&
						!line.includes("@") &&
						!line.startsWith("http")
					) {
						return line.trim();
					}
				}
				return txt.trim() || null;
			}
		}
	} catch (_e) {
		// Fallback failed
	}

	// Take failure screenshot when running locally
	const isLocal = process.env.HEADLESS === "false" || !process.env.CI;
	if (isLocal) {
		try {
			const screenshotPath = await snapshot(page, "bio_extraction_failed");
			logger.error(
				"ERROR",
				`Bio extraction failed - screenshot saved: ${screenshotPath}`,
			);
		} catch (e) {
			logger.error("ERROR", `Failed to take screenshot: ${e}`);
		}
	} else {
		logger.warn("ANALYSIS", "Bio extraction failed");
	}

	return null;
}
