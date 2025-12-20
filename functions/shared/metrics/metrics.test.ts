/**
 * Tests for the metrics tracking system
 *
 * These tests serve as comprehensive documentation for how the metrics system works,
 * including examples of usage patterns and expected behavior.
 */
import { jest } from "@jest/globals";

// Mock the database functions
const mockStartSessionMetrics = jest.fn();
const mockUpdateSessionMetrics = jest.fn();
const mockRecordProfileMetrics = jest.fn();
const mockRecordError = jest.fn();
const mockGetDailyMetrics = jest.fn();

jest.unstable_mockModule("../database/database.ts", () => ({
	startSessionMetrics: mockStartSessionMetrics,
	updateSessionMetrics: mockUpdateSessionMetrics,
	recordProfileMetrics: mockRecordProfileMetrics,
	recordError: mockRecordError,
	getDailyMetrics: mockGetDailyMetrics,
}));

// Mock uuid
jest.unstable_mockModule("uuid", () => ({
	v4: jest.fn(() => "test-session-uuid"),
}));

describe("Metrics System Documentation", () => {
	let MetricsTracker: typeof import("./metrics.ts").MetricsTracker;
	let getGlobalMetricsTracker: typeof import("./metrics.ts").getGlobalMetricsTracker;
	let createMetricsTracker: typeof import("./metrics.ts").createMetricsTracker;
	let startTimer: typeof import("./metrics.ts").startTimer;
	let getMetricsSummary: typeof import("./metrics.ts").getMetricsSummary;

	beforeAll(async () => {
		const metrics = await import("./metrics.ts");
		MetricsTracker = metrics.MetricsTracker;
		getGlobalMetricsTracker = metrics.getGlobalMetricsTracker;
		createMetricsTracker = metrics.createMetricsTracker;
		startTimer = metrics.startTimer;
		getMetricsSummary = metrics.getMetricsSummary;
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("MetricsTracker Initialization", () => {
		it("creates a new tracker with auto-generated session ID", () => {
			const tracker = new MetricsTracker();

			expect(tracker.getSessionId()).toBe("test-session-uuid");
			expect(mockStartSessionMetrics).toHaveBeenCalledWith("test-session-uuid");
		});

		it("creates a tracker with custom session ID", () => {
			const tracker = new MetricsTracker("custom-session-123");

			expect(tracker.getSessionId()).toBe("custom-session-123");
			expect(mockStartSessionMetrics).toHaveBeenCalledWith(
				"custom-session-123",
			);
		});

		it("provides global metrics tracker singleton", () => {
			const tracker1 = getGlobalMetricsTracker();
			const tracker2 = getGlobalMetricsTracker();

			// Should return the same instance
			expect(tracker1).toBe(tracker2);
		});

		it("can create multiple independent trackers", () => {
			const tracker1 = createMetricsTracker("session-1");
			const tracker2 = createMetricsTracker("session-2");

			expect(tracker1.getSessionId()).toBe("session-1");
			expect(tracker2.getSessionId()).toBe("session-2");
			expect(tracker1).not.toBe(tracker2);
		});
	});

	describe("Profile Visit Metrics", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("records basic profile visit metrics", () => {
			tracker.recordProfileVisit(
				"testuser",
				2.5, // 2.5 seconds processing time
				"seed", // discovered from seed
				0, // depth 0 (direct seed)
				undefined, // no source profile
				["fitness", "lifestyle"], // content categories
				0, // no vision API calls yet
			);

			expect(mockRecordProfileMetrics).toHaveBeenCalledWith("testuser", {
				processingTimeSeconds: 2.5,
				discoverySource: "seed",
				discoveryDepth: 0,
				sessionId: "test-session",
				contentCategories: ["fitness", "lifestyle"],
				visionApiCalls: 0,
				sourceProfile: undefined,
			});

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 1,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 2.5,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("records profile discovered through following chain", () => {
			tracker.recordProfileVisit(
				"discovered_user",
				1.8,
				"following_of_creator1",
				2, // 2 hops deep
				"creator1", // discovered via creator1's following
				["creator", "influencer"],
				1, // 1 vision API call
			);

			expect(mockRecordProfileMetrics).toHaveBeenCalledWith("discovered_user", {
				processingTimeSeconds: 1.8,
				discoverySource: "following_of_creator1",
				discoveryDepth: 2,
				sessionId: "test-session",
				contentCategories: ["creator", "influencer"],
				visionApiCalls: 1,
				sourceProfile: "creator1",
			});
		});

		it("accumulates session metrics across multiple profile visits", () => {
			// First profile
			tracker.recordProfileVisit("user1", 1.0, "seed", 0, undefined, [], 0);

			// Second profile
			tracker.recordProfileVisit("user2", 2.0, "seed", 0, undefined, [], 0);

			// Third profile
			tracker.recordProfileVisit(
				"user3",
				1.5,
				"following_of_user1",
				1,
				"user1",
				[],
				0,
			);

			expect(mockUpdateSessionMetrics).toHaveBeenCalledTimes(3);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				1,
				"test-session",
				{
					profilesVisited: 1,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 1.0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				2,
				"test-session",
				{
					profilesVisited: 2,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 1.5,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				3,
				"test-session",
				{
					profilesVisited: 3,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 1.5,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
		});
	});

	describe("Creator Discovery Metrics", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("records creator found with vision API", () => {
			tracker.recordCreatorFound("creator_user", 85, 1);

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 1,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("records creator found without vision API (high bio score)", () => {
			tracker.recordCreatorFound("high_score_creator", 95, 0);

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 1,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("accumulates creator discovery metrics", () => {
			tracker.recordCreatorFound("creator1", 80, 1);
			tracker.recordCreatorFound("creator2", 90, 1);
			tracker.recordCreatorFound("creator3", 75, 0); // No vision API

			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				1,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 1,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				2,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 2,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				3,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 3,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
		});
	});

	describe("Action Metrics (DMs and Follows)", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("records DM sent successfully", () => {
			tracker.recordDMSent("creator_user");

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 1,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("records follow completed", () => {
			tracker.recordFollowCompleted("creator_user");

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 1,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("tracks multiple actions", () => {
			tracker.recordDMSent("creator1");
			tracker.recordFollowCompleted("creator1");
			tracker.recordDMSent("creator2");
			tracker.recordFollowCompleted("creator2");
			tracker.recordFollowCompleted("creator3"); // Follow without DM

			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				1,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 1,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				2,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 1,
					followsCompleted: 1,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				3,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 2,
					followsCompleted: 1,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				4,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 2,
					followsCompleted: 2,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				5,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 2,
					followsCompleted: 3,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
		});
	});

	describe("Error and Rate Limit Tracking", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("records profile loading errors", () => {
			tracker.recordError(
				"problematic_user",
				"profile_load_failed",
				"Page timeout",
			);

			expect(mockRecordError).toHaveBeenCalledWith(
				"problematic_user",
				"profile_load_failed",
				"Page timeout",
			);
			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 1,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("records rate limit hits", () => {
			tracker.recordRateLimit();

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 1,
				visionApiCost: 0,
			});
		});

		it("accumulates errors and rate limits", () => {
			tracker.recordError("user1", "timeout");
			tracker.recordRateLimit();
			tracker.recordError("user2", "network_error");
			tracker.recordRateLimit();
			tracker.recordRateLimit();

			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				1,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 1,
					rateLimitsHit: 0,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				2,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 1,
					rateLimitsHit: 1,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				3,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 2,
					rateLimitsHit: 1,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				4,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 2,
					rateLimitsHit: 2,
					visionApiCost: 0,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				5,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 2,
					rateLimitsHit: 3,
					visionApiCost: 0,
				},
			);
		});
	});

	describe("Vision API Cost Tracking", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("records vision API calls with default cost", () => {
			tracker.recordVisionApiCall();

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0.001, // Default cost
			});
		});

		it("records vision API calls with custom cost", () => {
			tracker.recordVisionApiCall(0.002);

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				avgProcessingTime: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0.002,
			});
		});

		it("accumulates vision API costs", () => {
			tracker.recordVisionApiCall(0.001);
			tracker.recordVisionApiCall(0.0015);
			tracker.recordVisionApiCall(0.002);

			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				1,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0.001,
				},
			);
			expect(mockUpdateSessionMetrics).toHaveBeenNthCalledWith(
				2,
				"test-session",
				{
					profilesVisited: 0,
					creatorsFound: 0,
					dmsSent: 0,
					followsCompleted: 0,
					avgProcessingTime: 0,
					errorsEncountered: 0,
					rateLimitsHit: 0,
					visionApiCost: 0.0025,
				},
			);
			// Check that the 3rd call has visionApiCost close to 0.0045 (floating point precision)
			const thirdCall = mockUpdateSessionMetrics.mock.calls[2][1] as { visionApiCost: number };
			expect(thirdCall.visionApiCost).toBeCloseTo(0.0045);
		});
	});

	describe("Session Management", () => {
		let tracker: InstanceType<typeof MetricsTracker>;

		beforeEach(() => {
			tracker = new MetricsTracker("test-session");
		});

		it("ends session and records final metrics", () => {
			// Add some metrics first
			tracker.recordProfileVisit("user1", 1.0, "seed", 0, undefined, [], 0);
			tracker.recordCreatorFound("user1", 80, 1);
			tracker.recordDMSent("user1");

			// End session
			tracker.endSession();

			expect(mockUpdateSessionMetrics).toHaveBeenCalledWith("test-session", {
				profilesVisited: 1,
				creatorsFound: 1,
				dmsSent: 1,
				followsCompleted: 0,
				avgProcessingTime: 1,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				visionApiCost: 0,
			});
		});

		it("provides access to session metrics", () => {
			const initialMetrics = tracker.getSessionMetrics();

			expect(initialMetrics).toEqual({
				sessionId: "test-session",
				startTime: expect.any(Date),
				profilesVisited: 0,
				creatorsFound: 0,
				dmsSent: 0,
				followsCompleted: 0,
				errorsEncountered: 0,
				rateLimitsHit: 0,
				totalProcessingTime: 0,
				visionApiCalls: 0,
				visionApiCost: 0,
			});
		});
	});

	describe("Performance Timer", () => {
		it("measures execution time", () => {
			const timer = startTimer("test operation");

			// Simulate some work
			for (let i = 0; i < 100000; i++) {
				Math.sqrt(i);
			}

			const duration = timer.end();

			expect(duration).toBeGreaterThan(0);
			expect(typeof duration).toBe("number");
		});

		it("provides timing for async operations", async () => {
			const timer = startTimer("async test");

			// Simulate async work
			await new Promise((resolve) => setTimeout(resolve, 15));

			const duration = timer.end();

			expect(duration).toBeGreaterThanOrEqual(0.01); // At least 10ms (inclusive due to timer precision)
			expect(duration).toBeLessThan(1.0); // Reasonable upper bound
		});
	});

	describe("Daily Metrics Aggregation", () => {
		it("retrieves daily metrics summary", async () => {
			mockGetDailyMetrics.mockReturnValue({
				date: "2024-01-15",
				totalSessions: 3,
				totalProfilesVisited: 150,
				totalCreatorsFound: 12,
				totalDmsSent: 10,
				totalFollowsCompleted: 12,
				avgBioScore: 45.2,
				avgConfidence: 78.5,
				totalVisionApiCost: 0.15,
				totalErrors: 5,
				totalRateLimits: 2,
			});

			const summary = await getMetricsSummary("2024-01-15");

			expect(summary.daily).toEqual({
				date: "2024-01-15",
				totalSessions: 3,
				totalProfilesVisited: 150,
				totalCreatorsFound: 12,
				totalDmsSent: 10,
				totalFollowsCompleted: 12,
				avgBioScore: 45.2,
				avgConfidence: 78.5,
				totalVisionApiCost: 0.15,
				totalErrors: 5,
				totalRateLimits: 2,
			});
		});

		it("calculates conversion rates and success metrics", async () => {
			mockGetDailyMetrics.mockReturnValue({
				date: "2024-01-15",
				totalSessions: 2,
				totalProfilesVisited: 100,
				totalCreatorsFound: 10,
				totalDmsSent: 8,
				totalFollowsCompleted: 10,
				avgBioScore: 50.0,
				avgConfidence: 80.0,
				totalVisionApiCost: 0.1,
				totalErrors: 3,
				totalRateLimits: 1,
			});

			const summary = await getMetricsSummary("2024-01-15");

			expect(summary.sessionSuccessRate).toBe(50); // 100 profiles / 2 sessions
			expect(summary.creatorConversionRate).toBe(10); // 10 creators / 100 profiles * 100
			expect(summary.dmSuccessRate).toBe(80); // 8 DMs / 10 creators * 100
		});

		it("handles empty metrics gracefully", async () => {
			mockGetDailyMetrics.mockReturnValue(null);

			const summary = await getMetricsSummary("2024-01-15");

			expect(summary.daily).toBeNull();
			expect(summary.sessionSuccessRate).toBe(0);
			expect(summary.creatorConversionRate).toBe(0);
			expect(summary.dmSuccessRate).toBe(0);
		});

		it("uses today's date when no date provided", async () => {
			mockGetDailyMetrics.mockReturnValue(null);

			await getMetricsSummary();

			expect(mockGetDailyMetrics).toHaveBeenCalledWith(undefined);
		});
	});

	describe("Complete Workflow Example", () => {
		it("demonstrates full metrics tracking workflow", () => {
			// Initialize session
			const tracker = new MetricsTracker("workflow-session");

			// Process seed profile
			tracker.recordProfileVisit(
				"seed_user",
				1.2,
				"seed",
				0,
				undefined,
				["fitness"],
				0,
			);

			// Discover creator through seed's following
			tracker.recordProfileVisit(
				"creator1",
				2.1,
				"following_of_seed_user",
				1,
				"seed_user",
				["creator", "influencer"],
				1,
			);
			tracker.recordCreatorFound("creator1", 85, 1);

			// Send DM and follow
			tracker.recordDMSent("creator1");
			tracker.recordFollowCompleted("creator1");

			// Process another profile with error
			tracker.recordProfileVisit(
				"problem_user",
				0.5,
				"following_of_creator1",
				2,
				"creator1",
				[],
				0,
			);
			tracker.recordError("problem_user", "private_account");

			// Discover another creator
			tracker.recordProfileVisit(
				"creator2",
				1.8,
				"following_of_creator1",
				2,
				"creator1",
				["lifestyle"],
				0,
			);
			tracker.recordCreatorFound("creator2", 92, 0); // High bio score, no vision needed

			// Hit rate limit
			tracker.recordRateLimit();

			// End session
			tracker.endSession();

			// Verify all metrics were recorded
			expect(mockRecordProfileMetrics).toHaveBeenCalledTimes(4);
			expect(mockUpdateSessionMetrics).toHaveBeenCalledTimes(11); // 4 profile visits + 2 creators + 1 DM + 1 follow + 1 error + 1 rate limit + 1 end session
			expect(mockRecordError).toHaveBeenCalledTimes(1);
		});
	});
});
