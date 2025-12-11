/**
 * Enhanced Logger with file persistence, cycle tracking, and error aggregation
 */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { createLogger, type LogPrefix, type Logger } from "./logger.ts";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type CycleStatus = "STARTED" | "COMPLETED" | "FAILED" | "INTERRUPTED";

export interface CycleInfo {
	id: string;
	startTime: Date;
	endTime?: Date;
	status: CycleStatus;
	profilesProcessed: number;
	creatorsFound: number;
	errors: CycleError[];
	duration?: number;
}

export interface CycleError {
	timestamp: Date;
	type: string;
	message: string;
	context?: string;
	profile?: string;
	stack?: string;
}

export interface EnhancedLogger extends Logger {
	// Cycle management
	startCycle(cycleId: string, context?: string): void;
	endCycle(status: CycleStatus, summary?: Record<string, any>): void;
	getCurrentCycle(): CycleInfo | null;

	// Enhanced error tracking
	recordError(
		type: string,
		message: string,
		context?: string,
		profile?: string,
		error?: Error,
	): void;

	// Performance tracking
	startTimer(label: string): () => void;
	time(label: string, operation: () => Promise<void> | void): Promise<void>;

	// Statistics
	getCycleSummary(): {
		totalCycles: number;
		successfulCycles: number;
		failedCycles: number;
		averageDuration: number;
		totalErrors: number;
	};

	// File logging
	flushLogs(): void;
}

class EnhancedLoggerImpl implements EnhancedLogger {
	private baseLogger: Logger;
	private logsDir: string;
	private currentCycle: CycleInfo | null = null;
	private cycleHistory: CycleInfo[] = [];
	private timers: Map<string, number> = new Map();
	private fileBuffer: string[] = [];

	constructor(debug: boolean = false) {
		this.baseLogger = createLogger(debug);
		this.logsDir = join(process.cwd(), "logs");

		// Ensure logs directory exists
		if (!existsSync(this.logsDir)) {
			mkdirSync(this.logsDir, { recursive: true });
		}

		// Log startup
		this.logToFile("SYSTEM", "INFO", "Enhanced Logger initialized", {
			timestamp: new Date().toISOString(),
			debug,
			logsDir: this.logsDir,
		});
	}

	private logToFile(
		prefix: string,
		level: LogLevel,
		message: string,
		data?: any,
	): void {
		const timestamp = new Date().toISOString();
		const logEntry = {
			timestamp,
			level,
			prefix,
			message,
			...(data && { data }),
			...(this.currentCycle && { cycleId: this.currentCycle.id }),
		};

		const logLine = `[${timestamp}] ${level} [${prefix}] ${message}`;
		const fullLog = data ? `${logLine} ${JSON.stringify(data)}` : logLine;

		// Buffer for file writing (flush on cycle end or periodically)
		this.fileBuffer.push(JSON.stringify(logEntry));

		// Write immediately for errors
		if (level === "ERROR") {
			this.flushLogs();
		}
	}

	private formatMessage(
		prefix: LogPrefix,
		message: string,
		...args: unknown[]
	): string {
		const argsStr = args.length > 0 ? ` ${args.map(String).join(" ")}` : "";
		const cycleInfo = this.currentCycle
			? ` [CYCLE:${this.currentCycle.id}]`
			: "";
		return `[${prefix}]${cycleInfo} ${message}${argsStr}`;
	}

	// Logger interface implementation
	debug(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.baseLogger.debug(prefix, message, ...args);
		this.logToFile(
			prefix,
			"DEBUG",
			this.formatMessage(prefix, message, ...args),
		);
	}

	info(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.baseLogger.info(prefix, message, ...args);
		this.logToFile(
			prefix,
			"INFO",
			this.formatMessage(prefix, message, ...args),
		);
	}

	warn(prefix: LogPrefix, message: string, ...args: unknown[]): void {
		this.baseLogger.warn(prefix, message, ...args);
		this.logToFile(
			prefix,
			"WARN",
			this.formatMessage(prefix, message, ...args),
		);
	}

	error(
		prefix: LogPrefix,
		message: string,
		screenshotPath?: string,
		...args: unknown[]
	): void {
		this.baseLogger.error(prefix, message, screenshotPath, ...args);
		this.logToFile(
			prefix,
			"ERROR",
			this.formatMessage(prefix, message, ...args),
			{
				screenshotPath,
			},
		);
	}

	async errorWithScreenshot(
		prefix: LogPrefix,
		message: string,
		page: Page,
		context: string,
		...args: unknown[]
	): Promise<void> {
		await this.baseLogger.errorWithScreenshot(
			prefix,
			message,
			page,
			context,
			...args,
		);
		this.logToFile(
			prefix,
			"ERROR",
			this.formatMessage(prefix, message, ...args),
			{
				context,
				hasScreenshot: true,
			},
		);
	}

