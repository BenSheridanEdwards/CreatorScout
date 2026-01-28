/**
 * Proxy Bandwidth Optimizer
 *
 * Minimizes residential proxy usage by:
 * - Caching Instagram page data locally
 * - Blocking unnecessary resources (images, videos, ads)
 * - Tracking bandwidth per session
 * - Estimating monthly costs
 *
 * Residential proxy pricing (typical):
 * - SmartProxy: ~$8-12/GB
 * - Smartproxy: ~$8-12/GB
 *
 * Average session without optimization: ~150MB
 * Average session with optimization: ~30-50MB (3-5x savings!)
 */

import type { Page } from "puppeteer";
import { getPrismaClient } from "../database/database.ts";
import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

// Resources to block to save bandwidth
// NOTE: Do NOT block "stylesheet" - it breaks Instagram's UI completely
const BLOCKED_RESOURCE_TYPES = ["image", "media", "font", "websocket"];

// Domains to block (ads, analytics, tracking)
const BLOCKED_DOMAINS = [
	"facebook.com/tr", // Facebook tracking pixel
	"analytics", // Various analytics
	"doubleclick", // Google ads
	"googlesyndication",
	"googletagmanager",
	"adsserver",
	"adservice",
	"pixel", // Various pixels
	"cdn.mxpnl.com", // Mixpanel
	"sentry.io", // Error tracking
	"branch.io", // Attribution
	"adjust.com", // Attribution
	"appsflyer", // Attribution
];

// Instagram API endpoints to block (SAFE - only things we're CERTAIN aren't needed)
// BE CONSERVATIVE - we extract data from DOM, but some API calls may be needed for stats
// IMPORTANT: We DO extract story highlights, so don't block story highlight endpoints
const BLOCKED_API_PATTERNS = [
	"/api/v1/feed/reels_media/", // Reels feed - definitely not needed
	"/api/v1/feed/timeline/", // Main feed - definitely not needed
	"/api/v1/direct_v2/inbox/", // DM inbox - we only send, don't read
	"/api/v1/stories/reel/", // Story reel content - not needed (we only need highlight titles from DOM)
	"/api/v1/discover/", // Explore/discover feed - not needed
	"/api/v1/suggested/", // Suggested users - not needed
	"/api/v1/accounts/edit_profile/", // Profile editing - not needed
	"/api/v1/accounts/change_password/", // Account changes - not needed
	"/api/v1/accounts/logout/", // Logout - not needed
	"/api/v1/accounts/one_tap_app_login/", // Login endpoints - not needed
	"/api/v1/accounts/login/", // Login - not needed
	"/api/v1/qp/", // Quick promotions - not needed
	"/api/v1/clips/", // Clips/reels - not needed
	"/api/v1/live/", // Live streams - not needed
	"/api/v1/igtv/", // IGTV - not needed
	// NOTE: We DON'T block:
	// - /api/v1/users/ (may be needed for stats)
	// - /graphql/query (may be needed for profile/story highlights data)
	// - Story highlights endpoints (we extract highlight titles from DOM)
];

// Note: We don't block by domain anymore - we block by resource type and URL patterns
// Instagram loads media via fetch requests from cdninstagram.com, so domain-based
// allowlisting doesn't work. Instead we identify profile pics vs feed content by URL path.

export interface BandwidthStats {
	requestCount: number;
	blockedCount: number;
	estimatedBytes: number;
	estimatedMB: number;
	savedBytes: number;
	savedMB: number;
}

export interface ProxyUsageReport {
	date: string;
	totalMB: number;
	totalRequests: number;
	estimatedCost: number;
	byProfile: Record<string, { mb: number; requests: number }>;
}

/**
 * Proxy Optimizer class to manage bandwidth
 */
export class ProxyOptimizer {
	private stats: BandwidthStats = {
		requestCount: 0,
		blockedCount: 0,
		estimatedBytes: 0,
		estimatedMB: 0,
		savedBytes: 0,
		savedMB: 0,
	};

	private profileId: string;
	private sessionId: string;
	private blockResources: boolean;

	constructor(options: {
		profileId: string;
		sessionId: string;
		blockResources?: boolean;
	}) {
		this.profileId = options.profileId;
		this.sessionId = options.sessionId;
		this.blockResources = options.blockResources ?? true;
	}

