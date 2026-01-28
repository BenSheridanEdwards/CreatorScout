/**
 * Metrics tracking utilities for Scout
 */
import { v4 as uuidv4 } from "uuid";
import {
	type DailyMetrics,
	getDailyMetrics,
	recordError as recordDbError,
	recordProfileMetrics,
	type SessionMetrics,
	startSessionMetrics,
	updateSessionMetrics,
} from "../database/database.ts";

export class MetricsTracker {
	private sessionId: string;
	private sessionStartTime: Date;
	private sessionMetrics: SessionMetrics;
	private bioScores: number[] = [];
	private confidences: number[] = [];

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
		this.fireAndForget(startSessionMetrics(this.sessionId));
	}

	private fireAndForget(p: unknown): void {
		void Promise.resolve(p).catch(() => {
			// Metrics are best-effort; never crash the run if DB metrics fail.
		});
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
		bioScore?: number,
	): void {
		this.sessionMetrics.profilesVisited++;
		this.sessionMetrics.totalProcessingTime += processingTimeSeconds;

		// Track bio score if provided
		if (bioScore !== undefined) {
			this.bioScores.push(bioScore);
		}

		this.fireAndForget(
			recordProfileMetrics(username, {
				processingTimeSeconds,
				discoverySource,
				discoveryDepth,
				sessionId: this.sessionId,
				contentCategories,
				visionApiCalls,
				sourceProfile,
			}),
		);

		this.updateSessionMetrics();
	}

	// Creator discovery metrics
	recordCreatorFound(
		_username: string,
		confidence: number,
		visionApiCalls: number = 0,
	): void {
		this.sessionMetrics.creatorsFound++;
		this.sessionMetrics.visionApiCalls += visionApiCalls;
		// Track confidence for creators found
		this.confidences.push(confidence);
		this.updateSessionMetrics();
	}

	// Action metrics
	recordDMSent(): void {
		this.sessionMetrics.dmsSent++;
		this.updateSessionMetrics();
	}

	recordFollowCompleted(): void {
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
		this.fireAndForget(recordDbError(username, errorType, errorMessage));
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
		// Finalize with averages calculated from tracked values
		this.updateSessionMetrics(true);
	}

	// Finalize session metrics by calculating averages from database
	async finalizeSessionMetrics(): Promise<void> {
		try {
			const { getPrismaClient } = await import("../database/database.ts");
			const prisma = getPrismaClient();

			// Query profiles visited in this session to calculate accurate averages
			const profiles = await prisma.profile.findMany({
				where: {
					sessionId: this.sessionId,
				},
				select: {
					bioScore: true,
					confidence: true,
					isCreator: true,
				},
			});

			if (profiles.length > 0) {
				// Calculate average bio score from all profiles
				const bioScores = profiles
					.map((p) => p.bioScore)
					.filter((score) => score !== null && score !== undefined);
				const avgBioScore =
					bioScores.length > 0
						? bioScores.reduce((a, b) => a + b, 0) / bioScores.length
						: 0;

				// Calculate average confidence from creators only
				const creatorConfidences = profiles
					.filter((p) => p.isCreator)
					.map((p) => p.confidence)
					.filter((conf) => conf !== null && conf !== undefined);
				const avgConfidence =
					creatorConfidences.length > 0
						? creatorConfidences.reduce((a, b) => a + b, 0) /
							creatorConfidences.length
						: 0;

				// Update session metrics with calculated averages
				this.fireAndForget(
					updateSessionMetrics(this.sessionId, {
						avgBioScore,
						avgConfidence,
					}),
				);
			}
		} catch {
			// Best-effort: if database query fails, use in-memory averages
			this.updateSessionMetrics(true);
		}
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
		if (this.bioScores.length === 0) return 0;
		const sum = this.bioScores.reduce((a, b) => a + b, 0);
		return sum / this.bioScores.length;
	}

	getAverageConfidence(): number {
		if (this.confidences.length === 0) return 0;
		const sum = this.confidences.reduce((a, b) => a + b, 0);
		return sum / this.confidences.length;
	}

	private updateSessionMetrics(includeAverages: boolean = false): void {
		const metrics: Partial<SessionMetrics> = {
			profilesVisited: this.sessionMetrics.profilesVisited,
			creatorsFound: this.sessionMetrics.creatorsFound,
			dmsSent: this.sessionMetrics.dmsSent,
			followsCompleted: this.sessionMetrics.followsCompleted,
			avgProcessingTime: this.getAverageProcessingTime(),
			errorsEncountered: this.sessionMetrics.errorsEncountered,
			rateLimitsHit: this.sessionMetrics.rateLimitsHit,
			visionApiCost: this.sessionMetrics.visionApiCost,
		};

		// Include averages when finalizing session or when explicitly requested
		if (includeAverages) {
			metrics.avgBioScore = this.getAverageBioScore();
			metrics.avgConfidence = this.getAverageConfidence();
		}

		this.fireAndForget(updateSessionMetrics(this.sessionId, metrics));
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
export async function getMetricsSummary(date?: string): Promise<{
	daily: DailyMetrics | null;
	sessionSuccessRate: number;
	creatorConversionRate: number;
	dmSuccessRate: number;
	averageProcessingTime: number;
}> {
	const dailyMetrics = await getDailyMetrics(date);

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
