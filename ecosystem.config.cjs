/**
 * PM2 Ecosystem Configuration
 *
 * Manages Scout application processes in production.
 * Run with: pm2 start ecosystem.config.cjs
 *
 * This starts:
 * - AdsPower browser automation platform
 * - Scout API server + scheduler
 */
module.exports = {
	apps: [
		{
			name: "adspower",
			script: "/opt/AdsPower Global/adspower_global",
			args: "--no-sandbox --disable-gpu",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "1G",
			env: {
				DISPLAY: ":99",
				HEADLESS: "1"
			},
			error_file: "logs/adspower-error.log",
			out_file: "logs/adspower-out.log",
			time: true,
			// Wait for AdsPower to fully start before Scout tries to connect
			wait_ready: false,
			kill_timeout: 5000,
		},
		{
			name: "scout",
			script: "scripts/deploy/start.ts",
			interpreter: "tsx",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "2G",
			// Wait for AdsPower to start first
			wait_ready: false,
			env: {
				NODE_ENV: "production",
				SCHEDULER_ENABLED: "true",
				SCHEDULER_TIMEZONE: "Europe/London",
				DISPLAY: ":99",
			},
			error_file: "logs/pm2-error.log",
			out_file: "logs/pm2-out.log",
			log_file: "logs/pm2-combined.log",
			time: true,
		},
	],
};
