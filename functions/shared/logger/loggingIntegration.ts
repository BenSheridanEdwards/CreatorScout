/**
 * Logging Integration - Easy integration with existing scrape.ts
 */
import { createEnhancedLogger, type EnhancedLogger } from "./enhancedLogger.ts";
import { CycleManager } from "./cycleManager.ts";

export interface LoggingConfig {
	debug: boolean;
	enableFileLogging: boolean;
	enableCycleTracking: boolean;
	errorThresholds: {
		maxCriticalErrors: number;
		maxHighErrors: number;
		maxTotalErrors: number;
	};
}

const defaultConfig: LoggingConfig = {
	debug: false,
	enableFileLogging: true,
	enableCycleTracking: true,
	errorThresholds: {
		maxCriticalErrors: 3,
		maxHighErrors: 10,
		maxTotalErrors: 50,
	},
};

/**
 * Enhanced logging system that integrates with existing code
 */
export class LoggingIntegration {
	private logger: EnhancedLogger;
	private cycleManager: CycleManager;
	private config: LoggingConfig;

	constructor(config: Partial<LoggingConfig> = {}) {
		this.config = { ...defaultConfig, ...config };
		this.logger = createEnhancedLogger(this.config.debug);
		this.cycleManager = new CycleManager(this.logger);
	}

	/**
	 * Get the logger instance (compatible with existing Logger interface)
	 */
	getLogger(): EnhancedLogger {
		return this.logger;
	}

	/**
	 * Get the cycle manager
	 */
	getCycleManager(): CycleManager {
		return this.cycleManager;
	}

	/**
	 * Start a scraping cycle
	 */
	startCycle(seedUsername?: string, estimatedProfiles?: number): string {
		return this.cycleManager.startCycle(seedUsername, estimatedProfiles);
	}

	/**
	 * End current cycle with status
	 */
	endCycle(
		status: "COMPLETED" | "FAILED" | "INTERRUPTED",
		reason?: string,
	): void {
		this.cycleManager.endCycle(status, { reason });
	}

	/**
	 * Record profile processing
	 */
	recordProfileProcessed(username: string, isCreator: boolean = false): void {
		this.cycleManager.recordProfileProcessed(username, isCreator);
	}

	/**
	 * Record actions
	 */
	recordDMSent(username: string): void {
		this.cycleManager.recordDMSent(username);
	}

	recordFollowCompleted(username: string): void {
		this.cycleManager.recordFollowCompleted(username);
	}

	/**
	 * Record errors with automatic severity detection
	 */
	recordError(error: Error | string, context: string, profile?: string): void {
		const errorMessage = error instanceof Error ? error.message : error;
		const errorType = this.detectErrorType(errorMessage, context);

		let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM";

		// Auto-detect severity based on error patterns
		if (
			errorMessage.includes("rate limit") ||
			errorMessage.includes("blocked")
		) {
			severity = "HIGH";
		} else if (
			errorMessage.includes("login") ||
			errorMessage.includes("auth")
		) {
			severity = "CRITICAL";
		} else if (
			errorMessage.includes("timeout") ||
			errorMessage.includes("network")
		) {
			severity = "HIGH";
		} else if (
			errorMessage.includes("not found") ||
			errorMessage.includes("private")
		) {
			severity = "LOW";
		}

		this.cycleManager.recordError(
			errorType,
			errorMessage,
			context,
			profile,
			severity,
		);
	}

	/**
	 * Record warnings
	 */
	recordWarning(
		type:
			| "PROFILE_PRIVATE"
			| "PROFILE_NOT_FOUND"
			| "DM_ALREADY_SENT"
			| "ALREADY_FOLLOWING",
		message: string,
		profile?: string,
	): void {
		this.cycleManager.recordWarning(type, message, profile);
	}

	/**
	 * Check if cycle should continue
	 */
	shouldContinue(): boolean {
		return this.cycleManager.shouldContinue();
	}

	/**
	 * Get current cycle status
	 */
	getCurrentCycleStatus(): {
		cycleId: string | null;
		profilesProcessed: number;
		creatorsFound: number;
		errors: number;
		warnings: number;
		duration: number;
	} | null {
		const context = this.cycleManager.getCurrentContext();
		if (!context) return null;

		return {
			cycleId: context.cycleId,
			profilesProcessed: context.profilesProcessed,
			creatorsFound: context.creatorsFound,
			errors: context.errors.length,
			warnings: context.warnings.length,
			duration: Date.now() - context.startTime.getTime(),
		};
	}

	/**
	 * Get comprehensive cycle summary
	 */
	getCycleSummary(): {
		currentCycle: any;
		recentCycles: any[];
		overallStats: any;
	} {
		return {
			currentCycle: this.getCurrentCycleStatus(),
			recentCycles: this.cycleManager.getRecentCycles(5),
			overallStats: this.cycleManager.getCycleSummary(),
		};
	}

	/**
	 * Flush all logs to files
	 */
	flushLogs(): void {
		this.logger.flushLogs();
	}

	/**
	 * Detect error type from error message and context
	 */
	private detectErrorType(
		message: string,
		context: string,
	):
		| "NETWORK"
		| "AUTHENTICATION"
		| "RATE_LIMIT"
		| "ELEMENT_NOT_FOUND"
		| "TIMEOUT"
		| "UNKNOWN" {
		const msg = message.toLowerCase();
		const ctx = context.toLowerCase();

		if (msg.includes("rate limit") || msg.includes("too many requests")) {
			return "RATE_LIMIT";
		}
		if (
			msg.includes("login") ||
			msg.includes("auth") ||
			msg.includes("session")
		) {
			return "AUTHENTICATION";
		}
		if (msg.includes("timeout") || ctx.includes("timeout")) {
			return "TIMEOUT";
		}
		if (
			msg.includes("not found") ||
			msg.includes("element") ||
			msg.includes("selector")
		) {
			return "ELEMENT_NOT_FOUND";
		}
		if (
			msg.includes("network") ||
			msg.includes("connection") ||
			msg.includes("fetch")
		) {
			return "NETWORK";
		}

		return "UNKNOWN";
	}
}

/**
 * Create a logging integration instance
 */
export function createLoggingIntegration(
	config: Partial<LoggingConfig> = {},
): LoggingIntegration {
	return new LoggingIntegration(config);
}

/**
 * Convenience function to create logger compatible with existing code
 */
export function createLoggerWithCycleTracking(debug: boolean = false): {
	logger: EnhancedLogger;
	cycleManager: CycleManager;
	startCycle: (seedUsername?: string, estimatedProfiles?: number) => string;
	endCycle: (
		status: "COMPLETED" | "FAILED" | "INTERRUPTED",
		reason?: string,
	) => void;
	recordError: (
		error: Error | string,
		context: string,
		profile?: string,
	) => void;
	shouldContinue: () => boolean;
} {
	const integration = createLoggingIntegration({ debug });

	return {
		logger: integration.getLogger(),
		cycleManager: integration.getCycleManager(),
		startCycle: integration.startCycle.bind(integration),
		endCycle: integration.endCycle.bind(integration),
		recordError: integration.recordError.bind(integration),
		shouldContinue: integration.shouldContinue.bind(integration),
	};
}
