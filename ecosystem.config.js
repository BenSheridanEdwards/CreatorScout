/**
 * PM2 Ecosystem Configuration
 *
 * Manages Scout application processes in production.
 * Run with: pm2 start ecosystem.config.js
 */
module.exports = {
	apps: [
		{
			name: "scout-server",
			script: "server.ts",
			interpreter: "tsx",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "2G",
			env: {
				NODE_ENV: "production",
			},
			error_file: "logs/pm2-error.log",
			out_file: "logs/pm2-out.log",
			log_file: "logs/pm2-combined.log",
			time: true,
		},
	],
};


