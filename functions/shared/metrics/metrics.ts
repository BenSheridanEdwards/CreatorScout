/**
 * Metrics tracking utilities for Scout
 */
import { v4 as uuidv4 } from "uuid";
import {
	type SessionMetrics,
	type DailyMetrics,
	startSessionMetrics,
	updateSessionMetrics,
	recordProfileMetrics,
	recordError,
	getDailyMetrics,
} from "../database/database.ts";

export class MetricsTracker {
	private sessionId: string;
	private sessionStartTime: Date;
	private sessionMetrics: SessionMetrics;

	constructor(sessionId?: string) {
		this.sessionId = sessionId || uuidv4();
		this.sessionStartTime = new Date();
		this.sessionMetrics = {
			sessionId: this.sessionId,
			startTime: this.sessionStartTime,
			profilesVisited: 0,
			creatorsFound: 0,
			dmsSent: 0,
			followsCompleted: 0,
			errorsEncountered: 0,
			rateLimitsHit: 0,
			totalProcessingTime: 0,
			visionApiCalls: 0,
			visionApiCost: 0,
		};

		// Initialize session in database
		startSessionMetrics(this.sessionId);
	}

	// Profile processing metrics
	recordProfileVisit(
		username: string,
		processingTimeSeconds: number,
		discoverySource: string,
		discoveryDepth: number,
		sourceProfile?: string,
		contentCategories?: string[],
		visionApiCalls: number = 0,
	): void {
		this.sessionMetrics.profilesVisited++;
		this.sessionMetrics.totalProcessingTime += processingTimeSeconds;

		recordProfileMetrics(username, {
			processingTimeSeconds,
			discoverySource,
			discoveryDepth,
			sessionId: this.sessionId,
			contentCategories,
			visionApiCalls,
			sourceProfile,
		});

		this.updateSessionMetrics();
	}

	// Creator discovery metrics
	recordCreatorFound(
		username: string,
		confidence: number,
		visionApiCalls: number = 0,
	): void {
		this.sessionMetrics.creatorsFound++;
		this.sessionMetrics.visionApiCalls += visionApiCalls;
		this.updateSessionMetrics();
	}

	// Action metrics
	recordDMSent(username: string): void {
		this.sessionMetrics.dmsSent++;
		this.updateSessionMetrics();
	}

	recordFollowCompleted(username: string): void {
		this.sessionMetrics.followsCompleted++;
		this.updateSessionMetrics();
	}

	// Error tracking
	recordError(
		username: string,
		errorType: string,
		errorMessage?: string,
	): void {
		this.sessionMetrics.errorsEncountered++;
		recordError(username, errorType, errorMessage);
		this.updateSessionMetrics();
	}

	recordRateLimit(): void {
		this.sessionMetrics.rateLimitsHit++;
		this.updateSessionMetrics();
	}

	// Vision API tracking
	recordVisionApiCall(cost: number = 0.001): void {
		// Default ~$0.001 per call
		this.sessionMetrics.visionApiCalls++;
		this.sessionMetrics.visionApiCost += cost;
		this.updateSessionMetrics();
	}

	// Session management
	endSession(): void {
		this.sessionMetrics.endTime = new Date();
		this.updateSessionMetrics();
	}

	// Getters
	getSessionId(): string {
		return this.sessionId;
	}

	getSessionMetrics(): SessionMetrics {
		return { ...this.sessionMetrics };
	}

	// Calculate averages
	getAverageProcessingTime(): number {
		if (this.sessionMetrics.profilesVisited === 0) return 0;
		return (
			this.sessionMetrics.totalProcessingTime /
			this.sessionMetrics.profilesVisited
		);
	}

	getAverageBioScore(): number {
		// This would need to be calculated from profile data
		// For now, return 0 as placeholder
		return 0;
	}

	getAverageConfidence(): number {
		// This would need to be calculated from creator profiles
		// For now, return 0 as placeholder
		return 0;
	}

	private updateSessionMetrics(): void {
		const metrics = {
			profilesVisited: this.sessionMetrics.profilesVisited,
			creatorsFound: this.sessionMetrics.creatorsFound,
			dmsSent: this.sessionMetrics.dmsSent,
			followsCompleted: this.sessionMetrics.followsCompleted,
			avgProcessingTime: this.getAverageProcessingTime(),
			errorsEncountered: this.sessionMetrics.errorsEncountered,
			rateLimitsHit: this.sessionMetrics.rateLimitsHit,
			visionApiCost: this.sessionMetrics.visionApiCost,
		};

		updateSessionMetrics(this.sessionId, metrics);
	}
}

// Global metrics tracker instance
let globalMetricsTracker: MetricsTracker | null = null;

export function getGlobalMetricsTracker(): MetricsTracker {
	if (!globalMetricsTracker) {
		globalMetricsTracker = new MetricsTracker();
	}
	return globalMetricsTracker;
}

export function createMetricsTracker(sessionId?: string): MetricsTracker {
	return new MetricsTracker(sessionId);
}

// Utility functions for metrics analysis
export function getMetricsSummary(date?: string): {
	daily: DailyMetrics | null;
	sessionSuccessRate: number;
	creatorConversionRate: number;
	dmSuccessRate: number;
	averageProcessingTime: number;
} {
	const dailyMetrics = getDailyMetrics(date);

	if (!dailyMetrics) {
		return {
			daily: null,
			sessionSuccessRate: 0,
			creatorConversionRate: 0,
			dmSuccessRate: 0,
			averageProcessingTime: 0,
		};
	}

	const sessionSuccessRate =
		dailyMetrics.totalSessions > 0
			? dailyMetrics.totalProfilesVisited / dailyMetrics.totalSessions
			: 0;

	const creatorConversionRate =
		dailyMetrics.totalProfilesVisited > 0
			? (dailyMetrics.totalCreatorsFound / dailyMetrics.totalProfilesVisited) *
				100
			: 0;

	const dmSuccessRate =
		dailyMetrics.totalCreatorsFound > 0
			? (dailyMetrics.totalDmsSent / dailyMetrics.totalCreatorsFound) * 100
			: 0;

	return {
		daily: dailyMetrics,
		sessionSuccessRate,
		creatorConversionRate,
		dmSuccessRate,
		averageProcessingTime: 0, // Would need to calculate from session data
	};
}

// Performance monitoring helpers
export class PerformanceTimer {
	private startTime: number;
	private label: string;

	constructor(label: string) {
		this.startTime = Date.now();
		this.label = label;
	}

	end(): number {
		const duration = (Date.now() - this.startTime) / 1000; // Convert to seconds
		console.log(`[${this.label}] Completed in ${duration.toFixed(2)}s`);
		return duration;
	}
}

export function startTimer(label: string): PerformanceTimer {
	return new PerformanceTimer(label);
}
