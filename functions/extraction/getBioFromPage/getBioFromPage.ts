import type { Page } from "puppeteer";
import { createLogger } from "../../shared/logger/logger.ts";
import { snapshot } from "../../shared/snapshot/snapshot.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

export async function getBioFromPage(page: Page): Promise<string | null> {
	const selectors = [
		// More robust selectors that don't rely on changing CSS classes
		'header section div span[dir="auto"]', // Most specific bio selector
		'header section span[dir="auto"]',
		'div[dir="auto"] span[dir="auto"]',
		'header span[dir="auto"]',
		'section span[dir="auto"]',
		// Legacy selectors for backwards compatibility
		"header section > div.-vDIg > span",
		"header section span:not([class])",
		'div[class*="biography"]',
		"section > div > span",
		"header section h1 + span",
		"header section h1 + div span",
		// Lower priority selectors (avoid highlight titles)
		// 'header section div[role="presentation"] span', // This finds highlight titles
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

				// Collect bio-like content from spans
				if (trimmed && trimmed.length > 1 && trimmed.length < 100) {
					// Check if this looks like bio content
					const isBioLike =
						!trimmed.includes("Follow") &&
						!trimmed.includes("Message") &&
						!trimmed.includes("Options") &&
						!trimmed.match(/^\d/) &&
						!trimmed.includes("posts") &&
						!trimmed.includes("followers") &&
						!trimmed.includes("following") &&
						trimmed !== "Links" &&
						trimmed !== "lanahyummy"; // Exclude username

					if (isBioLike) {
						logger.info(
							"ANALYSIS",
							`Found potential bio content with selector ${i + 1}/${selectors.length}: "${trimmed}"`,
						);

						// If we found what looks like bio content, try to get more complete bio
						// by looking at the parent element for additional context
						try {
							const parentText = await el.evaluate((node: Element) => {
								const parent = node.parentElement;
								if (parent) {
									const spans = parent.querySelectorAll('span[dir="auto"]');
									let combined = "";
									spans.forEach((span) => {
										const text = (span as HTMLElement).innerText?.trim();
										if (text && text.length > 1 && text.length < 50) {
											combined += (combined ? " " : "") + text;
										}
									});
									return combined || null;
								}
								return null;
							});

							if (
								parentText &&
								parentText.length > trimmed.length &&
								parentText.length < 200
							) {
								logger.info(
									"ANALYSIS",
									`Enhanced bio from parent: "${parentText}"`,
								);
								return parentText;
							}
						} catch (e) {
							// Continue with original text
						}

						return trimmed;
					} else {
						logger.debug(
							"ANALYSIS",
							`Selector ${i + 1} found non-bio content: "${trimmed.substring(0, 30)}"`,
						);
					}
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
					.filter((line: string) => line.trim().length > 3);

				// Fallback: Extract bio content from header text more intelligently
				// Normalize the header text and split into words
				const headerText = txt.replace(/\n+/g, " ").trim();
				const words = headerText.split(/\s+/);

				// Find bio-like sequences in the header
				const bioParts: string[] = [];
				let currentSequence = "";
				let inBioSequence = false;

				for (let i = 0; i < words.length; i++) {
					const word = words[i];

					// Skip UI elements and stats
					if (
						word === "Follow" ||
						word === "Message" ||
						word === "Options" ||
						word === "Links" ||
						word.includes("posts") ||
						word.includes("followers") ||
						word.includes("following") ||
						word.match(/^\d+k?$/) ||
						word === "lanahyummy"
					) {
						// Skip username
						if (currentSequence.trim()) {
							bioParts.push(currentSequence.trim());
							currentSequence = "";
						}
						inBioSequence = false;
						continue;
					}

					// Collect bio-like words
					if (
						word.length > 2 &&
						word.length < 50 &&
						!word.startsWith("http") &&
						!word.match(/^@\w+$/)
					) {
						// Skip simple @ mentions
						currentSequence += (currentSequence ? " " : "") + word;
						inBioSequence = true;
					} else if (inBioSequence && word.includes("@") && word.length < 30) {
						// Include @ mentions that are part of bio
						currentSequence += " " + word;
					}
				}

				if (currentSequence.trim()) {
					bioParts.push(currentSequence.trim());
				}

				// Filter and combine bio parts
				const validBioParts = bioParts.filter(
					(part) =>
						part.length > 3 &&
						part.length < 150 &&
						(part.includes(" ") || part.includes("@")), // Must have spaces or @ to be bio-like
				);

				if (validBioParts.length > 0) {
					const combinedBio = validBioParts.join(" ").trim();
					if (combinedBio.length > 5) {
						logger.info(
							"ANALYSIS",
							`Extracted bio from header parsing: "${combinedBio}"`,
						);
						return combinedBio;
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
