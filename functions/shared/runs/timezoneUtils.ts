/**
 * Timezone Utilities
 * Handle timezone conversion for scheduled runs
 */

/**
 * Detect server timezone
 */
export function getServerTimezone(): string {
	try {
		// Try to detect from system
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return tz || "UTC";
	} catch {
		return "UTC";
	}
}

/**
 * Convert local time to UTC ISO string
 */
export function localTimeToUTC(localTime: string, timezone: string): string {
	try {
		// Parse local time (format: "HH:mm")
		const [hours, minutes] = localTime.split(":").map(Number);
		const now = new Date();
		const localDate = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			hours,
			minutes,
		);

		// Convert to UTC using Intl API
		const utcDate = new Date(
			localDate.toLocaleString("en-US", { timeZone: timezone }),
		);
		const utcOffset = localDate.getTime() - utcDate.getTime();
		const utcTime = new Date(localDate.getTime() + utcOffset);

		return utcTime.toISOString();
	} catch (error) {
		console.error("Failed to convert local time to UTC:", error);
		return new Date().toISOString();
	}
}

/**
 * Format UTC ISO string to local timezone display
 */
export function formatToLocalTimezone(
	utcISO: string,
	timezone?: string,
): string {
	try {
		const date = new Date(utcISO);
		const options: Intl.DateTimeFormatOptions = {
			timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		};
		return date.toLocaleString("en-US", options);
	} catch {
		return utcISO;
	}
}

/**
 * Calculate seconds until scheduled time
 */
export function secondsUntil(utcISO: string): number {
	const now = Date.now();
	const scheduled = new Date(utcISO).getTime();
	return Math.max(0, Math.floor((scheduled - now) / 1000));
}
