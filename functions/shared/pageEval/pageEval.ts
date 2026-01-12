/**
 * Safe page.evaluate wrappers that handle bundler __name errors.
 *
 * The __name error occurs when Bun/esbuild/tsx transforms function names
 * and the __name helper doesn't exist in the browser context.
 */
import type { ElementHandle, Page } from "puppeteer";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

/**
 * Check if an error is a bundler __name error.
 */
export function isBundlerError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return msg.includes("__name") || msg.includes("is not defined");
}

/**
 * Safe wrapper for page.evaluate that catches bundler errors.
 * Returns null if bundler error occurs, allowing caller to fallback.
 */
export async function safeEvaluate<T>(
	page: Page,
	fn: () => T,
	context: string = "evaluate",
): Promise<T | null> {
	try {
		return await page.evaluate(fn);
	} catch (error) {
		if (isBundlerError(error)) {
			logger.warn(
				"PROFILE",
				`Bundler error in ${context}: ${error instanceof Error ? error.message : error}`,
			);
			return null;
		}
		throw error;
	}
}

/**
 * Safe wrapper for page.$$eval that catches bundler errors.
 * Returns empty array if bundler error occurs.
 */
export async function safe$$Eval<T>(
	page: Page,
	selector: string,
	fn: (elements: Element[]) => T,
	context: string = "$$eval",
): Promise<T | null> {
	try {
		return await page.$$eval(selector, fn);
	} catch (error) {
		if (isBundlerError(error)) {
			logger.warn(
				"PROFILE",
				`Bundler error in ${context}: ${error instanceof Error ? error.message : error}`,
			);
			return null;
		}
		throw error;
	}
}

/**
 * Safe wrapper for elementHandle.evaluate that catches bundler errors.
 */
export async function safeElementEvaluate<T>(
	element: ElementHandle,
	fn: (el: Element) => T,
	context: string = "element.evaluate",
): Promise<T | null> {
	try {
		return await element.evaluate(fn);
	} catch (error) {
		if (isBundlerError(error)) {
			logger.warn(
				"PROFILE",
				`Bundler error in ${context}: ${error instanceof Error ? error.message : error}`,
			);
			return null;
		}
		throw error;
	}
}
