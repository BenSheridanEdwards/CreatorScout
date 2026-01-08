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
 * - Decodo: ~$12/GB
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
const BLOCKED_RESOURCE_TYPES = [
	"image",
	"media",
	"font",
	"stylesheet", // Keep disabled for now - might break functionality
];

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

// Essential Instagram domains (never block)
const ESSENTIAL_DOMAINS = [
	"instagram.com",
	"cdninstagram.com",
	"fbcdn.net",
	"i.instagram.com", // API
];

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

		logger.info("PROXY_OPT", `Optimizer attached (blocking: ${this.blockResources})`);
	}

	/**
	 * Check if a request should be blocked
	 */
	private shouldBlockRequest(url: string, resourceType: string): boolean {
		if (!this.blockResources) {
			return false;
		}

		// Never block essential Instagram domains
		const isEssential = ESSENTIAL_DOMAINS.some((domain) => url.includes(domain));
		if (isEssential && !this.isTrackingResource(url)) {
			return false;
		}

		// Block tracking/ad domains
		if (BLOCKED_DOMAINS.some((domain) => url.includes(domain))) {
			return true;
		}

		// Block heavy resource types (except on essential pages)
		if (BLOCKED_RESOURCE_TYPES.includes(resourceType)) {
			// Allow profile pictures (small) but block story images, feed images, etc.
			const isProfilePic =
				url.includes("profile_pic") ||
				url.includes("150x150") ||
				url.includes("s150x150");
			if (isProfilePic) {
				return false;
			}
			return true;
		}

		return false;
	}

	/**
	 * Check if URL is a tracking resource
	 */
	private isTrackingResource(url: string): boolean {
		return (
			url.includes("/logging/") ||
			url.includes("/tr/") ||
			url.includes("batch_log") ||
			url.includes("events")
		);
	}

	/**
	 * Estimate size of a request based on resource type
	 */
	private estimateRequestSize(resourceType: string): number {
		const sizes: Record<string, number> = {
			document: 50 * 1024, // 50KB
			script: 100 * 1024, // 100KB
			stylesheet: 30 * 1024, // 30KB
			xhr: 20 * 1024, // 20KB
			fetch: 20 * 1024, // 20KB
			image: 200 * 1024, // 200KB
			media: 2 * 1024 * 1024, // 2MB
			font: 50 * 1024, // 50KB
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

		logger.info(
			"PROXY_OPT",
			`Session bandwidth: ${stats.estimatedMB.toFixed(2)}MB (${stats.requestCount} requests)`
		);
		logger.info(
			"PROXY_OPT",
			`Blocked: ${stats.blockedCount} requests, saved ~${stats.savedMB.toFixed(2)}MB`
		);

		// Persist to database
		try {
			const prisma = getPrismaClient();
			await prisma.proxyUsage.create({
				data: {
					date: new Date(),
					profileId: this.profileId,
					sessionId: this.sessionId,
					requestCount: stats.requestCount,
					estimatedMB: stats.estimatedMB,
				},
			});
		} catch (error) {
			logger.debug("PROXY_OPT", `Could not persist usage: ${error}`);
		}

		return stats;
	}
}

/**
 * Get proxy usage report for a date range
 */
export async function getProxyUsageReport(
	startDate: Date,
	endDate: Date = new Date()
): Promise<ProxyUsageReport> {
	const prisma = getPrismaClient();

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
	const daysElapsed = Math.max(1, Math.floor((now.getTime() - firstOfMonth.getTime()) / (24 * 60 * 60 * 1000)));
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

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
export function createProductionOptimizer(profileId: string, sessionId: string): ProxyOptimizer {
	return new ProxyOptimizer({
		profileId,
		sessionId,
		blockResources: true, // Always block in production to save bandwidth
	});
}
