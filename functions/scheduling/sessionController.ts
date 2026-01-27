/**
 * Session Controller
 *
 * Manages a single session's execution with fuzzy target logic.
 * Decides when to continue/stop based on:
 * - DMs sent vs target
 * - Time elapsed
 * - Natural stopping probability
 */

import { createLogger } from "../shared/logger/logger.ts";
import type { SessionPlan } from "./sessionPlanner.ts";

const logger = createLogger();

export interface SessionStats {
	dmsSent: number;
	profilesChecked: number;
	creatorsFound: number;
	elapsedMinutes: number;
	engagementActions: number;
}

export class SessionController {
	private startTime: number;
	private stats: SessionStats;
	readonly plan: SessionPlan;

	constructor(plan: SessionPlan) {
		this.plan = plan;
		this.startTime = Date.now();
		this.stats = {
			dmsSent: 0,
			profilesChecked: 0,
			creatorsFound: 0,
			elapsedMinutes: 0,
			engagementActions: 0,
		};
	}

	/**
	 * Record a DM sent
	 */
	recordDM(): void {
		this.stats.dmsSent++;
	}

	/**
	 * Record a profile checked
	 */
	recordProfileChecked(wasCreator: boolean = false): void {
		this.stats.profilesChecked++;
		if (wasCreator) {
			this.stats.creatorsFound++;
		}
	}

	/**
	 * Record engagement action
	 */
	recordEngagement(): void {
		this.stats.engagementActions++;
	}

	/**
	 * Get current stats
	 */
	getStats(): SessionStats {
		this.stats.elapsedMinutes = (Date.now() - this.startTime) / 60000;
		return { ...this.stats };
	}

	/**
	 * Check if session should continue
	 *
	 * Complex logic that mimics human behavior:
	 * - Discovery should continue independently of DM status
	 * - Stop if maxed out on DMs
	 * - Stop if time's up
	 * - Continue discovery even if DMs aren't being sent
	 * - Probabilistic stopping when near target
	 */
	shouldContinue(): boolean {
		const elapsed = (Date.now() - this.startTime) / 60000; // minutes
		const maxDuration = this.plan.estimatedDuration * 1.2; // Allow 20% over
		const remaining = maxDuration - elapsed;
		const stats = this.getStats();

		// Hard stop if way over max acceptable DMs
		if (this.stats.dmsSent >= this.plan.maxAcceptable + 2) {
			logger.info(
				"SESSION_CONTROL",
				`🛑 STOPPING: Exceeded max acceptable DMs (${this.stats.dmsSent} >= ${this.plan.maxAcceptable + 2}) | Stats: ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators, ${elapsed.toFixed(1)} min`,
			);
			return false;
		}

		// Hard stop if time's completely up
		if (remaining < 0) {
			logger.info(
				"SESSION_CONTROL",
				`🛑 STOPPING: Time exceeded (${elapsed.toFixed(1)} >= ${maxDuration.toFixed(1)} min) | Stats: ${stats.dmsSent} DMs, ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
			);
			return false;
		}

		// DISCOVERY CONTINUES INDEPENDENTLY: If we're in discovery mode (targetDMs = 0) or haven't sent DMs,
		// continue based on time and profiles checked, not DM progress
		const isDiscoveryOnly = this.plan.targetDMs === 0;
		const noDmsSent = this.stats.dmsSent === 0;

		// If discovery-only or no DMs sent yet, continue based on time and discovery progress
		if (isDiscoveryOnly || noDmsSent) {
			// Continue if we have time and are actively discovering
			if (remaining > 2) {
				logger.debug(
					"SESSION_CONTROL",
					`✅ CONTINUING: Discovery mode (${stats.profilesChecked} profiles checked, ${stats.creatorsFound} creators, ${remaining.toFixed(1)} min left)`,
				);
				return true;
			}
			// Even if time is low, continue if we haven't checked many profiles yet
			if (stats.profilesChecked < 10 && remaining > 0) {
				logger.info(
					"SESSION_CONTROL",
					`✅ CONTINUING: Low profile count (${stats.profilesChecked} profiles < 10, ${remaining.toFixed(1)} min left) - extending discovery`,
				);
				return true;
			}
			// If we've checked profiles but time is up
			if (remaining <= 0) {
				logger.info(
					"SESSION_CONTROL",
					`🛑 STOPPING: Discovery mode but time expired (${stats.profilesChecked} profiles, ${stats.creatorsFound} creators, ${elapsed.toFixed(1)} min elapsed)`,
				);
				return false;
			}
		}

		// Continue if way under minimum DMs and have time
		if (this.stats.dmsSent < this.plan.minAcceptable && remaining > 5) {
			logger.info(
				"SESSION_CONTROL",
				`✅ CONTINUING: Under minimum DMs (${this.stats.dmsSent} < ${this.plan.minAcceptable}), continuing discovery | ${stats.profilesChecked} profiles, ${remaining.toFixed(1)} min left`,
			);
			return true;
		}

		// If under target but within acceptable range
		if (this.stats.dmsSent < this.plan.targetDMs) {
			// Check progress vs time ratio
			const progressRatio = this.stats.dmsSent / this.plan.targetDMs;
			const timeRatio = elapsed / this.plan.estimatedDuration;

			// If ahead of schedule (sent more DMs per minute than expected)
			if (progressRatio > timeRatio * 1.1) {
				// 30% chance to stop early (got lucky, found creators fast)
				if (Math.random() < 0.3) {
					logger.info(
						"SESSION_CONTROL",
						`🛑 STOPPING: Ahead of schedule (${this.stats.dmsSent} DMs in ${elapsed.toFixed(1)} min, ratio ${progressRatio.toFixed(2)} > ${(timeRatio * 1.1).toFixed(2)}) | ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
					);
					return false;
				}
			}

