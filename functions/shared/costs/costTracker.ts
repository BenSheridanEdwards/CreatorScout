/**
 * Cost Tracker
 *
 * Tracks infrastructure costs for Scout automation.
 * Monitors GoLogin, VPS, proxies, and API usage.
 */
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

// ═══════════════════════════════════════════════════════════════════════════════
// COST ESTIMATES (monthly)
// ═══════════════════════════════════════════════════════════════════════════════

export const COST_ESTIMATES = {
	// GoLogin plans
	gologin: {
		professional: 99, // 100 profiles
		business: 199, // 300 profiles
		enterprise: 399, // 1000 profiles
		custom: 0, // Variable
	},

	// DigitalOcean VPS
	vps: {
		basic: 15, // 2 vCPU, 4GB RAM
		recommended: 20, // 4 vCPU, 8GB RAM
		performance: 40, // 8 vCPU, 16GB RAM
	},

	// Smartproxy residential
	proxy: {
		starter: 80, // 5GB/mo
		regular: 120, // 10GB/mo
		advanced: 200, // 20GB/mo
		premium: 400, // 50GB/mo
	},

	// Vision API (per 1000 calls)
	visionApi: {
		geminiFlash: 0.075, // $0.000075 per image
		geminiPro: 0.25, // $0.00025 per image
	},
};

// ═══════════════════════════════════════════════════════════════════════════════
// COST TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonthlyCosts {
	gologin: number;
	vps: number;
	proxy: number;
	visionApi: number;
	total: number;
}

export interface CostProjection {
	currentMonthly: number;
	projectedWithScaling: number;
	breakdown: MonthlyCosts;
	recommendations: string[];
}

export interface UsageStats {
	proxyBandwidthBytes: number;
	visionApiCalls: number;
	sessionMinutes: number;
	profilesActive: number;
}

/**
 * Cost Tracker class for monitoring infrastructure spend
 */
export class CostTracker {
	private usageStats: UsageStats = {
		proxyBandwidthBytes: 0,
		visionApiCalls: 0,
		sessionMinutes: 0,
		profilesActive: 0,
	};

	private startDate = new Date();

	/**
	 * Record proxy bandwidth usage
	 */
	recordProxyUsage(profileId: string, bytes: number): void {
		this.usageStats.proxyBandwidthBytes += bytes;
	}

	/**
	 * Record Vision API call
	 */
	recordApiCall(service: string, cost: number): void {
		if (service === "vision") {
			this.usageStats.visionApiCalls++;
		}
	}

	/**
	 * Record session time
	 */
	recordSessionTime(minutes: number): void {
		this.usageStats.sessionMinutes += minutes;
	}

	/**
	 * Update active profile count
	 */
	setActiveProfiles(count: number): void {
		this.usageStats.profilesActive = count;
	}

	/**
	 * Get current usage statistics
	 */
	getUsageStats(): UsageStats {
		return { ...this.usageStats };
	}

	/**
	 * Calculate current monthly costs based on usage
	 */
	getMonthlyCosts(config: {
		gologinPlan: keyof typeof COST_ESTIMATES.gologin;
		vpsPlan: keyof typeof COST_ESTIMATES.vps;
		proxyPlan: keyof typeof COST_ESTIMATES.proxy;
	}): MonthlyCosts {
		const gologin = COST_ESTIMATES.gologin[config.gologinPlan];
		const vps = COST_ESTIMATES.vps[config.vpsPlan];
		const proxy = COST_ESTIMATES.proxy[config.proxyPlan];

		// Calculate vision API cost
		const visionApiCost =
			this.usageStats.visionApiCalls * COST_ESTIMATES.visionApi.geminiFlash;

		return {
			gologin,
			vps,
			proxy,
			visionApi: visionApiCost,
			total: gologin + vps + proxy + visionApiCost,
		};
	}

