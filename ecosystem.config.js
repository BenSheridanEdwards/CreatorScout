/**
 * PM2 Ecosystem Configuration
 *
 * Manages Scout application processes in production.
 * Run with: pm2 start ecosystem.config.js
 *
 * This starts the production entry point which includes:
 * - API server
 * - Node-native scheduler (replaces cron)
 * - Health monitoring
 */
module.exports = {
	apps: [
		{
			name: "scout",
			script: "scripts/deploy/start.ts",
			interpreter: "tsx",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "2G",
			env: {
				NODE_ENV: "production",
				SCHEDULER_ENABLED: "true",
				SCHEDULER_TIMEZONE: "Europe/London",
			},
			error_file: "logs/pm2-error.log",
			out_file: "logs/pm2-out.log",
			log_file: "logs/pm2-combined.log",
			time: true,
		},
	],
};