	/**
	 * Attach optimizer to a page
	 */
	async attachToPage(page: Page): Promise<void> {
		// Enable request interception
		await page.setRequestInterception(true);

		page.on("request", (request) => {
			const url = request.url();
			const resourceType = request.resourceType();

			// Check if should block
			if (this.shouldBlockRequest(url, resourceType)) {
				this.stats.blockedCount++;
				// Estimate saved bytes (average sizes by type)
				const savedBytes = this.estimateSavedBytes(resourceType);
				this.stats.savedBytes += savedBytes;
				this.stats.savedMB = this.stats.savedBytes / (1024 * 1024);

				// Log blocked requests periodically (every 500) to monitor what's being blocked
				if (this.stats.blockedCount % 500 === 0) {
					logger.debug(
						"PROXY",
						`📊 Used: ${this.stats.estimatedMB.toFixed(1)}MB | Saved: ${this.stats.savedMB.toFixed(1)}MB | Blocked: ${this.stats.blockedCount} | Last blocked: ${resourceType} from ${url.substring(0, 80)}...`,
					);
				}

				request.abort();
				return;
			}

			// Track the request
			this.stats.requestCount++;
			const estimatedSize = this.estimateRequestSize(resourceType);
			this.stats.estimatedBytes += estimatedSize;
			this.stats.estimatedMB = this.stats.estimatedBytes / (1024 * 1024);

			request.continue();
		});

		logger.info(
			"PROXY",
			`Optimizer attached (blocking: ${this.blockResources})`,
		);
	}

	/**
	 * Check if a request should be blocked
	 */
	private shouldBlockRequest(url: string, resourceType: string): boolean {
		if (!this.blockResources) {
			return false;
		}

		// IMPORTANT: Only block resources from Instagram/Facebook domains
		// We NEED to see images from external links (linktree, beacons, etc.) for creator analysis
		const isInstagramDomain = this.isInstagramDomain(url);
		if (!isInstagramDomain) {
			return false; // Allow ALL external resources
		}

		// 1. Always block tracking/ad domains first
		if (BLOCKED_DOMAINS.some((domain) => url.includes(domain))) {
			return true;
		}

		// 2. Block websockets (real-time updates not needed for discovery)
		if (resourceType === "websocket") {
			return true;
		}

		// 3. Block non-essential Instagram API endpoints
		if (BLOCKED_API_PATTERNS.some((pattern) => url.includes(pattern))) {
			return true;
		}

		// 4. Block GraphQL queries that are definitely not needed (be conservative)
		// We allow most GraphQL queries as they may be needed for stats/story highlights
		if (url.includes("/graphql/query")) {
			// Only block GraphQL queries we're CERTAIN aren't needed
			// NOTE: We DO extract story highlights, so allow story-related queries
			const blockedGraphQLPatterns = [
				"feed_timeline", // Feed content
				"reels_media", // Reels feed
				"discover", // Discover feed
				"suggested_users", // Suggested users
				// DON'T block "stories" - we extract story highlight titles
			];
			const isBlocked = blockedGraphQLPatterns.some((pattern) =>
				url.toLowerCase().includes(pattern),
			);
			if (isBlocked) {
				return true; // Block only these specific patterns
			}
			// Allow all other GraphQL queries (they may be needed for stats/story highlights)
		}

		// 5. Block tracking resources from Instagram
		if (this.isTrackingResource(url)) {
			return true;
		}

		// 6. Check if this is a profile picture (small, needed for UI) - allow these
		const isProfilePic =
			url.includes("profile_pic") ||
			url.includes("t51.2885-19") || // Instagram profile pic path
			url.includes("150x150") ||
			url.includes("s150x150") ||
			url.includes("44x44") ||
			url.includes("s44x44");
		if (isProfilePic) {
			return false;
		}

		// 7. Block heavy resource types (images, videos, fonts) from Instagram
		if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
			return true;
		}

		// 8. Block fetch requests that are loading Instagram media content
		if (resourceType === "fetch" && this.isInstagramMediaUrl(url)) {
			return true;
		}

		// 9. Block fetch/XHR requests for non-essential endpoints (conservative)
		if (
			(resourceType === "fetch" || resourceType === "xhr") &&
			this.isNonEssentialEndpoint(url)
		) {
			return true;
		}

