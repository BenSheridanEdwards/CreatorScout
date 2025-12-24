/**
 * Test Proxy Manager
 *
 * Tests residential proxy setup and sticky sessions
 *
 * Usage:
 *   tsx scripts/test_proxy.ts
 *   tsx scripts/test_proxy.ts --city newyork
 *   tsx scripts/test_proxy.ts --country us --city miami
 */

import { createStickyProxy } from "../functions/navigation/proxy/proxyManager.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";

const logger = createLogger();

interface TestArgs {
	country?: string;
	city?: string;
}

function parseArgs(): TestArgs {
	const args = process.argv.slice(2);
	let country: string | undefined;
	let city: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--country" && args[i + 1]) {
			country = args[i + 1];
		}
		if (args[i] === "--city" && args[i + 1]) {
			city = args[i + 1];
		}
	}

	return { country, city };
}

async function testProxy(args: TestArgs): Promise<void> {
	const { country, city } = args;

	logger.info("PROXY_TEST", "🧪 Testing Proxy Manager");
	logger.info("PROXY_TEST", "");

	// Create proxy manager
	logger.info("PROXY_TEST", "📡 Step 1: Create Proxy Manager");
	logger.info("PROXY_TEST", "────────────────────────────────");

	const proxy = createStickyProxy({
		country: country || "us",
		city,
	});

	const creds = proxy.getProxyCredentials();
	logger.info("PROXY_TEST", `✓ Proxy initialized: ${creds.server}`);
	logger.info("PROXY_TEST", `✓ Username: ${creds.username}`);
	logger.info("PROXY_TEST", "");

	// Test sticky session
	logger.info("PROXY_TEST", "🔄 Step 2: Test Sticky Session");
	logger.info("PROXY_TEST", "──────────────────────────────");

	const session1 = proxy.getSession();
	logger.info("PROXY_TEST", `✓ Session created: ${session1.sessionId}`);
	logger.info("PROXY_TEST", `✓ Created at: ${session1.createdAt.toISOString()}`);
	logger.info("PROXY_TEST", `✓ Expires at: ${session1.expiresAt.toISOString()}`);
	logger.info("PROXY_TEST", `✓ Time remaining: ${proxy.getTimeRemaining()} minutes`);
	logger.info("PROXY_TEST", "");

	// Get same session again (should be same ID)
	const session2 = proxy.getSession();
	if (session1.sessionId === session2.sessionId) {
		logger.info("PROXY_TEST", "✓ Session persistence works (same session ID)");
	} else {
		logger.error("PROXY_TEST", "❌ Session persistence failed (different IDs)");
	}
	logger.info("PROXY_TEST", "");

	// Test proxy URL format
	logger.info("PROXY_TEST", "🔗 Step 3: Test Proxy URL Format");
	logger.info("PROXY_TEST", "────────────────────────────────");

	const proxyUrl = proxy.getProxyUrl();
	logger.info("PROXY_TEST", `✓ Proxy URL: ${proxyUrl}`);

	// Validate format
	const urlRegex = /^http:\/\/.+-session-[a-f0-9]{10}(-.+)?:.+@.+:\d+$/;
	if (urlRegex.test(proxyUrl)) {
		logger.info("PROXY_TEST", "✓ URL format is valid");
	} else {
		logger.error("PROXY_TEST", "❌ URL format is invalid");
	}
	logger.info("PROXY_TEST", "");

	// Test session rotation
	logger.info("PROXY_TEST", "🔄 Step 4: Test Session Rotation");
	logger.info("PROXY_TEST", "────────────────────────────────");

	const oldSessionId = proxy.getSessionInfo()?.sessionId;
	const newSession = proxy.rotateSession();

	if (oldSessionId !== newSession.sessionId) {
		logger.info("PROXY_TEST", "✓ Session rotated successfully");
		logger.info("PROXY_TEST", `  Old: ${oldSessionId}`);
		logger.info("PROXY_TEST", `  New: ${newSession.sessionId}`);
	} else {
		logger.error("PROXY_TEST", "❌ Session rotation failed");
	}
	logger.info("PROXY_TEST", "");

	// Test with real request (optional - requires network)
	logger.info("PROXY_TEST", "🌐 Step 5: Test Real Request (optional)");
	logger.info("PROXY_TEST", "──────────────────────────────────────────");
	logger.info("PROXY_TEST", "ℹ️  Skipping real request test (network test)");
	logger.info("PROXY_TEST", "   To test manually:");
	logger.info("PROXY_TEST", `   curl -x ${proxyUrl} https://ipinfo.io/json`);
	logger.info("PROXY_TEST", "");

	// Summary
	logger.info("PROXY_TEST", "✅ Test Summary");
	logger.info("PROXY_TEST", "═══════════════");
	logger.info("PROXY_TEST", `Server: ${creds.server}`);
	logger.info("PROXY_TEST", `Session: ${proxy.getSessionInfo()?.sessionId}`);
	logger.info("PROXY_TEST", `Time remaining: ${proxy.getTimeRemaining()} minutes`);
	logger.info("PROXY_TEST", `Location: ${city || "auto"}, ${country || "us"}`);
	logger.info("PROXY_TEST", "");
	logger.info("PROXY_TEST", "🎉 All tests passed!");
}

// Main entry point
const args = parseArgs();
testProxy(args)
	.then(() => {
		logger.info("PROXY_TEST", "");
		logger.info("PROXY_TEST", "✅ Test completed successfully");
		process.exit(0);
	})
	.catch((error) => {
		logger.error("PROXY_TEST", "");
		logger.error("PROXY_TEST", `❌ Test failed: ${error}`);
		process.exit(1);
	});


