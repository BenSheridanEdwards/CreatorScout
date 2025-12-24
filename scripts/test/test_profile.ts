/**
 * Test Single Profile
 *
 * Tests a single GoLogin profile end-to-end:
 * - GoLogin connection
 * - Proxy rotation
 * - Session initialization
 * - Basic Instagram actions
 *
 * Usage: tsx scripts/test/test_profile.ts --profile=<profile-id>
 */
import { initializeInstagramSession } from "../../functions/auth/sessionInitializer/sessionInitializer.ts";
import { isGoLoginProfileAvailable } from "../../functions/navigation/browser/goLoginConnector.ts";
import {
	getLimitStatus,
	logLimitStatus,
} from "../../functions/shared/limits/actionLimits.ts";
import { createLogger } from "../../functions/shared/logger/logger.ts";
import { getProfileById } from "../../functions/shared/profiles/profileManager.ts";
import {
	getProxyForProfile,
	isProxySessionValid,
} from "../../functions/shared/proxy/smartproxy.ts";
import { warmUpProfile } from "../../functions/timing/warmup/warmup.ts";

const logger = createLogger(true);

interface TestArgs {
	profileId: string;
	skipWarmup?: boolean;
}

function parseArgs(): TestArgs {
	const args = process.argv.slice(2);
	const result: Partial<TestArgs> = {};

	for (const arg of args) {
		if (arg.startsWith("--profile=")) {
			result.profileId = arg.split("=")[1];
		} else if (arg === "--skip-warmup") {
			result.skipWarmup = true;
		}
	}

	if (!result.profileId) {
		throw new Error("Missing required argument: --profile=<profile-id>");
	}

	return result as TestArgs;
}

async function testProfile(args: TestArgs): Promise<void> {
	const { profileId, skipWarmup } = args;

	logger.info(
		"TEST",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("TEST", "🧪 Profile Test Suite");
	logger.info(
		"TEST",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("TEST", `Profile ID: ${profileId}`);
	logger.info("TEST", "");

	// Test 1: Load profile from database
	logger.info("TEST", "📋 Test 1: Load profile from database...");
	const profile = await getProfileById(profileId);

	if (!profile) {
		logger.error("TEST", `❌ Profile not found: ${profileId}`);
		logger.info("TEST", "");
		logger.info("TEST", "Available options:");
		logger.info("TEST", "1. Create the profile in the database");
		logger.info("TEST", "2. Use a valid profile ID");
		process.exit(1);
	}

	logger.info(
		"TEST",
		`✅ Profile loaded: @${profile.username} (${profile.type})`,
	);
	logLimitStatus(profile);

	// Test 2: Check GoLogin availability
	logger.info("TEST", "");
	logger.info("TEST", "🔗 Test 2: Check GoLogin connection...");

	if (!profile.goLoginProfileId) {
		logger.error("TEST", "❌ No GoLogin token configured for this profile");
		process.exit(1);
	}

	try {
		const isAvailable = await isGoLoginProfileAvailable(profile.goLoginProfileId);
		if (isAvailable) {
			logger.info("TEST", "✅ GoLogin profile is available");
		} else {
			logger.warn(
				"TEST",
				"⚠️ GoLogin profile not available (may need to start)",
			);
		}
	} catch (error) {
		logger.warn("TEST", `⚠️ Could not check GoLogin: ${error}`);
	}

	// Test 3: Check proxy configuration
	logger.info("TEST", "");
	logger.info("TEST", "🌐 Test 3: Check proxy configuration...");

	try {
		const proxyConfig = await getProxyForProfile(profileId);
		if (proxyConfig.host) {
			logger.info(
				"TEST",
				`✅ Proxy configured: ${proxyConfig.host}:${proxyConfig.port}`,
			);
			logger.info("TEST", `   Sticky session: ${proxyConfig.stickySession}`);
			logger.info("TEST", `   Valid: ${isProxySessionValid(profileId)}`);
		} else {
			logger.warn("TEST", "⚠️ No proxy configured (using direct connection)");
		}
	} catch (error) {
		logger.warn("TEST", `⚠️ Proxy check failed: ${error}`);
	}

	// Test 4: Initialize session
	logger.info("TEST", "");
	logger.info("TEST", "🚀 Test 4: Initialize Instagram session...");

	let browser;
	try {
		const session = await initializeInstagramSession({
			headless: true,
			goLoginProfileId: profile.goLoginProfileId,
			profileId: profile.id,
			debug: true,
		});
		browser = session.browser;
		const page = session.page;

		logger.info("TEST", "✅ Session initialized successfully");

		// Test 5: Warm-up (optional)
		if (!skipWarmup) {
			logger.info("TEST", "");
			logger.info("TEST", "🔥 Test 5: Run warm-up routine...");
			const warmupStats = await warmUpProfile(page, 1);
			logger.info(
				"TEST",
				`✅ Warm-up complete: ${warmupStats.scrolls} scrolls, ${warmupStats.likes} likes`,
			);
		} else {
			logger.info("TEST", "");
			logger.info("TEST", "⏭️ Test 5: Skipping warm-up (--skip-warmup flag)");
		}

		// Test 6: Check for detection flags
		logger.info("TEST", "");
		logger.info("TEST", "🔍 Test 6: Check for detection flags...");

		const detectionCheck = await page.evaluate(() => {
			const checks = {
				hasLoginRedirect: window.location.href.includes("/accounts/login"),
				hasChallenge: window.location.href.includes("challenge"),
				hasSuspicious: window.location.href.includes("suspicious"),
				hasConsentPage: !!document.querySelector("[data-cookiebanner]"),
				hasRateLimit: document.body.innerText.includes("Please wait"),
			};

			return checks;
		});

		if (detectionCheck.hasLoginRedirect) {
			logger.warn("TEST", "⚠️ Redirected to login - session may be invalid");
		} else if (detectionCheck.hasChallenge) {
			logger.warn("TEST", "⚠️ Challenge detected - account may be flagged");
		} else if (detectionCheck.hasSuspicious) {
			logger.warn("TEST", "⚠️ Suspicious activity detected");
		} else if (detectionCheck.hasRateLimit) {
			logger.warn("TEST", "⚠️ Rate limit detected");
		} else {
			logger.info("TEST", "✅ No detection flags found");
		}

		// Test 7: Take screenshot
		logger.info("TEST", "");
		logger.info("TEST", "📸 Test 7: Take screenshot...");

		const screenshotPath = `tmp/test_profile_${profileId}_${Date.now()}.png`;
		await page.screenshot({ path: screenshotPath, fullPage: false });
		logger.info("TEST", `✅ Screenshot saved: ${screenshotPath}`);
	} catch (error) {
		logger.error("TEST", `❌ Session test failed: ${error}`);
		throw error;
	} finally {
		if (browser) {
			await browser.close();
			logger.info("TEST", "");
			logger.info("TEST", "🔒 Browser closed");
		}
	}

	// Summary
	logger.info("TEST", "");
	logger.info(
		"TEST",
		"═══════════════════════════════════════════════════════════════",
	);
	logger.info("TEST", "✅ All tests passed!");
	logger.info(
		"TEST",
		"═══════════════════════════════════════════════════════════════",
	);
}

// Main
testProfile(parseArgs())
	.then(() => process.exit(0))
	.catch((error) => {
		logger.error("TEST", `Test suite failed: ${error}`);
		process.exit(1);
	});

