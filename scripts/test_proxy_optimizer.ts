/**
 * Test script to verify ProxyOptimizer works with AdsPower
 * 
 * Run with: npx tsx scripts/test_proxy_optimizer.ts
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { getActiveProfiles } from "../functions/shared/profiles/profileManager.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";

const logger = createLogger();

async function testProxyOptimizer() {
	logger.info("SESSION", "🧪 Testing ProxyOptimizer with AdsPower...");

	// Get first active profile
	const profiles = await getActiveProfiles();
	const profile = profiles[0];

	if (!profile) {
		logger.error("SESSION", "No active profiles found");
		process.exit(1);
	}

	logger.info("SESSION", `Using profile: @${profile.username} (${profile.adsPowerProfileId})`);

	let session;
	try {
		// Initialize session with proxy optimizer
		session = await initializeInstagramSession({
			headless: false, // Visible browser so you can see it working
			adsPowerProfileId: profile.adsPowerProfileId,
			profileId: profile.id,
			blockResources: true, // Enable resource blocking
		});

		const { page, proxyOptimizer } = session;

		if (!proxyOptimizer) {
			logger.error("SESSION", "❌ ProxyOptimizer was not attached!");
			process.exit(1);
		}

		logger.info("SESSION", "✅ ProxyOptimizer attached successfully");

		// Navigate to a few pages to test blocking
		logger.info("SESSION", "📱 Navigating to Instagram feed...");
		await page.goto("https://www.instagram.com/", { 
			waitUntil: "domcontentloaded",
			timeout: 30000 
		});
		await new Promise(r => setTimeout(r, 5000)); // Wait for dynamic content

		// Check stats
		const stats = proxyOptimizer.getStats();
		logger.info("SESSION", `📊 Stats after feed load:`);
		logger.info("SESSION", `   Requests: ${stats.requestCount}`);
		logger.info("SESSION", `   Blocked: ${stats.blockedCount}`);
		logger.info("SESSION", `   Estimated MB: ${stats.estimatedMB.toFixed(2)}`);
		logger.info("SESSION", `   Saved MB: ${stats.savedMB.toFixed(2)}`);

		// Navigate to explore
		logger.info("SESSION", "📱 Navigating to Explore...");
		await page.goto("https://www.instagram.com/explore/", { 
			waitUntil: "domcontentloaded",
			timeout: 30000 
		});
		await new Promise(r => setTimeout(r, 5000)); // Wait for dynamic content

		// Check stats again
		const stats2 = proxyOptimizer.getStats();
		logger.info("SESSION", `📊 Stats after explore:`);
		logger.info("SESSION", `   Requests: ${stats2.requestCount}`);
		logger.info("SESSION", `   Blocked: ${stats2.blockedCount}`);
		logger.info("SESSION", `   Estimated MB: ${stats2.estimatedMB.toFixed(2)}`);
		logger.info("SESSION", `   Saved MB: ${stats2.savedMB.toFixed(2)}`);

		// Calculate savings percentage
		const totalPotential = stats2.estimatedMB + stats2.savedMB;
		const savingsPercent = totalPotential > 0 
			? ((stats2.savedMB / totalPotential) * 100).toFixed(1)
			: "0";

		logger.info("SESSION", `💰 Bandwidth savings: ${savingsPercent}%`);

		if (stats2.blockedCount > 0) {
			logger.info("SESSION", "✅ Resource blocking is working!");
		} else {
			logger.warn("SESSION", "⚠️ No resources were blocked - check configuration");
		}

		// Finalize and persist stats
		await proxyOptimizer.finalize();
		logger.info("SESSION", "✅ Stats persisted to database");

	} catch (error) {
		logger.error("SESSION", `❌ Test failed: ${error}`);
		throw error;
	} finally {
		if (session?.browser) {
			await session.browser.close();
			logger.info("SESSION", "Browser closed");
		}
	}

	logger.info("SESSION", "🎉 ProxyOptimizer test completed successfully!");
	process.exit(0); // Force exit (DB connections may keep process alive)
}

testProxyOptimizer().catch((error) => {
	console.error("Test failed:", error);
	process.exit(1);
});
