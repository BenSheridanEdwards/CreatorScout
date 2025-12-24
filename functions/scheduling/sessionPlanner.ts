/**
 * Fuzzy Session Planning Module
 *
 * Calculates natural, non-round DM targets for sessions that vary each day.
 * Mimics human behavior where daily activity isn't perfectly split.
 *
 * Features:
 * - Variable session distributions (not equal splits)
 * - Fuzzy targets with acceptable ranges
 * - Daily variance factors (energy, luck, interruptions)
 * - Weekend vs weekday patterns
 */

import { createLogger } from "../shared/logger/logger.ts";

const logger = createLogger();

export type SessionType = "morning" | "afternoon" | "evening";

export interface SessionPlan {
	sessionNumber: number;
	type: SessionType;
	targetDMs: number;
	minAcceptable: number;
	maxAcceptable: number;
	estimatedDuration: number; // minutes
	weight: number; // Proportion of daily goal
}

export interface DailyVariance {
	energyLevel: number; // 0.7-1.3 (affects session duration)
	hitRate: number; // 0.12-0.18 (creator discovery luck)
	hasInterruption: boolean; // Random breaks
}

/**
 * Get today's variance factors
 * Weekend = higher energy, weekday = more variable
 */
export function getDailyVariance(): DailyVariance {
	const dayOfWeek = new Date().getDay();
	const isWeekend = [0, 6].includes(dayOfWeek);

	return {
		// Weekend: 1.0-1.3 energy (more browsing time)
		// Weekday: 0.7-1.1 energy (varies by how tired)
		energyLevel: isWeekend
			? 1.0 + Math.random() * 0.3
			: 0.7 + Math.random() * 0.4,

		// Hit rate varies by network quality (12-18%)
		hitRate: 0.12 + Math.random() * 0.06,

		// 30% chance of a 1-3 min interruption during the day
		hasInterruption: Math.random() < 0.3,
	};
}

/**
 * Calculate fuzzy session targets for the day
 *
 * Returns 3 session plans with natural variance:
 * - Morning: ~20% (light)
 * - Afternoon: ~50% (heavy)
 * - Evening: ~30% (medium)
 *
 * But with randomization so it's never exactly the same
 */
export function planDailySessions(
	dailyDmGoal: number,
	dmsSentSoFar: number = 0,
): SessionPlan[] {
	const variance = getDailyVariance();
	const remaining = dailyDmGoal - dmsSentSoFar;

	// Base weights for each session
	const baseWeights = {
		morning: 0.2,
		afternoon: 0.5,
		evening: 0.3,
	};

	// Add randomization to weights (±20%)
	const morningWeight =
		baseWeights.morning * (0.8 + Math.random() * 0.4) * variance.energyLevel;
	const afternoonWeight = baseWeights.afternoon * (0.85 + Math.random() * 0.3);
	const eveningWeight =
		baseWeights.evening * (0.85 + Math.random() * 0.3) * variance.energyLevel;

	// Normalize weights to sum to 1
	const totalWeight = morningWeight + afternoonWeight + eveningWeight;
	const normalizedWeights = {
		morning: morningWeight / totalWeight,
		afternoon: afternoonWeight / totalWeight,
		evening: eveningWeight / totalWeight,
	};

	// Calculate fuzzy targets
	const morningTarget = Math.floor(remaining * normalizedWeights.morning);
	const afternoonTarget = Math.floor(remaining * normalizedWeights.afternoon);
	const eveningTarget = remaining - morningTarget - afternoonTarget; // Get exact remainder

	const plans: SessionPlan[] = [
		{
			sessionNumber: 1,
			type: "morning",
			targetDMs: morningTarget,
			minAcceptable: Math.floor(morningTarget * 0.7), // Can be 30% under
			maxAcceptable: Math.floor(morningTarget * 1.4), // Can be 40% over
			estimatedDuration: estimateDuration(morningTarget, variance),
			weight: normalizedWeights.morning,
		},
		{
			sessionNumber: 2,
			type: "afternoon",
			targetDMs: afternoonTarget,
			minAcceptable: Math.floor(afternoonTarget * 0.8), // Can be 20% under
			maxAcceptable: Math.floor(afternoonTarget * 1.3), // Can be 30% over
			estimatedDuration: estimateDuration(afternoonTarget, variance),
			weight: normalizedWeights.afternoon,
		},
		{
			sessionNumber: 3,
			type: "evening",
			targetDMs: eveningTarget,
			minAcceptable: Math.max(
				0,
				eveningTarget - Math.floor(dailyDmGoal * 0.05),
			), // ±5% of daily
			maxAcceptable: eveningTarget + Math.floor(dailyDmGoal * 0.05),
			estimatedDuration: estimateDuration(eveningTarget, variance),
			weight: normalizedWeights.evening,
		},
	];

	logger.debug(
		"SESSION_PLAN",
		`Daily plan: ${morningTarget} + ${afternoonTarget} + ${eveningTarget} = ${remaining} DMs (energy: ${(variance.energyLevel * 100).toFixed(0)}%)`,
	);

	return plans;
}