	/**
	 * Get cost projection for scaling
	 */
	getScalingProjection(profileCount: number): CostProjection {
		const recommendations: string[] = [];

		// Determine plans based on profile count
		let gologinPlan: keyof typeof COST_ESTIMATES.gologin = "professional";
		let vpsPlan: keyof typeof COST_ESTIMATES.vps = "recommended";
		let proxyPlan: keyof typeof COST_ESTIMATES.proxy = "starter";

		if (profileCount > 100) {
			gologinPlan = "business";
			recommendations.push("Consider Business plan for 300 profiles");
		}
		if (profileCount > 300) {
			gologinPlan = "enterprise";
			recommendations.push("Enterprise plan recommended for 1000+ profiles");
		}

		if (profileCount > 10) {
			vpsPlan = "performance";
			recommendations.push(
				"Upgrade VPS for better performance with many profiles",
			);
		}

		if (profileCount > 5) {
			proxyPlan = "regular";
		}
		if (profileCount > 15) {
			proxyPlan = "advanced";
		}
		if (profileCount > 30) {
			proxyPlan = "premium";
			recommendations.push("High proxy usage expected with 30+ profiles");
		}

		const breakdown = this.getMonthlyCosts({
			gologinPlan,
			vpsPlan,
			proxyPlan,
		});

		// Cost savings tips
		if (profileCount <= 5) {
			recommendations.push(
				"💡 Tip: Use annual billing for 20% savings on GoLogin",
			);
		}
		if (this.usageStats.visionApiCalls > 1000) {
			recommendations.push(
				"💡 Tip: Consider caching vision results to reduce API costs",
			);
		}

		return {
			currentMonthly: breakdown.total,
			projectedWithScaling: breakdown.total,
			breakdown,
			recommendations,
		};
	}

	/**
	 * Reset usage stats (for new billing period)
	 */
	reset(): void {
		this.usageStats = {
			proxyBandwidthBytes: 0,
			visionApiCalls: 0,
			sessionMinutes: 0,
			profilesActive: this.usageStats.profilesActive,
		};
		this.startDate = new Date();
	}

	/**
	 * Log current cost summary
	 */
	logCostSummary(): void {
		const stats = this.getUsageStats();
		const bandwidthMB = (stats.proxyBandwidthBytes / (1024 * 1024)).toFixed(2);

		logger.info(
			"COSTS",
			`Usage: ${bandwidthMB}MB proxy, ${stats.visionApiCalls} vision calls, ${stats.sessionMinutes} min sessions`,
		);
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// COST BREAKDOWN HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a detailed cost breakdown for different scales
 */
export function getCostBreakdown(): {
	small: CostProjection;
	medium: CostProjection;
	large: CostProjection;
} {
	const tracker = new CostTracker();

	return {
		small: tracker.getScalingProjection(5), // 2 mains + 3 burners
		medium: tracker.getScalingProjection(15), // 2 mains + 13 burners
		large: tracker.getScalingProjection(50), // 5 mains + 45 burners
	};
}

/**
 * Print cost breakdown to console
 */
export function printCostBreakdown(): void {
	const breakdown = getCostBreakdown();

	console.log(
		"\n═══════════════════════════════════════════════════════════════",
	);
	console.log("💰 SCOUT COST BREAKDOWN");
	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);

	const formatCost = (projection: CostProjection, label: string) => {
		console.log(
			`📊 ${label} (${projection.breakdown.gologin > 199 ? "Enterprise" : projection.breakdown.gologin > 99 ? "Business" : "Professional"} tier)`,
		);
		console.log(`   GoLogin:    $${projection.breakdown.gologin}/mo`);
		console.log(`   VPS:        $${projection.breakdown.vps}/mo`);
		console.log(`   Proxy:      $${projection.breakdown.proxy}/mo`);
		console.log(
			`   Vision API: $${projection.breakdown.visionApi.toFixed(2)}/mo (estimated)`,
		);
		console.log(`   ─────────────────────`);
		console.log(`   TOTAL:      $${projection.currentMonthly}/mo\n`);

		if (projection.recommendations.length > 0) {
			console.log("   Recommendations:");
			projection.recommendations.forEach((r) => console.log(`   • ${r}`));
			console.log("");
		}
	};

	formatCost(breakdown.small, "Small (5 profiles)");
	formatCost(breakdown.medium, "Medium (15 profiles)");
	formatCost(breakdown.large, "Large (50 profiles)");

	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	);
}

// Global cost tracker instance
let globalCostTracker: CostTracker | null = null;

export function getGlobalCostTracker(): CostTracker {
	if (!globalCostTracker) {
		globalCostTracker = new CostTracker();
	}
	return globalCostTracker;
}
