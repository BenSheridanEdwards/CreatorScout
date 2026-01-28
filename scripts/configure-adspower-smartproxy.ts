#!/usr/bin/env tsx
/**
 * Configure SmartProxy for AdsPower Profile
 * 
 * Updates the AdsPower profile to use SmartProxy credentials from .env
 * 
 * Usage:
 *   npx tsx scripts/configure-adspower-smartproxy.ts <profile_id>
 * 
 * Example:
 *   npx tsx scripts/configure-adspower-smartproxy.ts k188xsiv
 */

import "dotenv/config";
import {
	SMARTPROXY_USERNAME,
	SMARTPROXY_PASSWORD,
	SMARTPROXY_HOST,
	SMARTPROXY_PORT,
	ADSPOWER_API_KEY,
} from "../functions/shared/config/config.ts";

const ADSPOWER_API_BASE = process.env.ADSPOWER_API_URL || "http://127.0.0.1:50325";

interface UpdateProxyRequest {
	user_id: string;
	user_proxy_config?: {
		proxy_type: string;
		proxy_host: string;
		proxy_port: string;
		proxy_user: string;
		proxy_password: string;
	};
	proxyid?: string;
}

async function updateAdsPowerProxy(profileId: string): Promise<void> {
	if (!SMARTPROXY_USERNAME || !SMARTPROXY_PASSWORD) {
		console.error("❌ SmartProxy credentials not found in .env");
		console.error("Please set SMARTPROXY_USERNAME and SMARTPROXY_PASSWORD");
		process.exit(1);
	}

	if (!ADSPOWER_API_KEY) {
		console.error("❌ AdsPower API key not found in .env");
		console.error("Please set ADSPOWER_API_KEY");
		process.exit(1);
	}

	console.log("\n🔧 Configuring SmartProxy for AdsPower Profile");
	console.log("═══════════════════════════════════════════════════════════\n");
	console.log(`Profile ID: ${profileId}`);
	console.log(`SmartProxy Host: ${SMARTPROXY_HOST}`);
	console.log(`SmartProxy Port: ${SMARTPROXY_PORT}`);
	console.log(`SmartProxy User: ${SMARTPROXY_USERNAME.substring(0, 20)}...`);
	console.log("");

	// Try v2 API first (newer) - uses profile_id not user_id
	const v2Url = `${ADSPOWER_API_BASE}/api/v2/browser-profile/update`;
	const v2Payload = {
		profile_id: profileId,
		user_proxy_config: {
			proxy_type: "http",
			proxy_host: SMARTPROXY_HOST || "proxy.smartproxy.net",
			proxy_port: SMARTPROXY_PORT?.toString() || "3120",
			proxy_user: SMARTPROXY_USERNAME,
			proxy_password: SMARTPROXY_PASSWORD,
			proxy_soft: "other",
		},
	};

	try {
		console.log("📡 Attempting to update via v2 API...");
		const response = await fetch(v2Url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${ADSPOWER_API_KEY}`,
			},
			body: JSON.stringify(v2Payload),
		});

		const result = await response.json();

		if (result.code === 0) {
			console.log("✅ Proxy configuration updated successfully!");
			console.log(`   Message: ${result.msg || "Success"}`);
			return;
		} else {
			console.log(`⚠️  v2 API returned: ${result.msg || "Unknown error"}`);
			console.log("   Trying v1 API...");
		}
	} catch (error) {
		console.log(`⚠️  v2 API failed: ${error instanceof Error ? error.message : error}`);
		console.log("   Trying v1 API...");
	}

	// Fallback to v1 API
	const v1Url = `${ADSPOWER_API_BASE}/api/v1/user/update`;
	const v1Payload = {
		user_id: profileId,
		user_proxy_config: {
			proxy_type: "http",
			proxy_host: SMARTPROXY_HOST || "proxy.smartproxy.net",
			proxy_port: SMARTPROXY_PORT?.toString() || "3120",
			proxy_user: SMARTPROXY_USERNAME,
			proxy_password: SMARTPROXY_PASSWORD,
		},
	};

	try {
		console.log("📡 Attempting to update via v1 API...");
		const response = await fetch(v1Url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${ADSPOWER_API_KEY}`,
			},
			body: JSON.stringify(v1Payload),
		});

		const result = await response.json();

		if (result.code === 0) {
			console.log("✅ Proxy configuration updated successfully!");
			console.log(`   Message: ${result.msg || "Success"}`);
		} else {
			console.error("❌ Failed to update proxy configuration");
			console.error(`   Error: ${result.msg || "Unknown error"}`);
			console.error(`   Code: ${result.code}`);
			process.exit(1);
		}
	} catch (error) {
		console.error("❌ API request failed");
		console.error(`   Error: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}
}

async function getProfileInfo(profileId: string): Promise<void> {
	if (!ADSPOWER_API_KEY) {
		console.error("❌ AdsPower API key not found");
		return;
	}

	try {
		const url = `${ADSPOWER_API_BASE}/api/v1/user/list?user_id=${profileId}`;
		const response = await fetch(url, {
			headers: {
				"Authorization": `Bearer ${ADSPOWER_API_KEY}`,
			},
		});

		const result = await response.json();

		if (result.code === 0 && result.data?.list?.length > 0) {
			const profile = result.data.list[0];
			console.log("\n📋 Current Profile Information:");
			console.log("─────────────────────────────────────────────");
			console.log(`Name: ${profile.name || "N/A"}`);
			console.log(`User ID: ${profile.user_id}`);
			console.log(`IP: ${profile.ip || "N/A"} (${profile.ip_country || "N/A"})`);
			console.log(`Username: ${profile.username || "N/A"}`);
			console.log("");
		}
	} catch (error) {
		console.log(`⚠️  Could not fetch profile info: ${error}`);
	}
}

async function main() {
	const profileId = process.argv[2];

	if (!profileId) {
		console.error("❌ Profile ID required");
		console.error("");
		console.error("Usage:");
		console.error("  npx tsx scripts/configure-adspower-smartproxy.ts <profile_id>");
		console.error("");
		console.error("Example:");
		console.error("  npx tsx scripts/configure-adspower-smartproxy.ts k188xsiv");
		process.exit(1);
	}

	await getProfileInfo(profileId);
	await updateAdsPowerProxy(profileId);

	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("✅ Configuration complete!");
	console.log("");
	console.log("Next steps:");
	console.log("  1. Restart the AdsPower profile");
	console.log("  2. Verify proxy is working in AdsPower app");
	console.log("  3. Check logs for proxy initialization");
	console.log("");
}

main().catch((error) => {
	console.error("Error:", error.message);
	process.exit(1);
});