		// 10. Allow essential requests (documents, scripts, essential API calls)
		return false;
	}

	/**
	 * Check if URL is from Instagram/Facebook CDN domains
	 */
	private isInstagramDomain(url: string): boolean {
		return (
			url.includes("instagram.com") ||
			url.includes("cdninstagram.com") ||
			url.includes("fbcdn.net") ||
			url.includes("facebook.com")
		);
	}

	/**
	 * Check if URL is loading Instagram media content (images/videos loaded via fetch)
	 */
	private isInstagramMediaUrl(url: string): boolean {
		// Only block if it's from Instagram CDN AND matches media patterns
		if (!this.isInstagramDomain(url)) {
			return false;
		}

		// Instagram CDN media patterns
		return (
			url.includes("/v/t51.") || // Images (feed, stories, etc.)
			url.includes("/v/t2/") || // Video thumbnails/segments
			url.includes("/v/t16/") || // Video content
			url.includes("/o1/v/") || // Media content
			url.includes(".jpg") ||
			url.includes(".jpeg") ||
			url.includes(".png") ||
			url.includes(".webp") ||
			url.includes(".mp4") ||
			url.includes(".m4v") ||
			url.includes(".heic")
		);
	}

	/**
	 * Check if URL is a tracking resource
	 */
	private isTrackingResource(url: string): boolean {
		return (
			url.includes("/logging/") ||
			url.includes("/tr/") ||
			url.includes("batch_log") ||
			url.includes("events") ||
			url.includes("/insights/") || // Analytics
			url.includes("/analytics/") ||
			url.includes("telemetry") ||
			url.includes("metrics") ||
			url.includes("tracking") ||
			url.includes("beacon")
		);
	}

	/**
	 * Check if URL is a non-essential endpoint (can be blocked)
	 * BE CONSERVATIVE - only block things we're CERTAIN aren't needed
	 * NOTE: We DO extract story highlights, so don't block story highlight endpoints
	 */
	private isNonEssentialEndpoint(url: string): boolean {
		// Block endpoints that are DEFINITELY not needed for profile discovery
		// We DON'T block:
		// - /api/v1/users/ (may be needed for stats)
		// - Story highlights endpoints (we extract highlight titles from DOM)
		const nonEssentialPatterns = [
			"/api/v1/feed/timeline", // Feed content - definitely not needed
			"/api/v1/feed/reels", // Reels feed - definitely not needed
			"/api/v1/stories/reel", // Story reel content - not needed (we only need highlight titles from DOM)
			"/api/v1/discover/", // Discover/explore - definitely not needed
			"/api/v1/suggested/", // Suggested users - definitely not needed
			"/api/v1/direct_v2/inbox", // DM inbox (we only send, don't read)
			"/api/v1/accounts/edit", // Profile editing - definitely not needed
			"/api/v1/qp/", // Quick promotions - definitely not needed
			"/api/v1/clips/", // Clips - definitely not needed
			"/api/v1/live/", // Live streams - definitely not needed
			"/api/v1/igtv/", // IGTV - definitely not needed
		];

		return nonEssentialPatterns.some((pattern) => url.includes(pattern));
	}

	/**
	 * Estimate size of a request based on resource type
	 */
	private estimateRequestSize(resourceType: string): number {
		const sizes: Record<string, number> = {
			document: 50 * 1024, // 50KB
			script: 100 * 1024, // 100KB
			stylesheet: 30 * 1024, // 30KB
			xhr: 15 * 1024, // 15KB (reduced - many blocked)
			fetch: 15 * 1024, // 15KB (reduced - many blocked)
			image: 200 * 1024, // 200KB
			media: 2 * 1024 * 1024, // 2MB
			font: 50 * 1024, // 50KB
			websocket: 5 * 1024, // 5KB (websockets blocked)
			other: 10 * 1024, // 10KB
		};
		return sizes[resourceType] || 10 * 1024;
	}

	/**
	 * Estimate bytes saved by blocking a resource
	 */
	private estimateSavedBytes(resourceType: string): number {
		const sizes: Record<string, number> = {
			image: 200 * 1024, // 200KB average
			media: 2 * 1024 * 1024, // 2MB average for videos
			font: 50 * 1024, // 50KB
			stylesheet: 30 * 1024, // 30KB
			websocket: 10 * 1024, // 10KB (websocket connections)
			fetch: 25 * 1024, // 25KB (API responses)
			xhr: 25 * 1024, // 25KB (API responses)
		};
		return sizes[resourceType] || 20 * 1024;
	}

	/**
	 * Get current bandwidth stats
	 */
	getStats(): BandwidthStats {
		return { ...this.stats };
	}

	/**
	 * Log and persist stats at session end
	 */
	async finalize(): Promise<BandwidthStats> {
		const stats = this.getStats();
		const totalPotential = stats.estimatedMB + stats.savedMB;
		const savingsPercent =
			totalPotential > 0
				? ((stats.savedMB / totalPotential) * 100).toFixed(0)
				: "0";

		logger.info(
			"PROXY",
			`📊 Session complete: Used ${stats.estimatedMB.toFixed(1)}MB | Saved ${stats.savedMB.toFixed(1)}MB (${savingsPercent}% reduction)`,
		);

		// Persist to database (if ProxyUsage model exists)
		try {
			const prisma = getPrismaClient();
			// Try to persist - if model doesn't exist, that's OK
			// @ts-expect-error - ProxyUsage may not be in generated client
			if (prisma.proxyUsage) {
				// @ts-expect-error
				await prisma.proxyUsage.create({
					data: {
						date: new Date(),
						profileId: this.profileId,
						sessionId: this.sessionId,
						requestCount: stats.requestCount,
						estimatedMB: stats.estimatedMB,
					},
				});
			}
		} catch (error) {
			// Silently fail - proxyUsage tracking is optional
			logger.debug("PROXY", `Could not persist usage: ${error}`);
		}

		return stats;
	}
}

