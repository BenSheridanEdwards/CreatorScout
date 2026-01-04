import type { Page } from "puppeteer";
import { DEBUG_SCREENSHOTS } from "../config/config.ts";
import { snapshot } from "../snapshot/snapshot.ts";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type LogPrefix =
	| "ACTION"
	| "AUTH"
	| "CYCLE"
	| "DATABASE"
	| "SCREENSHOT"
	| "NAVIGATION"
	| "ANALYSIS"
	| "QUEUE"
	| "SEED"
	| "PROFILE"
	| "ERROR"
	| "FATAL"
	| "STATS"
	| "SYSTEM"
	| "METRICS"
	| "LIMIT"
	| "DELAY"
	| "VISION"
	| "INTENTION"
	| "TIMER"
	| "VERIFY"
	| "NAVIGATE"
	| "WAIT"
	| "SUCCESS"
	| "SESSION"
	| "ADSPOWER"
	| "CRON"
	| "PROFILES"
	| "PROXY"
	| "SCHEDULER"
	| "COSTS"
	| "ENGAGEMENT"
	| "WARMUP"
	| "LIMITS"
	| "TEST"
	| "RAMPUP"
	| "SUMMARY"
	| "DM_TEST"
	| "SESSION_CONTROL"
	| "SESSION_COMPLETE"
	| "SESSION_PLAN"
	| "LINK_ANALYSIS"
	| "EXTRACTION"
	| "PROXY_TEST";

export interface Logger {
	debug(prefix: LogPrefix, message: string, ...args: unknown[]): void;
	info(prefix: LogPrefix, message: string, ...args: unknown[]): void;
	warn(prefix: LogPrefix, message: string, ...args: unknown[]): void;
	error(
		prefix: LogPrefix,
		message: string,
		screenshotPath?: string,
		...args: unknown[]
	): void;
	/**
	 * Log an error and take a screenshot automatically
	 */
	errorWithScreenshot(
		prefix: LogPrefix,
		message: string,
		page: Page,
		context: string,
		...args: unknown[]
	): Promise<void>;
}

class LoggerImpl implements Logger {
	private slugifyForPath(input: string, maxLen: number = 80): string {
		// Lowercase, replace non-word characters with dashes, collapse repeats, trim
		const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-");
		const collapsed = base.replace(/-+/g, "-").replace(/^-|-$/g, "");
		return collapsed.slice(0, maxLen);
	}

	private formatMessage(
		_level: LogLevel,
		prefix: LogPrefix,
		message: string,
		...args: unknown[]
	): string {
		const argsStr = args.length > 0 ? ` ${args.map(String).join(" ")}` : "";
		return `[${prefix}] ${message}${argsStr}`;
	}

	private log(
		level: LogLevel,
		prefix: LogPrefix,
		message: string,
		...args: unknown[]
	): void {
		// All logs always show - Instagram can't see our server logs anyway
		// The enabled flag is kept for backward compatibility but ignored
		const formatted = this.formatMessage(level, prefix, message, ...args);

		switch (level) {
			case "DEBUG":
			case "INFO":
				console.log(formatted);
				break;
			case "WARN":
				console.warn(formatted);
				break;
			case "ERROR":
				console.error(formatted);
				break;
		}
	}

	debug(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.log("DEBUG", prefix, message, ...args);
	}

	info(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.log("INFO", prefix, message, ...args);
	}

	warn(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.log("WARN", prefix, message, ...args);
	}

	error(
		prefix: LogPrefix,
		message: string,
		screenshotPath?: string,
		...args: unknown[]
	): void {
		const screenshotInfo = screenshotPath
			? ` - screenshot: ${screenshotPath}`
			: "";
		this.log("ERROR", prefix, `${message}${screenshotInfo}`, ...args);
	}

	async errorWithScreenshot(
		prefix: LogPrefix,
		message: string,
		page: Page,
		context: string,
		...args: unknown[]
	): Promise<void> {
		// Only take screenshot if DEBUG_SCREENSHOTS is enabled
		if (!DEBUG_SCREENSHOTS) {
			// Still log the error, just without screenshot
			this.error(prefix, message, undefined, ...args);
			return;
		}

		try {
			const reasonSlug = this.slugifyForPath(message);
			const label =
				reasonSlug.length > 0
					? `error_${context}_${reasonSlug}`
					: `error_${context}`;
			const screenshotPath = await snapshot(page, label, false);
			this.error(prefix, message, screenshotPath || undefined, ...args);
		} catch (screenshotError) {
			// If screenshot fails, still log the error
			this.error(
				prefix,
				`${message} (screenshot failed: ${screenshotError})`,
				undefined,
				...args,
			);
		}
	}
}

/**
 * Create a logger instance
 */
export function createLogger(): Logger {
	return new LoggerImpl();
}

export {
	type CycleContext,
	type CycleError,
	CycleManager,
	type CycleWarning,
} from "./cycleManager.ts";
// Re-export enhanced logging functionality
export { createEnhancedLogger, type EnhancedLogger } from "./enhancedLogger.ts";
export {
	createLoggerWithCycleTracking,
	createLoggingIntegration,
	type LoggingConfig,
} from "./loggingIntegration.ts";
