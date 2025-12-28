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

export interface RunMetadata {
	id: string;
	scriptName: string;
	startTime: string;
	endTime?: string;
	status: "running" | "completed" | "error";
	profilesProcessed: number;
	creatorsFound: number;
	errors: number;
	screenshots: string[];
	finalScreenshot?: string;
	errorMessage?: string;
	stats?: {
		duration?: number;
		avgProcessingTime?: number;
		successRate?: number;
	};
	errorLogs?: ErrorLog[];
	creatorsFoundList?: CreatorFound[];
}

export interface Stats {
	creatorsFound: number;
	dmsSent: number;
}