/**
 * Estimate session duration based on DM target and variance
 * Base: ~2.1 minutes per DM (includes discovery, engagement, overhead)
 */
function estimateDuration(dmTarget: number, variance: DailyVariance): number {
	const baseMinPerDM = 2.1;

	// Adjust for energy level (high energy = faster)
	const adjustedMinPerDM = baseMinPerDM / variance.energyLevel;

	// Add ±15% random variance
	const randomVariance = 0.85 + Math.random() * 0.3;

	return Math.floor(dmTarget * adjustedMinPerDM * randomVariance);
}

/**
 * Recalculate remaining session targets mid-day
 * Useful if morning session over/under-performed
 */
export function recalculateSessions(
	dailyDmGoal: number,
	dmsSentSoFar: number,
	sessionsCompleted: number,
): SessionPlan[] {
	const remaining = dailyDmGoal - dmsSentSoFar;
	const sessionsLeft = 3 - sessionsCompleted;

	if (sessionsLeft === 0) {
		return [];
	}

	if (sessionsLeft === 1) {
		// Only evening left - send all remaining
		return [
			{
				sessionNumber: 3,
				type: "evening",
				targetDMs: remaining,
				minAcceptable: Math.max(0, remaining - 3),
				maxAcceptable: remaining + 3,
				estimatedDuration: Math.floor(remaining * 2.1),
				weight: 1.0,
			},
		];
	}

	if (sessionsLeft === 2) {
		// Afternoon and evening left - redistribute
		const variance = getDailyVariance();
		const afternoonWeight = 0.55 + Math.random() * 0.1; // 55-65%

		const afternoonTarget = Math.floor(remaining * afternoonWeight);
		const eveningTarget = remaining - afternoonTarget;

		return [
			{
				sessionNumber: 2,
				type: "afternoon",
				targetDMs: afternoonTarget,
				minAcceptable: Math.floor(afternoonTarget * 0.8),
				maxAcceptable: Math.floor(afternoonTarget * 1.2),
				estimatedDuration: estimateDuration(afternoonTarget, variance),
				weight: afternoonWeight,
			},
			{
				sessionNumber: 3,
				type: "evening",
				targetDMs: eveningTarget,
				minAcceptable: Math.max(0, eveningTarget - 3),
				maxAcceptable: eveningTarget + 3,
				estimatedDuration: estimateDuration(eveningTarget, variance),
				weight: 1 - afternoonWeight,
			},
		];
	}

	// All 3 sessions left
	return planDailySessions(dailyDmGoal, dmsSentSoFar);
}

/**
 * Get typical session times for scheduling
 */
export function getSessionTime(type: SessionType): string {
	const times = {
		morning: ["07:30", "08:00", "08:15", "08:30", "09:00"],
		afternoon: ["14:30", "15:00", "15:15", "15:30", "16:00"],
		evening: ["19:30", "20:00", "20:15", "20:30", "21:00"],
	};

	const options = times[type];
	return options[Math.floor(Math.random() * options.length)];
}

/**
 * Log session plan in readable format
 */
export function logSessionPlan(plan: SessionPlan): void {
	const emoji = {
		morning: "🌅",
		afternoon: "☀️",
		evening: "🌙",
	};

	logger.info(
		"SESSION_PLAN",
		`${emoji[plan.type]} ${plan.type.toUpperCase()} Session #${plan.sessionNumber}`,
	);
	logger.info(
		"SESSION_PLAN",
		`   Target: ${plan.targetDMs} DMs (range: ${plan.minAcceptable}-${plan.maxAcceptable})`,
	);
	logger.info(
		"SESSION_PLAN",
		`   Duration: ~${plan.estimatedDuration} minutes`,
	);
	logger.info(
		"SESSION_PLAN",
		`   Weight: ${(plan.weight * 100).toFixed(0)}% of daily goal`,
	);
}
