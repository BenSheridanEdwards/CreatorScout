#!/usr/bin/env tsx
/**
 * Clear saved Instagram cookies
 * Useful when session expires or you want to force a fresh login
 */

import { clearCookies } from "../functions/auth/sessionManager/sessionManager.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";

const logger = createLogger();

async function main() {
	console.log("🍪 Clearing saved Instagram cookies...");
	
	try {
		clearCookies();
		console.log("✅ Cookies cleared successfully!");
		console.log("   Next login will be a fresh session.");
		process.exit(0);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.error("❌ Failed to clear cookies:", errorMsg);
		logger.error("ERROR", `Failed to clear cookies: ${errorMsg}`);
		process.exit(1);
	}
}

main();