			// If behind schedule and have time, keep going (discovery continues)
			if (remaining > 5) {
				logger.debug(
					"SESSION_CONTROL",
					`✅ CONTINUING: Behind DM target with time (${this.stats.dmsSent}/${this.plan.targetDMs}, ${remaining.toFixed(1)} min left) - discovery continues | ${stats.profilesChecked} profiles`,
				);
				return true;
			}
			// If behind schedule but low time
			if (remaining <= 5 && remaining > 2) {
				logger.info(
					"SESSION_CONTROL",
					`⚠️ LOW TIME: Behind DM target (${this.stats.dmsSent}/${this.plan.targetDMs}) but only ${remaining.toFixed(1)} min left | ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
				);
				return true; // Still continue for discovery
			}
		}

		// Met target - probabilistic stopping
		if (this.stats.dmsSent >= this.plan.targetDMs) {
			// If low on time, stop
			if (remaining < 5) {
				logger.info(
					"SESSION_CONTROL",
					`🛑 STOPPING: Met DM target, low time (${this.stats.dmsSent} DMs >= ${this.plan.targetDMs}, ${remaining.toFixed(1)} min left) | ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
				);
				return false;
			}

			// If within acceptable range, 50% chance to continue "one more"
			if (this.stats.dmsSent < this.plan.maxAcceptable) {
				const continueChance =
					0.5 - (this.stats.dmsSent - this.plan.targetDMs) * 0.1;
				if (Math.random() > continueChance) {
					logger.info(
						"SESSION_CONTROL",
						`🛑 STOPPING: Met target, random stop (${this.stats.dmsSent} DMs, chance ${(continueChance * 100).toFixed(0)}%) | ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
					);
					return false;
				}
			}

			logger.debug(
				"SESSION_CONTROL",
				`✅ CONTINUING: One more try (${this.stats.dmsSent}/${this.plan.targetDMs}) | ${stats.profilesChecked} profiles`,
			);
			return true;
		}

		// Default: continue if time remains (discovery continues)
		if (remaining > 2) {
			logger.debug(
				"SESSION_CONTROL",
				`✅ CONTINUING: Default case (${remaining.toFixed(1)} min remaining) | ${stats.dmsSent} DMs, ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
			);
			return true;
		}

		logger.info(
			"SESSION_CONTROL",
			`🛑 STOPPING: Default case - time too low (${remaining.toFixed(1)} min remaining) | ${stats.dmsSent} DMs, ${stats.profilesChecked} profiles, ${stats.creatorsFound} creators`,
		);
		return false;
	}

	/**
	 * Get session summary for logging
	 */
	getSummary(): string {
		const stats = this.getStats();
		const targetMet = stats.dmsSent >= this.plan.minAcceptable;
		const status = targetMet ? "✓" : "⚠";

		return `${status} ${this.plan.type} session: ${stats.dmsSent} DMs (target: ${this.plan.targetDMs}), ${stats.profilesChecked} profiles, ${stats.elapsedMinutes.toFixed(1)} min`;
	}

	/**
	 * Log detailed session results
	 */
	logResults(): void {
		const stats = this.getStats();
		const emoji = {
			morning: "🌅",
			afternoon: "☀️",
			evening: "🌙",
		};

		const isDiscoveryOnly = this.plan.targetDMs === 0;
		const modeLabel = isDiscoveryOnly ? " [DISCOVERY]" : "";

		logger.info(
			"SESSION_COMPLETE",
			`${emoji[this.plan.type]} ${this.plan.type.toUpperCase()} Session Complete${modeLabel}`,
		);

		// Only show DM stats if DMs were enabled for this session
		if (!isDiscoveryOnly) {
			logger.info(
				"SESSION_COMPLETE",
				`   DMs sent: ${stats.dmsSent} (target: ${this.plan.targetDMs}, range: ${this.plan.minAcceptable}-${this.plan.maxAcceptable})`,
			);
		}

		logger.info(
			"SESSION_COMPLETE",
			`   Profiles checked: ${stats.profilesChecked}`,
		);
		logger.info(
			"SESSION_COMPLETE",
			`   Creators found: ${stats.creatorsFound}`,
		);
		logger.info(
			"SESSION_COMPLETE",
			`   Engagements: ${stats.engagementActions}`,
		);
		logger.info(
			"SESSION_COMPLETE",
			`   Duration: ${stats.elapsedMinutes.toFixed(1)} min (estimated: ${this.plan.estimatedDuration} min)`,
		);

		// Status check - only relevant when DMs are enabled
		if (!isDiscoveryOnly) {
			if (stats.dmsSent >= this.plan.minAcceptable) {
				logger.info("SESSION_COMPLETE", `   Status: ✓ Target met`);
			} else {
				logger.warn(
					"SESSION_COMPLETE",
					`   Status: ⚠ Under target (${stats.dmsSent} < ${this.plan.minAcceptable})`,
				);
			}
		} else {
			logger.info("SESSION_COMPLETE", `   Status: ✓ Discovery complete`);
		}
	}

	/**
	 * Calculate hit rate (creators per profile checked)
	 */
	getHitRate(): number {
		if (this.stats.profilesChecked === 0) return 0;
		return this.stats.creatorsFound / this.stats.profilesChecked;
	}

	/**
	 * Calculate DMs per minute
	 */
	getDMsPerMinute(): number {
		const elapsed = (Date.now() - this.startTime) / 60000;
		if (elapsed === 0) return 0;
		return this.stats.dmsSent / elapsed;
	}
}
