/**
 * Process multiple profiles with specific actions
 *
 * Usage: tsx scripts/process_profiles.ts <usernames> [options]
 * Example: tsx scripts/process_profiles.ts user1,user2,user3 --follow --dm
 * Example: tsx scripts/process_profiles.ts user1 --analyze
 */

import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { navigateToProfileAndCheck } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import {
	followUserAccount,
	sendDMToUser,
} from "../functions/profile/profileActions/profileActions.ts";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.ts";
import {
	wasDmSent,
	wasFollowed,
} from "../functions/shared/database/database.ts";
import { getDelay } from "../functions/timing/humanize/humanize.ts";
import { sleep } from "../functions/timing/sleep/sleep.ts";

interface ProcessOptions {
	analyze: boolean;
	follow: boolean;
	dm: boolean;
}

async function processProfiles(
	usernames: string[],
	options: ProcessOptions,
): Promise<void> {
	console.log(
		`🚀 Processing ${usernames.length} profiles with options:`,
		options,
	);

	const { browser, page } = await initializeInstagramSession({
		headless: false,
		debug: true,
	});

	try {
		for (let i = 0; i < usernames.length; i++) {
			const username = usernames[i];
			console.log(`[${i + 1}/${usernames.length}] Processing @${username}`);

			try {
				// Navigate to profile
				console.log(`  📍 Navigating to @${username}...`);
				const status = await navigateToProfileAndCheck(page, username, {
					timeout: 15000,
				});

				if (status.notFound) {
					console.log("  ❌ Profile not found");
					continue;
				}

				if (status.isPrivate) {
					console.log("  🔒 Profile is private");
					continue;
				}

				// Analyze if requested
				if (options.analyze) {
					console.log("  🧠 Analyzing profile...");
					const analysis = await analyzeProfileComprehensive(page, username);
					console.log(
						`  📊 Confidence: ${analysis.confidence}%, Creator: ${analysis.isCreator ? "YES" : "NO"}`,
					);
				}

				// Follow if requested and not already followed
				if (options.follow && !(await wasFollowed(username))) {
					console.log("  👥 Following...");
					const followSuccess = await followUserAccount(page, username);
					console.log(
						`  ${followSuccess ? "✅ Followed" : "ℹ️ Already following"}`,
					);
				} else if (options.follow && (await wasFollowed(username))) {
					console.log("  ℹ️ Already following");
				}

				// DM if requested and not already sent
				if (options.dm && !(await wasDmSent(username))) {
					console.log("  💬 Sending DM...");
					const dmSuccess = await sendDMToUser(page, username);
					console.log(`  ${dmSuccess ? "✅ DM sent" : "❌ DM failed"}`);
				} else if (options.dm && (await wasDmSent(username))) {
					console.log("  ℹ️ Already DM'd");
				}

				console.log(`  ✅ Completed @${username}\n`);
			} catch (error) {
				console.error(`  ❌ Failed to process @${username}:`, error);
			}

			// Delay between profiles (except for last one)
			if (i < usernames.length - 1) {
				const [minDelay, maxDelay] = getDelay("between_profiles");
				const delay = minDelay + Math.random() * (maxDelay - minDelay);
				console.log(
					`⏳ Waiting ${Math.floor(delay)}s before next profile...\n`,
				);
				await sleep(delay * 1000);
			}
		}

		console.log("🎉 Processing completed!");
	} catch (error) {
		console.error("❌ Processing failed:", error);
	} finally {
		await browser.close();
	}
}

// Parse command line arguments
function parseArgs(): { usernames: string[]; options: ProcessOptions } {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("❌ Please provide usernames and options");
		console.error(
			"Usage: tsx scripts/process_profiles.ts <usernames> [options]",
		);
		console.error(
			"Example: tsx scripts/process_profiles.ts user1,user2 --follow --dm",
		);
		console.error("Example: tsx scripts/process_profiles.ts user1 --analyze");
		console.error("");
		console.error("Options:");
		console.error("  --analyze  Analyze profiles");
		console.error("  --follow   Follow profiles");
		console.error("  --dm       Send DMs to profiles");
		process.exit(1);
	}

	// First argument should be usernames (comma-separated)
	const usernamesArg = args[0];
	const usernames = usernamesArg
		.split(",")
		.map((u) => u.trim())
		.filter((u) => u);

	if (usernames.length === 0) {
		console.error("❌ No valid usernames provided");
		process.exit(1);
	}

	// Parse options
	const options: ProcessOptions = {
		analyze: args.includes("--analyze"),
		follow: args.includes("--follow"),
		dm: args.includes("--dm"),
	};

	// If no specific options provided, default to analyze
	if (!options.analyze && !options.follow && !options.dm) {
		options.analyze = true;
		console.log("ℹ️  No options specified, defaulting to --analyze");
	}

	return { usernames, options };
}

const { usernames, options } = parseArgs();
processProfiles(usernames, options).catch(console.error);
