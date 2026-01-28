/**
 * Notification Service
 *
 * Sends alerts via webhooks (Discord, Slack, etc.) when important events occur:
 * - Data quality degradation
 * - Session failures
 * - System health issues
 */

import { createLogger } from "../logger/logger.ts";

const logger = createLogger();

export interface NotificationPayload {
	title: string;
	message: string;
	level: "info" | "warning" | "error";
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
	timestamp?: string;
}

/**
 * Get webhook URL from environment
 */
function getWebhookUrl(): string | null {
	return process.env.WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || null;
}

/**
 * Send notification to Discord webhook
 */
async function sendDiscordNotification(
	webhookUrl: string,
	payload: NotificationPayload,
): Promise<boolean> {
	const colors: Record<string, number> = {
		info: 0x3498db, // Blue
		warning: 0xf39c12, // Orange
		error: 0xe74c3c, // Red
	};

	const discordPayload = {
		embeds: [
			{
				title: payload.title,
				description: payload.message,
				color: colors[payload.level] || colors.info,
				fields: payload.fields?.map((f) => ({
					name: f.name,
					value: f.value,
					inline: f.inline ?? true,
				})),
				timestamp: payload.timestamp || new Date().toISOString(),
				footer: {
					text: "Scout Notification Service",
				},
			},
		],
	};

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(discordPayload),
		});

		if (!response.ok) {
			logger.warn(
				"NOTIFY",
				`Discord webhook returned ${response.status}: ${response.statusText}`,
			);
			return false;
		}

		return true;
	} catch (error) {
		logger.error(
			"NOTIFY",
			`Failed to send Discord notification: ${error}`,
		);
		return false;
	}
}

/**
 * Send notification to Slack webhook
 */
async function sendSlackNotification(
	webhookUrl: string,
	payload: NotificationPayload,
): Promise<boolean> {
	const emojis: Record<string, string> = {
		info: ":information_source:",
		warning: ":warning:",
		error: ":x:",
	};

	const slackPayload = {
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: `${emojis[payload.level]} ${payload.title}`,
					emoji: true,
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: payload.message,
				},
			},
		],
	};

	if (payload.fields && payload.fields.length > 0) {
		slackPayload.blocks.push({
			type: "section",
			// @ts-expect-error - Slack blocks have dynamic structure
			fields: payload.fields.map((f) => ({
				type: "mrkdwn",
				text: `*${f.name}*\n${f.value}`,
			})),
		});
	}

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(slackPayload),
		});

		if (!response.ok) {
			logger.warn(
				"NOTIFY",
				`Slack webhook returned ${response.status}: ${response.statusText}`,
			);
			return false;
		}

		return true;
	} catch (error) {
		logger.error("NOTIFY", `Failed to send Slack notification: ${error}`);
		return false;
	}
}

/**
 * Send notification to configured webhook
 */
export async function sendNotification(
	payload: NotificationPayload,
): Promise<boolean> {
	const webhookUrl = getWebhookUrl();

	if (!webhookUrl) {
		logger.debug("NOTIFY", "No webhook URL configured, skipping notification");
		return false;
	}

	// Detect webhook type from URL
	if (webhookUrl.includes("discord.com")) {
		return sendDiscordNotification(webhookUrl, payload);
	} else if (webhookUrl.includes("slack.com") || webhookUrl.includes("hooks.slack")) {
		return sendSlackNotification(webhookUrl, payload);
	} else {
		// Generic webhook - send JSON payload
		try {
			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			return response.ok;
		} catch (error) {
			logger.error("NOTIFY", `Failed to send notification: ${error}`);
			return false;
		}
	}
}

/**
 * Send data quality alert notification
 */
export async function sendDataQualityAlert(
	alerts: Array<{
		level: "warning" | "error";
		message: string;
		field: string;
		actual: number;
	}>,
): Promise<void> {
	if (alerts.length === 0) return;

	const hasError = alerts.some((a) => a.level === "error");

	await sendNotification({
		title: hasError
			? "🚨 Data Quality Error"
			: "⚠️ Data Quality Warning",
		message:
			"Data quality issues detected. This may indicate proxy blocking is preventing data extraction.",
		level: hasError ? "error" : "warning",
		fields: alerts.slice(0, 5).map((a) => ({
			name: a.field,
			value: `${a.message} (${(a.actual * 100).toFixed(1)}%)`,
			inline: false,
		})),
	});
}

/**
 * Send session failure notification
 */
export async function sendSessionFailureAlert(
	profileId: string,
	sessionType: string,
	error: string,
): Promise<void> {
	await sendNotification({
		title: "❌ Session Failed",
		message: `Session failed for profile ${profileId}`,
		level: "error",
		fields: [
			{ name: "Profile", value: profileId },
			{ name: "Session Type", value: sessionType },
			{ name: "Error", value: error.substring(0, 200) },
		],
	});
}

/**
 * Send session completion notification (optional - for important milestones)
 */
export async function sendSessionCompleteAlert(
	profileId: string,
	stats: {
		profilesChecked: number;
		creatorsFound: number;
		dmsSent: number;
	},
): Promise<void> {
	// Only notify if significant activity occurred
	if (stats.creatorsFound === 0 && stats.dmsSent === 0) return;

	await sendNotification({
		title: "✅ Session Complete",
		message: `Discovery session completed for ${profileId}`,
		level: "info",
		fields: [
			{ name: "Profiles Checked", value: stats.profilesChecked.toString() },
			{ name: "Creators Found", value: stats.creatorsFound.toString() },
			{ name: "DMs Sent", value: stats.dmsSent.toString() },
		],
	});
}

/**
 * Send system health alert
 */
export async function sendSystemHealthAlert(
	checks: Array<{
		component: string;
		status: "warning" | "error";
		message: string;
	}>,
): Promise<void> {
	if (checks.length === 0) return;

	const hasError = checks.some((c) => c.status === "error");

	await sendNotification({
		title: hasError
			? "🚨 System Health Critical"
			: "⚠️ System Health Warning",
		message: "System health issues detected",
		level: hasError ? "error" : "warning",
		fields: checks.slice(0, 5).map((c) => ({
			name: c.component,
			value: c.message,
			inline: false,
		})),
	});
}
