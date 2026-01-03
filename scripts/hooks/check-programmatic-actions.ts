#!/usr/bin/env tsx
/**
 * Pre-commit hook script to detect programmatic actions that bypass human-like interactions.
 *
 * This project requires ALL browser interactions to use the humanInteraction module.
 * Direct Puppeteer methods are STRICTLY FORBIDDEN - no exceptions, no fallbacks.
 *
 * ALLOWED:
 * - humanClick(), humanClickSelector(), humanClickByText()
 * - humanScroll(), humanScrollToElement()
 * - humanMove(), humanMoveToElement(), humanWiggle()
 * - cursor.click() / cursor.moveTo() from ghost-cursor (in humanInteraction.ts only)
 * - page.keyboard.press() / page.keyboard.type() - keyboard actions are acceptable
 * - window.scrollBy/scrollTo with behavior: "smooth" - smooth scrolling is acceptable
 * - element.scrollIntoView({ behavior: "smooth" }) - smooth scroll into view is acceptable
 *
 * FORBIDDEN (no exceptions):
 * - element.click() - direct Puppeteer click
 * - page.click() - direct page click
 * - page.mouse.click() / page.mouse.move() / page.mouse.down() / page.mouse.up()
 * - (el as HTMLElement).click() - DOM click in evaluate
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface Violation {
	file: string;
	line: number;
	code: string;
	pattern: string;
	severity: "error" | "warning";
	suggestion: string;
}

// Patterns that indicate programmatic (non-human-like) actions
const VIOLATION_PATTERNS: Array<{
	pattern: RegExp;
	name: string;
	severity: "error" | "warning";
	suggestion: string;
	// Patterns in the same line that make this acceptable
	allowedContexts?: RegExp[];
}> = [
	{
		// Direct .click() on elements
		pattern: /await\s+\w+\.click\s*\(/,
		name: "Direct element.click()",
		severity: "error",
		suggestion: "Use humanClick(page, element) from humanInteraction.ts",
		allowedContexts: [
			/cursor\.click/, // ghost-cursor's click is fine
			/humanClick/, // our wrappers are fine
		],
	},
	{
		// Direct page.click()
		pattern: /await\s+page\.click\s*\(/,
		name: "Direct page.click()",
		severity: "error",
		suggestion:
			"Use humanClickSelector(page, selector) from humanInteraction.ts",
	},
	{
		// Direct mouse.move
		pattern: /page\.mouse\.move\s*\(/,
		name: "Direct page.mouse.move()",
		severity: "error",
		suggestion: "Use humanMove(page, {x, y}) from humanInteraction.ts",
	},
	{
		// Direct mouse.down
		pattern: /page\.mouse\.down\s*\(/,
		name: "Direct page.mouse.down()",
		severity: "error",
		suggestion: "Use humanClick() from humanInteraction.ts",
	},
	{
		// Direct mouse.up
		pattern: /page\.mouse\.up\s*\(/,
		name: "Direct page.mouse.up()",
		severity: "error",
		suggestion: "Use humanClick() from humanInteraction.ts",
	},
	{
		// Direct mouse.click
		pattern: /page\.mouse\.click\s*\(/,
		name: "Direct page.mouse.click()",
		severity: "error",
		suggestion: "Use humanClickAt(page, x, y) from humanInteraction.ts",
	},
	{
		// DOM click via evaluate - very detectable
		pattern: /\(\s*\w+\s+as\s+HTMLElement\s*\)\.click\s*\(\)/,
		name: "DOM element.click() in evaluate",
		severity: "error",
		suggestion: "Return element info and use humanClick() outside evaluate()",
	},
	{
		// Another common DOM click pattern
		pattern: /\.click\s*\(\s*\)\s*;?\s*return\s+true/,
		name: "DOM click() with return",
		severity: "error",
		suggestion:
			"Return element info and click with humanClick() outside evaluate()",
	},
	{
		// page.tap (mobile tap simulation)
		pattern: /page\.tap\s*\(/,
		name: "Direct page.tap()",
		severity: "error",
		suggestion: "Use humanClick() from humanInteraction.ts",
	},
	{
		// window.scrollBy in evaluate - detectable programmatic scrolling
		pattern: /window\.scrollBy\s*\(/,
		name: "window.scrollBy() in evaluate",
		severity: "error",
		suggestion: "Use humanScroll() from humanInteraction.ts",
	},
	{
		// window.scrollTo in evaluate - detectable programmatic scrolling
		pattern: /window\.scrollTo\s*\(/,
		name: "window.scrollTo() in evaluate",
		severity: "error",
		suggestion: "Use humanScrollTo() from humanInteraction.ts",
	},
	{
		// element.scrollIntoView without smooth behavior
		pattern: /\.scrollIntoView\s*\(\s*\)/,
		name: "scrollIntoView() without smooth behavior",
		severity: "error",
		suggestion: "Use humanScrollElementIntoView() from humanInteraction.ts",
	},
];

// Files/directories to always skip
const SKIP_PATTERNS = [
	/node_modules/,
	/\.test\.ts$/,
	/\.spec\.ts$/,
	/__test__/,
	/\/tests\//,
	/\.d\.ts$/,
	/humanInteraction\.ts$/, // The humanInteraction module itself uses cursor.click() legitimately
	/humanize\.ts$/, // Contains humanScroll which uses scrollBy legitimately
	/check-programmatic-actions\.ts$/, // This file itself
];

function shouldSkipFile(filePath: string): boolean {
	return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

function checkFile(filePath: string): Violation[] {
	const violations: Violation[] = [];

	if (shouldSkipFile(filePath)) {
		return violations;
	}

	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const lineNumber = i + 1;

		for (const rule of VIOLATION_PATTERNS) {
			if (rule.pattern.test(line)) {
				// Check if any allowed context makes this OK
				const isAllowed = rule.allowedContexts?.some((ctx) => ctx.test(line));
				if (isAllowed) continue;

				violations.push({
					file: filePath,
					line: lineNumber,
					code: line.trim(),
					pattern: rule.name,
					severity: rule.severity,
					suggestion: rule.suggestion,
				});
			}
		}
	}

	return violations;
}

function getChangedFiles(): string[] {
	try {
		const output = execSync(
			"git diff --cached --name-only --diff-filter=ACMR",
			{
				encoding: "utf-8",
			},
		);
		return output
			.split("\n")
			.filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
			.map((f) => path.resolve(process.cwd(), f));
	} catch {
		return [];
	}
}

function getAllTsFiles(dir: string): string[] {
	const files: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if (
				entry.name === "node_modules" ||
				entry.name === ".git" ||
				entry.name === "dist" ||
				entry.name === "coverage"
			) {
				continue;
			}
			files.push(...getAllTsFiles(fullPath));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".ts") &&
			!entry.name.endsWith(".d.ts")
		) {
			files.push(fullPath);
		}
	}

	return files;
}

function printViolation(v: Violation): void {
	const icon = v.severity === "error" ? "❌" : "⚠️";
	console.log(`\n${icon} ${v.severity.toUpperCase()}: ${v.pattern}`);
	console.log(`   File: ${v.file}:${v.line}`);
	console.log(`   Code: ${v.code}`);
	console.log(`   💡 ${v.suggestion}`);
}

function main(): void {
	const args = process.argv.slice(2);
	const isFullAudit = args.includes("--full") || args.includes("--audit");
	const isPreCommit = args.includes("--pre-commit") || args.length === 0;

	console.log("🔍 Checking for programmatic browser actions...\n");

	let filesToCheck: string[];

	if (isFullAudit) {
		console.log("Running full codebase audit...\n");
		filesToCheck = getAllTsFiles(process.cwd());
	} else if (isPreCommit) {
		filesToCheck = getChangedFiles();
		if (filesToCheck.length === 0) {
			console.log("✅ No TypeScript files staged for commit.");
			process.exit(0);
		}
		console.log(`Checking ${filesToCheck.length} staged file(s)...\n`);
	} else {
		filesToCheck = args
			.filter((arg) => !arg.startsWith("--"))
			.map((f) => path.resolve(f));
	}

	const allViolations: Violation[] = [];

	for (const file of filesToCheck) {
		if (!fs.existsSync(file)) continue;
		const violations = checkFile(file);
		allViolations.push(...violations);
	}

	const errors = allViolations.filter((v) => v.severity === "error");
	const warnings = allViolations.filter((v) => v.severity === "warning");

	if (errors.length > 0) {
		console.log(`\n${"=".repeat(60)}`);
		console.log("❌ ERRORS - These MUST be fixed:");
		console.log("=".repeat(60));
		for (const v of errors) {
			printViolation(v);
		}
	}

	if (warnings.length > 0) {
		console.log(`\n${"=".repeat(60)}`);
		console.log("⚠️  WARNINGS:");
		console.log("=".repeat(60));
		for (const v of warnings) {
			printViolation(v);
		}
	}

	console.log(`\n${"=".repeat(60)}`);
	console.log("SUMMARY");
	console.log("=".repeat(60));
	console.log(`Files checked: ${filesToCheck.length}`);
	console.log(`Errors: ${errors.length}`);
	console.log(`Warnings: ${warnings.length}`);

	if (errors.length > 0) {
		console.log("\n❌ Commit blocked! Fix the errors above.");
		console.log("\nUse functions from humanInteraction.ts:");
		console.log(
			"  import { humanClick, humanScroll, humanMove } from '...humanInteraction.ts';",
		);
		console.log("");
		console.log("  • humanClick(page, element) - for ElementHandles");
		console.log("  • humanClickSelector(page, selector) - for CSS selectors");
		console.log(
			"  • humanClickByText(page, ['OK', 'Cancel']) - for text matching",
		);
		console.log("  • humanScroll(page) - for scrolling");
		console.log("  • humanMove(page, {x, y}) - for mouse movement\n");
		process.exit(1);
	}

	console.log("\n✅ All checks passed!");
	process.exit(0);
}

main();
