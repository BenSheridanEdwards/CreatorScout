/**
 * Cycle Manager for tracking scraping cycles and their completion status
 */
import { randomBytes } from "node:crypto";
import {
	createEnhancedLogger,
	type CycleStatus,
	type EnhancedLogger,
} from "./enhancedLogger.ts";

export interface CycleContext {
	cycleId: string;
	startTime: Date;
	seedUsername?: string;
	profilesToProcess: number;
	profilesProcessed: number;
	creatorsFound: number;
	dmsSent: number;
	followsCompleted: number;
	errors: CycleError[];
	warnings: CycleWarning[];
}

export interface CycleError {
	timestamp: Date;
	type:
		| "NETWORK"
		| "AUTHENTICATION"
		| "RATE_LIMIT"
		| "ELEMENT_NOT_FOUND"
		| "TIMEOUT"
		| "UNKNOWN";
	message: string;
	profile?: string;
	context: string;
	severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CycleWarning {
	timestamp: Date;
	type:
		| "PROFILE_PRIVATE"
		| "PROFILE_NOT_FOUND"
		| "DM_ALREADY_SENT"
		| "ALREADY_FOLLOWING";
	message: string;
	profile?: string;
}

export class CycleManager {
	private logger: EnhancedLogger;
	private currentContext: CycleContext | null = null;
	private cycleQueue: CycleContext[] = [];

	constructor(logger?: EnhancedLogger) {
		this.logger = logger || createEnhancedLogger();
	}

	/**
	 * Start a new scraping cycle
	 */
	startCycle(seedUsername?: string, profilesToProcess: number = 0): string {
		const cycleId = this.generateCycleId();

		this.currentContext = {
			cycleId,
			startTime: new Date(),
			seedUsername,
			profilesToProcess,
			profilesProcessed: 0,
			creatorsFound: 0,
			dmsSent: 0,
			followsCompleted: 0,
			errors: [],
			warnings: [],
		};

		this.logger.startCycle(
			cycleId,
			seedUsername ? `seed:${seedUsername}` : "manual",
		);

		this.logger.info("CYCLE", `🚀 Started scraping cycle ${cycleId}`, {
			seed: seedUsername,
			targetProfiles: profilesToProcess,
		});

		return cycleId;
	}

	/**
	 * Record a successful profile processing
	 */
	recordProfileProcessed(username: string, isCreator: boolean = false): void {
		if (!this.currentContext) return;

		this.currentContext.profilesProcessed++;

		if (isCreator) {
			this.currentContext.creatorsFound++;
			this.logger.incrementCreatorsFound();
		}

		this.logger.incrementProfilesProcessed();
		this.logger.debug("PROFILE", `Processed @${username}`, {
			isCreator,
			totalProcessed: this.currentContext.profilesProcessed,
			creatorsFound: this.currentContext.creatorsFound,
		});
	}

	/**
	 * Record a DM sent
	 */
	recordDMSent(username: string): void {
		if (!this.currentContext) return;
		this.currentContext.dmsSent++;
		this.logger.debug("ACTION", `DM sent to @${username}`);
	}

	/**
	 * Record a follow completed
	 */
	recordFollowCompleted(username: string): void {
		if (!this.currentContext) return;
		this.currentContext.followsCompleted++;
		this.logger.debug("ACTION", `Followed @${username}`);
	}

	/**
	 * Record an error that occurred during the cycle
	 */
	recordError(
		type: CycleError["type"],
		message: string,
		context: string,
		profile?: string,
		severity: CycleError["severity"] = "MEDIUM",
	): void {
		if (!this.currentContext) return;

		const error: CycleError = {
			timestamp: new Date(),
			type,
			message,
			context,
			profile,
			severity,
		};

		this.currentContext.errors.push(error);

		this.logger.recordError(type, message, context, profile);

		// Log based on severity
		const logMessage = `${type}: ${message}${profile ? ` (@${profile})` : ""}`;

		switch (severity) {
			case "CRITICAL":
				this.logger.error("ERROR", `🚨 CRITICAL: ${logMessage}`);
				break;
			case "HIGH":
				this.logger.error("ERROR", `🔴 HIGH: ${logMessage}`);
				break;
			case "MEDIUM":
				this.logger.warn("ERROR", `🟡 MEDIUM: ${logMessage}`);
				break;
			case "LOW":
				this.logger.warn("ERROR", `🟢 LOW: ${logMessage}`);
				break;
		}
	}