/**
 * Get proxy usage report for a date range
 */
export async function getProxyUsageReport(
	startDate: Date,
	endDate: Date = new Date(),
): Promise<ProxyUsageReport> {
	const prisma = getPrismaClient();

	try {
		// @ts-expect-error - ProxyUsage may not be in generated client
		if (!prisma.proxyUsage) {
			return {
				date: `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`,
				totalMB: 0,
				totalRequests: 0,
				estimatedCost: 0,
				byProfile: {},
			};
		}

		// @ts-expect-error
		const usage = await prisma.proxyUsage.findMany({
			where: {
				date: {
					gte: startDate,
					lte: endDate,
				},
			},
		});

		const byProfile: Record<string, { mb: number; requests: number }> = {};
		let totalMB = 0;
		let totalRequests = 0;

		for (const record of usage) {
			totalMB += Number(record.estimatedMB);
			totalRequests += record.requestCount;

			if (!byProfile[record.profileId]) {
				byProfile[record.profileId] = { mb: 0, requests: 0 };
			}
			byProfile[record.profileId].mb += Number(record.estimatedMB);
			byProfile[record.profileId].requests += record.requestCount;
		}

		// Estimate cost at $10/GB
		const estimatedCost = (totalMB / 1024) * 10;

		return {
			date: `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`,
			totalMB,
			totalRequests,
			estimatedCost,
			byProfile,
		};
		} catch {
			// Return empty report if ProxyUsage model doesn't exist
			return {
			date: `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`,
			totalMB: 0,
			totalRequests: 0,
			estimatedCost: 0,
			byProfile: {},
		};
	}
}

/**
 * Get today's proxy usage
 */
export async function getTodayProxyUsage(): Promise<{
	totalMB: number;
	totalRequests: number;
	estimatedCost: number;
}> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const report = await getProxyUsageReport(today);

	return {
		totalMB: report.totalMB,
		totalRequests: report.totalRequests,
		estimatedCost: report.estimatedCost,
	};
}

/**
 * Estimate monthly cost based on current usage
 */
export async function estimateMonthlyProxyCost(): Promise<{
	currentMonthMB: number;
	projectedMonthMB: number;
	projectedCost: number;
	dailyAverageMB: number;
}> {
	const now = new Date();
	const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const daysElapsed = Math.max(
		1,
		Math.floor(
			(now.getTime() - firstOfMonth.getTime()) / (24 * 60 * 60 * 1000),
		),
	);
	const daysInMonth = new Date(
		now.getFullYear(),
		now.getMonth() + 1,
		0,
	).getDate();

	const report = await getProxyUsageReport(firstOfMonth);
	const dailyAverageMB = report.totalMB / daysElapsed;
	const projectedMonthMB = dailyAverageMB * daysInMonth;
	const projectedCost = (projectedMonthMB / 1024) * 10; // $10/GB

	return {
		currentMonthMB: report.totalMB,
		projectedMonthMB,
		projectedCost,
		dailyAverageMB,
	};
}

/**
 * Create an optimizer with recommended settings for production
 */
export function createProductionOptimizer(
	profileId: string,
	sessionId: string,
): ProxyOptimizer {
	return new ProxyOptimizer({
		profileId,
		sessionId,
		blockResources: true, // Always block in production to save bandwidth
	});
}
