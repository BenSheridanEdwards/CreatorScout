/**
 * DM Variation System
 *
 * Generates natural, varied DM messages from a database of 150-200 real lines.
 * Features:
 * - Template-based message construction
 * - Word variation and swapping
 * - Emoji randomization
 * - Multiple message styles (short, medium, full pitch)
 * - No full AI generation (just shuffling/swapping)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../shared/logger/logger.ts";

const logger = createLogger();

interface DMLines {
	opening_lines: string[];
	compliments: string[];
	curiosity_hooks: string[];
	business_hints: string[];
	soft_pitches: string[];
	closers: string[];
	emojis: string[];
	word_variations: Record<string, string[]>;
}

let dmLines: DMLines | null = null;

/**
 * Load DM lines from JSON database
 */
function loadDMLines(): DMLines {
	if (dmLines) return dmLines;

	const dmLinesPath = join(
		process.cwd(),
		"functions/profile/dmVariation/dmLines.json",
	);
	const data = readFileSync(dmLinesPath, "utf-8");
	dmLines = JSON.parse(data);
	return dmLines!;
}

/**
 * Pick a random item from an array
 */
function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick N random unique items from an array
 */
function _pickRandomN<T>(arr: T[], n: number): T[] {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * Apply word variations to a text string
 * Randomly replaces words with their variations to add natural variance
 */
function applyWordVariations(
	text: string,
	variations: Record<string, string[]>,
): string {
	let result = text;

	// 40% chance to apply variations
	if (Math.random() > 0.4) return result;

	// Try to replace 1-2 words
	const wordsToReplace = Math.floor(Math.random() * 2) + 1;
	let replaced = 0;

	for (const [word, alternatives] of Object.entries(variations)) {
		if (replaced >= wordsToReplace) break;

		// Check if word exists in text (case insensitive)
		const regex = new RegExp(`\\b${word}\\b`, "gi");
		if (regex.test(result)) {
			const replacement = pickRandom(alternatives);
			result = result.replace(regex, replacement);
			replaced++;
		}
	}

	return result;
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Add random emoji with 60% chance
 * DISABLED - emojis removed from DM generation
 */
function maybeAddEmoji(text: string, _emojis: string[]): string {
	// Emojis disabled - return text unchanged
	return text;
}

/**
 * Generate a SHORT curiosity-based DM (no business pitch)
 * Use this for first messages - pure curiosity and interest
 *
 * Style: opening + compliment + question
 * Example: "hey! love your vibe. what got you into content creation?"
 */
export function generateShortDM(): string {
	const lines = loadDMLines();

	const opening = pickRandom(lines.opening_lines);
	const compliment = pickRandom(lines.compliments);
	const question = pickRandom(lines.curiosity_hooks);

	// Build message (50% chance to skip compliment for brevity)
	let message = capitalize(opening);
	if (Math.random() < 0.5) {
		message += `. ${compliment}`;
	}
	message += `. ${question}`;

	// Apply word variations
	message = applyWordVariations(message, lines.word_variations);

	// Re-capitalize after word variations (in case first word was replaced)
	message = capitalize(message);

	// Maybe add emoji
	message = maybeAddEmoji(message, lines.emojis);

	return message;
}

/**
 * Generate a MEDIUM DM with subtle business hint
 * Use this after some engagement/rapport
 *
 * Style: opening + compliment + business_hint + closer
 * Example: "hey! your content is amazing. I help creators monetize and grow. would love to chat!"
 */
export function generateMediumDM(): string {
	const lines = loadDMLines();

	const opening = pickRandom(lines.opening_lines);
	const compliment = pickRandom(lines.compliments);
	const businessHint = pickRandom(lines.business_hints);
	const closer = pickRandom(lines.closers);

	let message = capitalize(opening);
	message += `. ${compliment}`;
	message += `. ${businessHint}`;
	message += ` ${closer}`;

	// Apply word variations
	message = applyWordVariations(message, lines.word_variations);

	// Re-capitalize after word variations (in case first word was replaced)
	message = capitalize(message);

	// Maybe add emoji
	message = maybeAddEmoji(message, lines.emojis);

	return message;
}

/**
 * Generate a FULL PITCH DM with clear offer
 * Use this for warm leads or follow-ups
 *
 * Style: opening + compliment + business_hint + soft_pitch + closer
 * Example: "hey gorgeous! your vibe is incredible. I manage creator accounts professionally. would love to chat about opportunities. let me know!"
 */
export function generateFullPitchDM(): string {
	const lines = loadDMLines();

	const opening = pickRandom(lines.opening_lines);
	const compliment = pickRandom(lines.compliments);
	const businessHint = pickRandom(lines.business_hints);
	const softPitch = pickRandom(lines.soft_pitches);
	const closer = pickRandom(lines.closers);

	let message = capitalize(opening);
	message += `. ${compliment}`;
	message += `. ${businessHint}`;
	message += `. ${softPitch}`;
	message += ` ${closer}`;

	// Apply word variations
	message = applyWordVariations(message, lines.word_variations);

	// Re-capitalize after word variations (in case first word was replaced)
	message = capitalize(message);

	// Maybe add emoji
	message = maybeAddEmoji(message, lines.emojis);

	return message;
}

/**
 * Generate a CUSTOM combination DM
 * Build your own message from specific components
 */
export function generateCustomDM(components: {
	opening?: boolean;
	compliment?: boolean;
	curiosityHook?: boolean;
	businessHint?: boolean;
	softPitch?: boolean;
	closer?: boolean;
}): string {
	const lines = loadDMLines();
	const parts: string[] = [];

	if (components.opening) {
		parts.push(capitalize(pickRandom(lines.opening_lines)));
	}
	if (components.compliment) {
		parts.push(pickRandom(lines.compliments));
	}
	if (components.curiosityHook) {
		parts.push(pickRandom(lines.curiosity_hooks));
	}
	if (components.businessHint) {
		parts.push(pickRandom(lines.business_hints));
	}
	if (components.softPitch) {
		parts.push(pickRandom(lines.soft_pitches));
	}
	if (components.closer) {
		parts.push(pickRandom(lines.closers));
	}

	// Join with periods and space
	let message = parts.join(". ");

	// Apply word variations
	message = applyWordVariations(message, lines.word_variations);

	// Maybe add emoji
	message = maybeAddEmoji(message, lines.emojis);

	return message;
}

/**
 * Generate a DM based on strategy
 * - "cold": Short curiosity-based message (default for first contact)
 * - "warm": Medium message with business hint
 * - "pitch": Full pitch with clear offer
 */
export function generateDM(
	strategy: "cold" | "warm" | "pitch" = "cold",
): string {
	switch (strategy) {
		case "warm":
			return generateMediumDM();
		case "pitch":
			return generateFullPitchDM();
		default:
			return generateShortDM();
	}
}

/**
 * Generate multiple unique DM variations
 * Useful for batch operations or A/B testing
 */
export function generateDMBatch(
	count: number,
	strategy: "cold" | "warm" | "pitch" = "cold",
): string[] {
	const messages = new Set<string>();

	// Generate up to count*3 messages to ensure uniqueness
	let attempts = 0;
	const maxAttempts = count * 3;

	while (messages.size < count && attempts < maxAttempts) {
		const dm = generateDM(strategy);
		messages.add(dm);
		attempts++;
	}

	return Array.from(messages);
}

/**
 * Get stats about DM line database
 */
export function getDMStats(): {
	totalLines: number;
	openingLines: number;
	compliments: number;
	curiosityHooks: number;
	businessHints: number;
	softPitches: number;
	closers: number;
	emojis: number;
	wordVariations: number;
	possibleCombinations: string;
} {
	const lines = loadDMLines();

	const totalLines =
		lines.opening_lines.length +
		lines.compliments.length +
		lines.curiosity_hooks.length +
		lines.business_hints.length +
		lines.soft_pitches.length +
		lines.closers.length;

	// Calculate possible combinations (simplified estimate)
	const shortCombos =
		lines.opening_lines.length *
		lines.compliments.length *
		lines.curiosity_hooks.length;
	const mediumCombos =
		lines.opening_lines.length *
		lines.compliments.length *
		lines.business_hints.length *
		lines.closers.length;
	const fullCombos =
		lines.opening_lines.length *
		lines.compliments.length *
		lines.business_hints.length *
		lines.soft_pitches.length *
		lines.closers.length;

	const totalCombos = shortCombos + mediumCombos + fullCombos;

	return {
		totalLines,
		openingLines: lines.opening_lines.length,
		compliments: lines.compliments.length,
		curiosityHooks: lines.curiosity_hooks.length,
		businessHints: lines.business_hints.length,
		softPitches: lines.soft_pitches.length,
		closers: lines.closers.length,
		emojis: lines.emojis.length,
		wordVariations: Object.keys(lines.word_variations).length,
		possibleCombinations:
			totalCombos > 1000000
				? `${(totalCombos / 1000000).toFixed(1)}M+`
				: `${(totalCombos / 1000).toFixed(0)}K+`,
	};
}

/**
 * Test DM generation by generating multiple samples
 */
export function testDMGeneration(count: number = 10): void {
	logger.info("DM_TEST", `Generating ${count} sample DMs...`);
	logger.info("DM_TEST", "");

	logger.info("DM_TEST", "=== SHORT (COLD) DMs ===");
	for (let i = 0; i < count; i++) {
		const dm = generateShortDM();
		logger.info("DM_TEST", `${i + 1}. ${dm}`);
	}

	logger.info("DM_TEST", "");
	logger.info("DM_TEST", "=== MEDIUM (WARM) DMs ===");
	for (let i = 0; i < count; i++) {
		const dm = generateMediumDM();
		logger.info("DM_TEST", `${i + 1}. ${dm}`);
	}

	logger.info("DM_TEST", "");
	logger.info("DM_TEST", "=== FULL PITCH DMs ===");
	for (let i = 0; i < count; i++) {
		const dm = generateFullPitchDM();
		logger.info("DM_TEST", `${i + 1}. ${dm}`);
	}

	// Show stats
	const stats = getDMStats();
	logger.info("DM_TEST", "");
	logger.info("DM_TEST", "=== DM DATABASE STATS ===");
	logger.info("DM_TEST", `Total lines: ${stats.totalLines}`);
	logger.info("DM_TEST", `Opening lines: ${stats.openingLines}`);
	logger.info("DM_TEST", `Compliments: ${stats.compliments}`);
	logger.info("DM_TEST", `Curiosity hooks: ${stats.curiosityHooks}`);
	logger.info("DM_TEST", `Business hints: ${stats.businessHints}`);
	logger.info("DM_TEST", `Soft pitches: ${stats.softPitches}`);
	logger.info("DM_TEST", `Closers: ${stats.closers}`);
	logger.info("DM_TEST", `Emojis: ${stats.emojis}`);
	logger.info("DM_TEST", `Word variations: ${stats.wordVariations}`);
	logger.info(
		"DM_TEST",
		`Possible combinations: ${stats.possibleCombinations}`,
	);
}
