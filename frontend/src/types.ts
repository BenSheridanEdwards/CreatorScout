export interface Screenshot {
	username: string;
	type: "profile" | "link" | "dm" | "error" | "debug" | "unknown";
	date: string;
	path: string;
	filename: string;
}

export interface ErrorLog {
	timestamp: string;
	username?: string;
	message: string;
	stack?: string;
}

export interface CreatorFound {
	username: string;
	confidence: number;
	reason: string;
	timestamp: string;
	screenshotPath?: string;
}

export interface RunIssue {
	type:
		| "rate_limit"
		| "high_error_rate"
		| "early_termination"
		| "low_discovery"
		| "oom"
		| "stack_trace"
		| "error_429";
	message: string;
	severity: "warning" | "critical";
	detectedAt: string; // ISO timestamp
	logLine?: number; // Line number in logs where issue was found
}

export interface RunMetadata {
	id: string;
	scriptName: string;
	startTime: string;
	endTime?: string;
	status: "scheduled" | "running" | "completed" | "error";
	profilesProcessed: number;
	creatorsFound: number;
	errors: number;
	screenshots: string[];
	finalScreenshot?: string;
	errorMessage?: string;
	scheduledTime?: string; // ISO timestamp for scheduled runs
	issues?: RunIssue[]; // Detected problems
	profileId?: string; // Profile ID for cron runs
	sessionType?: "morning" | "afternoon" | "evening"; // Session type for cron runs
	stats?: {
		duration?: number;
		avgProcessingTime?: number;
		successRate?: number;
	};
	errorLogs?: ErrorLog[];
	creatorsFoundList?: CreatorFound[];
}

export interface ScheduledRun {
	id: string;
	name?: string; // Human-readable name/description for the scheduled task
	profileId: string;
	scriptName: string;
	scheduledTime: string;
	recurring?: "daily" | "weekday";
	sessionType?: "morning" | "afternoon" | "evening";
	accountName?: string; // Display name for account filtering
	cronPattern?: string; // Cron pattern for display (if from crontab)
	source?: "cron" | "config"; // Distinguish schedule sources
}

export interface TimelineCard {
	id: string;
	type: "scheduled" | "running" | "completed" | "error";
	profileId: string;
	accountName: string;
	timestamp: string; // ISO timestamp for positioning on timeline
	thumbnail?: string; // Latest screenshot path
	hasIssues?: boolean; // Amber dot indicator
	countdown?: number; // Seconds until scheduled run
	elapsed?: number; // Seconds elapsed for running runs
	name?: string; // Task name/description
	scriptName?: string; // Script that will be executed
}

export interface Stats {
	creatorsFound: number;
	dmsSent: number;
}