	/**
	 * Record a warning during the cycle
	 */
	recordWarning(
		type: CycleWarning["type"],
		message: string,
		profile?: string,
	): void {
		if (!this.currentContext) return;

		const warning: CycleWarning = {
			timestamp: new Date(),
			type,
			message,
			profile,
		};

		this.currentContext.warnings.push(warning);

		this.logger.warn(
			"PROFILE",
			`${type}: ${message}${profile ? ` (@${profile})` : ""}`,
		);
	}

	/**
	 * Check if cycle should continue based on error thresholds
	 */
	shouldContinue(): boolean {
		if (!this.currentContext) return false;

		const criticalErrors = this.currentContext.errors.filter(
			(e) => e.severity === "CRITICAL",
		).length;
		const highErrors = this.currentContext.errors.filter(
			(e) => e.severity === "HIGH",
		).length;

		// Stop cycle if too many critical errors or high errors
		if (criticalErrors >= 3) {
			this.logger.error(
				"CYCLE",
				`Stopping cycle due to too many critical errors: ${criticalErrors}`,
			);
			return false;
		}

		if (highErrors >= 10) {
			this.logger.warn(
				"CYCLE",
				"Stopping cycle due to too many high-severity errors",
				{
					highErrors,
				},
			);
			return false;
		}

		return true;
	}

	/**
	 * End the current cycle with success or failure status
	 */
	endCycle(status: CycleStatus, reason?: string): void {
		if (!this.currentContext) return;

		const context = this.currentContext;
		const duration = Date.now() - context.startTime.getTime();

		// Calculate success rate
		const successRate =
			context.profilesToProcess > 0
				? (context.profilesProcessed / context.profilesToProcess) * 100
				: 0;

		const summary = {
			duration: Math.round(duration / 1000), // seconds
			profilesProcessed: context.profilesProcessed,
			creatorsFound: context.creatorsFound,
			dmsSent: context.dmsSent,
			followsCompleted: context.followsCompleted,
			successRate: Math.round(successRate * 100) / 100,
			totalErrors: context.errors.length,
			totalWarnings: context.warnings.length,
			errorBreakdown: this.getErrorBreakdown(context.errors),
			reason,
		};

		// Log final statistics
		this.logger.info("STATS", `📊 Cycle ${context.cycleId} Summary:`, summary);

		// Log errors if any
		if (context.errors.length > 0) {
			this.logger.warn(
				"STATS",
				`⚠️  Cycle had ${context.errors.length} errors:`,
				{
					critical: context.errors.filter((e) => e.severity === "CRITICAL")
						.length,
					high: context.errors.filter((e) => e.severity === "HIGH").length,
					medium: context.errors.filter((e) => e.severity === "MEDIUM").length,
					low: context.errors.filter((e) => e.severity === "LOW").length,
				},
			);
		}

		// End the cycle in the logger
		this.logger.endCycle(status, summary);

		// Move to completed cycles
		this.cycleQueue.push(context);
		this.currentContext = null;
	}

	/**
	 * Get current cycle context
	 */
	getCurrentContext(): CycleContext | null {
		return this.currentContext;
	}

	/**
	 * Get cycle summary statistics
	 */
	getCycleSummary() {
		return this.logger.getCycleSummary();
	}

	/**
	 * Get detailed error breakdown
	 */
	private getErrorBreakdown(errors: CycleError[]): Record<string, number> {
		const breakdown: Record<string, number> = {};
		for (const error of errors) {
			breakdown[error.type] = (breakdown[error.type] || 0) + 1;
		}
		return breakdown;
	}

	/**
	 * Generate a unique cycle ID
	 */
	private generateCycleId(): string {
		const timestamp = Date.now().toString(36);
		const random = randomBytes(4).toString("hex").substring(0, 4);
		return `cycle_${timestamp}_${random}`;
	}

	/**
	 * Get recent cycle history
	 */
	getRecentCycles(limit: number = 10): CycleContext[] {
		return this.cycleQueue.slice(-limit);
	}
}
