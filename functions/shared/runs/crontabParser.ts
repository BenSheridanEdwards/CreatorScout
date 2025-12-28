/**
 * Crontab Parser
 * Parses system crontab to detect scheduled runs
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import parser from "cron-parser";

const execAsync = promisify(exec);

export interface ScheduledRun {
	id: string;
	profileId: string;
	scriptName: string;
	scheduledTime: string; // ISO UTC timestamp
	recurring?: "daily" | "weekday";
	sessionType?: "morning" | "afternoon" | "evening";
	accountName?: string;
	cronPattern: string;
}

/**
 * Parse crontab entries matching schedule.sh pattern
 */
export async function parseCrontab(): Promise<ScheduledRun[]> {
	const scheduledRuns: ScheduledRun[] = [];

	try {
		// Try to read crontab
		let crontabContent: string;
		try {
			const { stdout } = await execAsync("crontab -l");
			crontabContent = stdout;
		} catch {
			// If crontab -l fails, try reading from common locations
			const fs = await import("node:fs/promises");
			const os = await import("node:os");
			const path = await import("node:path");

			const user = os.userInfo().username;
			const crontabPaths = [
				`/var/spool/cron/crontabs/${user}`, // Linux
				path.join(os.homedir(), ".crontab"), // macOS fallback
			];

			crontabContent = "";
			for (const crontabPath of crontabPaths) {
				try {
					crontabContent = await fs.readFile(crontabPath, "utf-8");
					break;
				} catch {
					// Try next path
				}
			}

			if (!crontabContent) {
				return scheduledRuns; // No crontab found
			}
		}

		// Parse crontab lines
		const lines = crontabContent.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();

			// Skip comments and empty lines
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}

			// Match pattern: * * * * * cd /path && ./scripts/cron/schedule.sh <profile> <session>
			const scheduleMatch = trimmed.match(
				/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+cd\s+([^\s]+)\s+&&\s+\.\/scripts\/cron\/schedule\.sh\s+(\S+)\s+(\S+)/,
			);

			if (scheduleMatch) {
				const [, cronPattern, projectPath, profileId, sessionType] = scheduleMatch;

				// Validate session type
				if (
					!["morning", "afternoon", "evening"].includes(sessionType)
				) {
					continue;
				}

				// Calculate next occurrence
				try {
					const interval = parser.parseExpression(cronPattern);
					const nextDate = interval.next().toDate();
					const scheduledTime = nextDate.toISOString();

					// Generate ID
					const id = `scheduled_${profileId}_${sessionType}_${Date.now()}`;

					scheduledRuns.push({
						id,
						profileId,
						scriptName: "discover", // Inferred from execution chain
						scheduledTime,
						sessionType: sessionType as "morning" | "afternoon" | "evening",
						accountName: profileId, // Use profileId as account name for now
						cronPattern,
					});
				} catch (error) {
					console.error(`Failed to parse cron pattern ${cronPattern}:`, error);
				}
			}
		}
	} catch (error) {
		console.error("Failed to parse crontab:", error);
	}

	return scheduledRuns;
}