	// Enhanced functionality
	startCycle(cycleId: string, context?: string): void {
		// End any current cycle
		if (this.currentCycle) {
			this.endCycle("INTERRUPTED", { reason: "New cycle started" });
		}

		this.currentCycle = {
			id: cycleId,
			startTime: new Date(),
			status: "STARTED",
			profilesProcessed: 0,
			creatorsFound: 0,
			errors: [],
		};

		this.info("CYCLE", `Started cycle ${cycleId}`, context || "");
		this.logToFile("CYCLE", "INFO", `Cycle ${cycleId} started`, {
			cycleId,
			context,
			startTime: this.currentCycle.startTime.toISOString(),
		});
	}

	endCycle(status: CycleStatus, summary?: Record<string, any>): void {
		if (!this.currentCycle) return;

		this.currentCycle.endTime = new Date();
		this.currentCycle.status = status;
		this.currentCycle.duration =
			this.currentCycle.endTime.getTime() -
			this.currentCycle.startTime.getTime();

		const summaryInfo = {
			cycleId: this.currentCycle.id,
			duration: Math.round(this.currentCycle.duration / 1000),
			profilesProcessed: this.currentCycle.profilesProcessed,
			creatorsFound: this.currentCycle.creatorsFound,
			errorCount: this.currentCycle.errors.length,
			status,
			...summary,
		};

		this.info("CYCLE", `Completed cycle ${this.currentCycle.id}`, summaryInfo);
		this.logToFile(
			"CYCLE",
			"INFO",
			`Cycle ${this.currentCycle.id} completed`,
			summaryInfo,
		);

		// Add to history
		this.cycleHistory.push({ ...this.currentCycle });

		// Flush logs to file
		this.flushLogs();

		this.currentCycle = null;
	}

	getCurrentCycle(): CycleInfo | null {
		return this.currentCycle;
	}

	recordError(
		type: string,
		message: string,
		context?: string,
		profile?: string,
		error?: Error,
	): void {
		const errorInfo: CycleError = {
			timestamp: new Date(),
			type,
			message,
			context,
			profile,
			...(error && { stack: error.stack }),
		};

		if (this.currentCycle) {
			this.currentCycle.errors.push(errorInfo);
		}

		this.error("ERROR", `${type}: ${message}`, undefined, {
			context,
			profile,
			stack: error?.stack,
		});

		this.logToFile("ERROR", "ERROR", `${type}: ${message}`, {
			type,
			context,
			profile,
			stack: error?.stack,
			cycleId: this.currentCycle?.id,
		});
	}

	startTimer(label: string): () => void {
		const startTime = Date.now();
		this.timers.set(label, startTime);
		this.debug("TIMER", `Started timer: ${label}`);

		return () => {
			const endTime = Date.now();
			const duration = endTime - startTime;
			this.timers.delete(label);
			this.debug("TIMER", `Timer ${label} completed in ${duration}ms`);
			return duration;
		};
	}

	async time(
		label: string,
		operation: () => Promise<void> | void,
	): Promise<void> {
		const endTimer = this.startTimer(label);
		try {
			await operation();
		} finally {
			endTimer();
		}
	}

	getCycleSummary() {
		const totalCycles = this.cycleHistory.length;
		const successfulCycles = this.cycleHistory.filter(
			(c) => c.status === "COMPLETED",
		).length;
		const failedCycles = this.cycleHistory.filter(
			(c) => c.status === "FAILED",
		).length;
		const completedCycles = this.cycleHistory.filter((c) => c.duration);
		const averageDuration =
			completedCycles.length > 0
				? completedCycles.reduce((sum, c) => sum + (c.duration || 0), 0) /
					completedCycles.length
				: 0;
		const totalErrors = this.cycleHistory.reduce(
			(sum, c) => sum + c.errors.length,
			0,
		);

		return {
			totalCycles,
			successfulCycles,
			failedCycles,
			averageDuration: Math.round(averageDuration / 1000), // seconds
			totalErrors,
		};
	}

	flushLogs(): void {
		if (this.fileBuffer.length === 0) return;

		const date = new Date().toISOString().split("T")[0];
		const logFile = join(this.logsDir, `scout-${date}.log`);

		try {
			const logContent = this.fileBuffer.join("\n") + "\n";
			appendFileSync(logFile, logContent, "utf8");
			this.fileBuffer = [];
		} catch (error) {
			console.error("Failed to write logs to file:", error);
		}
	}

	// Utility methods for cycle tracking
	incrementProfilesProcessed(count: number = 1): void {
		if (this.currentCycle) {
			this.currentCycle.profilesProcessed += count;
		}
	}

	incrementCreatorsFound(count: number = 1): void {
		if (this.currentCycle) {
			this.currentCycle.creatorsFound += count;
		}
	}
}

/**
 * Create an enhanced logger instance
 */
export function createEnhancedLogger(debug: boolean = false): EnhancedLogger {
	return new EnhancedLoggerImpl(debug);
}
