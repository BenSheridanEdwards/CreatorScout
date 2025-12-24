/**
 * Test script for random engagement actions
 * Tests each action type against a real profile
 */
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { navigateToProfile } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import {
	viewRandomPost,
	watchRandomReel,
	likeRandomPost,
	scrollProfileFeed,
	performRandomEngagement,
} from "../functions/profile/profileActions/randomEngagement.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";
import chalk from "chalk";

const TEST_USERNAME = "bensheridanedwards";

async function main() {
	console.log(chalk.bold.cyan("\n🧪 Testing Random Engagement Actions\n"));
	console.log(chalk.gray("━".repeat(80)));

	// Get profile config
	const args = process.argv.slice(2);
	let profileId = "test-account";
	const profileIdx = args.findIndex((a) => a === "--profile");
	if (profileIdx !== -1 && args[profileIdx + 1]) {
		profileId = args[profileIdx + 1];
	}

	console.log(chalk.blue(`📋 Using profile: ${profileId}`));

	const profileConfig = getProfile(profileId);
	if (!profileConfig) {
		console.error(chalk.red(`❌ Profile "${profileId}" not found`));
		console.log(
			chalk.yellow(
				"Available profiles: test-account, test-account-2, test-account-3",
			),
		);
		process.exit(1);
	}

	// Initialize session
	console.log(chalk.blue("\n🚀 Initializing Instagram session..."));
	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug: true,
		adsPowerProfileId: profileConfig?.adsPowerProfileId,
		credentials: {
			username: profileConfig?.username || "",
			password: profileConfig?.password || "",
		},
	});

	try {
		// Navigate to test profile
		console.log(
			chalk.blue(`\n📍 Navigating to test profile: @${TEST_USERNAME}...`),
		);
		await navigateToProfile(page, TEST_USERNAME);
		await sleep(2000);

		console.log(chalk.green(`✅ Successfully loaded @${TEST_USERNAME}\n`));
		console.log(chalk.gray("━".repeat(80)));

		// Test results storage
		const results: Array<{
			action: string;
			success: boolean;
			duration: number;
			error?: string;
		}> = [];

		// Test 1: Scroll Feed
		console.log(chalk.bold.yellow("\n📜 Test 1: Scroll Profile Feed"));
		try {
			const result = await scrollProfileFeed(page, TEST_USERNAME);
			results.push({
				action: "scroll_feed",
				success: result.success,
				duration: result.duration,
			});
			console.log(
				result.success
					? chalk.green(
							`   ✅ Success! Duration: ${result.duration.toFixed(1)}s`,
					  )
					: chalk.red(`   ❌ Failed`),
			);
		} catch (error) {
			results.push({
				action: "scroll_feed",
				success: false,
				duration: 0,
				error: String(error),
			});
			console.log(chalk.red(`   ❌ Error: ${error}`));
		}

		await sleep(1500);

		// Test 2: View Random Post
		console.log(chalk.bold.yellow("\n🖼️  Test 2: View Random Post"));
		try {
			const result = await viewRandomPost(page, TEST_USERNAME);
			results.push({
				action: "view_post",
				success: result.success,
				duration: result.duration,
			});
			console.log(
				result.success
					? chalk.green(
							`   ✅ Success! Duration: ${result.duration.toFixed(1)}s`,
					  )
					: chalk.red(`   ❌ Failed (no posts found or modal issue)`),
			);
		} catch (error) {
			results.push({
				action: "view_post",
				success: false,
				duration: 0,
				error: String(error),
			});
			console.log(chalk.red(`   ❌ Error: ${error}`));
		}

		await sleep(1500);

		// Test 3: Watch Random Reel
		console.log(chalk.bold.yellow("\n🎬 Test 3: Watch Random Reel"));
		try {
			const result = await watchRandomReel(page, TEST_USERNAME);
			results.push({
				action: "watch_reel",
				success: result.success,
				duration: result.duration,
			});
			console.log(
				result.success
					? chalk.green(
							`   ✅ Success! Duration: ${result.duration.toFixed(1)}s`,
					  )
					: chalk.red(`   ❌ Failed (no reels found)`),
			);
		} catch (error) {
			results.push({
				action: "watch_reel",
				success: false,
				duration: 0,
				error: String(error),
			});
			console.log(chalk.red(`   ❌ Error: ${error}`));
		}

		await sleep(1500);

		// Test 4: Like Random Post
		console.log(chalk.bold.yellow("\n❤️  Test 4: Like Random Post"));
		console.log(
			chalk.gray("   (Note: This will actually like a post on your account)"),
		);
		try {
			const result = await likeRandomPost(page, TEST_USERNAME);
			results.push({
				action: "like_post",
				success: result.success,
				duration: result.duration,
			});
			console.log(
				result.success
					? chalk.green(
							`   ✅ Success! Duration: ${result.duration.toFixed(1)}s`,
					  )
					: chalk.red(`   ❌ Failed (already liked or no posts)`),
			);
		} catch (error) {
			results.push({
				action: "like_post",
				success: false,
				duration: 0,
				error: String(error),
			});
			console.log(chalk.red(`   ❌ Error: ${error}`));
		}

		await sleep(1500);

		// Test 5: Random Action (Full Flow)
		console.log(chalk.bold.yellow("\n🎲 Test 5: Perform Random Engagement"));
		console.log(chalk.gray("   (Simulates real usage - random action chosen)"));
		try {
			const result = await performRandomEngagement(page, TEST_USERNAME);
			results.push({
				action: `random_${result.type}`,
				success: result.success,
				duration: result.duration,
			});
			console.log(
				chalk.cyan(`   🎯 Random action chosen: ${result.type}`),
			);
			console.log(
				result.success
					? chalk.green(
							`   ✅ Success! Duration: ${result.duration.toFixed(1)}s`,
					  )
					: chalk.yellow(`   ⚠️  Action completed with warnings`),
			);
		} catch (error) {
			results.push({
				action: "random_engagement",
				success: false,
				duration: 0,
				error: String(error),
			});
			console.log(chalk.red(`   ❌ Error: ${error}`));
		}

		// Print summary
		console.log(chalk.gray("\n" + "━".repeat(80)));
		console.log(chalk.bold.cyan("\n📊 Test Results Summary\n"));

		const successCount = results.filter((r) => r.success).length;
		const failCount = results.filter((r) => !r.success).length;
		const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

		console.log(chalk.bold(`Total Tests: ${results.length}`));
		console.log(chalk.green(`✅ Passed: ${successCount}`));
		console.log(chalk.red(`❌ Failed: ${failCount}`));
		console.log(
			chalk.blue(`⏱️  Total Duration: ${totalDuration.toFixed(1)}s`),
		);

		console.log(chalk.gray("\n" + "━".repeat(80)));
		console.log(chalk.bold("\nDetailed Results:\n"));

		results.forEach((result, index) => {
			const icon = result.success ? "✅" : "❌";
			const color = result.success ? chalk.green : chalk.red;
			console.log(
				color(
					`${icon} ${result.action.padEnd(20)} - ${result.duration.toFixed(1)}s`,
				),
			);
			if (result.error) {
				console.log(chalk.gray(`   Error: ${result.error}`));
			}
		});

		console.log(chalk.gray("\n" + "━".repeat(80)));

		// Final verdict
		if (successCount === results.length) {
			console.log(
				chalk.bold.green(
					"\n🎉 ALL TESTS PASSED! Random engagement system is working perfectly.\n",
				),
			);
		} else if (successCount >= results.length * 0.6) {
			console.log(
				chalk.bold.yellow(
					`\n⚠️  PARTIAL SUCCESS: ${successCount}/${results.length} tests passed. Some actions may not be available on this profile.\n`,
				),
			);
		} else {
			console.log(
				chalk.bold.red(
					`\n❌ TESTS FAILED: Only ${successCount}/${results.length} tests passed. Check errors above.\n`,
				),
			);
		}

		console.log(
			chalk.gray(
				"Note: Some failures are expected if the profile has no posts/reels or posts are already liked.\n",
			),
		);
	} catch (error) {
		console.error(chalk.red(`\n❌ Test execution failed: ${error}\n`));
		throw error;
	} finally {
		// Keep browser open for inspection
		console.log(
			chalk.blue("\n🔍 Browser will remain open for 10 seconds for inspection..."),
		);
		await sleep(10000);

		console.log(chalk.gray("Closing browser..."));
		await browser.close();
	}
}

main().catch((error) => {
	console.error(chalk.red(`Fatal error: ${error}`));
	process.exit(1);
});

