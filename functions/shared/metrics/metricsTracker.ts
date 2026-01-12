/**
 * Re-export metrics tracker for backwards compatibility
 * The main implementation is in metrics.ts
 */
export {
	MetricsTracker,
	getGlobalMetricsTracker,
	createMetricsTracker,
	getMetricsSummary,
	PerformanceTimer,
	startTimer,
} from "./metrics.ts";
