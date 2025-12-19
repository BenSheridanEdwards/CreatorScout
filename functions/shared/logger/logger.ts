import type { Page } from "puppeteer";
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
	| "VISION";

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
	private enabled: boolean;

	constructor(debug: boolean = false) {
		this.enabled = debug;
	}

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
		if (!this.enabled) return;

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
		try {
			const reasonSlug = this.slugifyForPath(message);
			const label =
				reasonSlug.length > 0
					? `error_${context}_${reasonSlug}`
					: `error_${context}`;
			const screenshotPath = await snapshot(page, label);
			this.error(prefix, message, screenshotPath, ...args);
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
 * @param debug - If true, logs will be output. If false, all logs are silenced.
 */
export function createLogger(debug: boolean = false): Logger {
	return new LoggerImpl(debug);
}

// Re-export enhanced logging functionality
export { createEnhancedLogger, type EnhancedLogger } from "./enhancedLogger.ts";
export {
	CycleManager,
	type CycleContext,
	type CycleError,
	type CycleWarning,
} from "./cycleManager.ts";
export {
	createLoggingIntegration,
	createLoggerWithCycleTracking,
	type LoggingConfig,
} from "./loggingIntegration.ts";
