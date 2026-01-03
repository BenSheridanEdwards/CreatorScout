/**
 * Send DMs to multiple Instagram users in one session
 *
 * Usage: tsx scripts/dm_batch.ts --users "user1,user2,user3" --profile test-account --confirm
 * Or: tsx scripts/dm_batch.ts --file usernames.txt --profile test-account --confirm
 *
 * Options:
 *   --users <list>       Comma-separated list of usernames
 *   --file <path>        File with one username per line
 *   --profile <id>       Profile to use (default: test-account)
 *   --confirm            Actually send messages (dry-run without this)
 *   --force              Skip database check for already-sent DMs
 *   --delay <seconds>    Custom delay between DMs (default: 10-30s)
 *   --max <number>       Maximum DMs to send (safety limit)
 */

import { readFileSync } from "fs";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { stopAdsPowerProfile } from "../functions/navigation/browser/adsPowerConnector.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { wasDmSent } from "../functions/shared/database/database.ts";
import { getProfile } from "../functions/shared/profiles/profileLoader.ts";
import { saveScreenshot } from "../functions/shared/snapshot/snapshot.ts";
import { randomDelay } from "../functions/timing/humanize/humanize.ts";

interface BatchResult {
	username: string;
	success: boolean;
	skipped: boolean;
	error?: string;
}

interface BatchOptions {
	usernames: string[];
	profileId: string;
	dryRun: boolean;
	force: boolean;
	delayRange?: [number, number];
	maxDms?: number;
}

async function dmBatch(options: BatchOptions): Promise<BatchResult[]> {
	const { usernames, profileId, dryRun, force, delayRange, maxDms } = options;

	console.log(`\n💬 Batch DM Script`);
	console.log(`📝 Total targets: ${usernames.length}`);

	// Apply max DMs limit if specified
	const targets = maxDms ? usernames.slice(0, maxDms) : usernames;
	if (maxDms && usernames.length > maxDms) {
		console.log(`⚠️  Limiting to first ${maxDms} users (safety limit)`);
	}

	// Load profile config
	const profileConfig = getProfile(profileId);
	if (!profileConfig) {
		throw new Error(`Profile not found: ${profileId}`);
	}

	console.log(`📋 Using profile: @${profileConfig.username}`);
	console.log(`🌐 AdsPower ID: ${profileConfig.adsPowerProfileId}`);

	if (dryRun) {
		console.log(`\n🔍 DRY RUN MODE - No messages will be sent\n`);
	}

	// Default to in-memory DB for this script
	if (!process.env.SCOUT_DB_MODE) {
		process.env.SCOUT_DB_MODE = "memory";
	}

	// Pre-flight checks
	const toMessage: string[] = [];
	const alreadySent: string[] = [];

	if (!force) {
		console.log(`\n🔍 Checking which users haven't been messaged...`);
		for (const username of targets) {
			try {
				if (await wasDmSent(username)) {
					alreadySent.push(username);
				} else {
					toMessage.push(username);
				}
			} catch (err) {
				// If DB check fails, include them
				toMessage.push(username);
			}
		}

		if (alreadySent.length > 0) {
			console.log(`\n⏭️  Skipping ${alreadySent.length} users (already sent):`);
			alreadySent.forEach((u) => console.log(`   - @${u}`));
		}
	} else {
		console.log(`⚡ Force mode: Bypassing all database checks`);
		toMessage.push(...targets);
	}

	if (toMessage.length === 0) {
		console.log(
			`\n✅ All users have already been messaged. Use --force to override.`,
		);
		return [];
	}

	console.log(`\n📨 Will message ${toMessage.length} users:`);
	toMessage.forEach((u, i) => console.log(`   ${i + 1}. @${u}`));

	if (dryRun) {
		console.log(
			`\n✅ Dry run complete. Re-run with --confirm to actually send messages.`,
		);
		return [];
	}

	// Initialize session
	console.log(`\n🌐 Initializing Instagram session...`);
	const { browser, page } = await initializeInstagramSession({
		headless: false,
		debug: true,
		adsPowerProfileId: profileConfig.adsPowerProfileId,
		credentials: {
			username: profileConfig.username,
			password: profileConfig.password,
		},
	});

	const results: BatchResult[] = [];

	try {
		// Process each user
		for (let i = 0; i < toMessage.length; i++) {
			const username = toMessage[i];
			const progress = `[${i + 1}/${toMessage.length}]`;

			console.log(`\n${progress} 📨 Sending DM to @${username}...`);

			try {
				const success = await sendDMToUser(page, username);

				if (success) {
					console.log(`${progress} ✅ DM sent successfully to @${username}`);
					results.push({ username, success: true, skipped: false });
				} else {
					console.log(`${progress} ❌ DM failed for @${username}`);
					results.push({
						username,
						success: false,
						skipped: false,
						error: "Send failed (may have existing conversation)",
					});
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.error(
					`${progress} ❌ Error sending to @${username}: ${errorMessage}`,
				);
				results.push({
					username,
					success: false,
					skipped: false,
					error: errorMessage,
				});
			}

			// Delay before next DM (skip on last user)
			if (i < toMessage.length - 1) {
				const [min, max] = delayRange || [10, 30];
				console.log(`⏳ Waiting ${min}-${max}s before next DM...`);
				await randomDelay(min, max);
			}
		}

		// Include skipped users in results
		for (const username of alreadySent) {
			results.push({ username, success: false, skipped: true });
		}
	} finally {
		// Take final screenshot (debug only - gated by DEBUG_SCREENSHOTS)
		try {
			const finalPath = await saveScreenshot(
				page,
				"dm_batch",
				"complete",
				"final",
				false, // force: false - debug screenshot
			);
			if (finalPath) {
				console.log(`\n📸 Final screenshot saved: ${finalPath}`);
			}
		} catch (err) {
			console.warn(`⚠️  Could not take final screenshot: ${err}`);
		}

		browser.disconnect();

		// Stop AdsPower profile
		if (profileConfig.adsPowerProfileId) {
			try {
				await stopAdsPowerProfile(profileConfig.adsPowerProfileId);
				console.log("✅ AdsPower profile stopped");
			} catch (e) {
				console.warn(`⚠️  Could not stop AdsPower profile: ${e}`);
			}
		}
	}

	// Print summary
	console.log(`\n📊 Batch Complete - Summary:`);
	const sent = results.filter((r) => r.success).length;
	const failed = results.filter((r) => !r.success && !r.skipped).length;
	const skipped = results.filter((r) => r.skipped).length;

	console.log(`   ✅ Sent: ${sent}`);
	console.log(`   ❌ Failed: ${failed}`);
	console.log(`   ⏭️  Skipped: ${skipped}`);
	console.log(`   📝 Total: ${results.length}`);

	if (failed > 0) {
		console.log(`\n❌ Failed users:`);
		results
			.filter((r) => !r.success && !r.skipped)
			.forEach((r) =>
				console.log(`   - @${r.username}: ${r.error || "Unknown error"}`),
			);
	}

	return results;
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs() {
	const args = process.argv.slice(2);

	let usernames: string[] = [];
	let profileId = "test-account";
	let confirm = false;
	let force = false;
	let delayRange: [number, number] | undefined;
	let maxDms: number | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--users" && args[i + 1]) {
			usernames = args[i + 1]
				.split(",")
				.map((u) => u.trim())
				.filter(Boolean);
			i++;
		} else if (arg === "--file" && args[i + 1]) {
			const filePath = args[i + 1];
			try {
				const content = readFileSync(filePath, "utf-8");
				usernames = content
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line && !line.startsWith("#"));
			} catch (err) {
				console.error(`❌ Could not read file: ${filePath}`);
				process.exit(1);
			}
			i++;
		} else if (arg === "--profile" && args[i + 1]) {
			profileId = args[i + 1];
			i++;
		} else if (arg === "--confirm" || arg === "--yes" || arg === "-y") {
			confirm = true;
		} else if (arg === "--force" || arg === "-f") {
			force = true;
		} else if (arg === "--delay" && args[i + 1]) {
			const delay = parseInt(args[i + 1], 10);
			delayRange = [delay, delay + 10];
			i++;
		} else if (arg === "--max" && args[i + 1]) {
			maxDms = parseInt(args[i + 1], 10);
			i++;
		}
	}

	return { usernames, profileId, confirm, force, delayRange, maxDms };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
	const { usernames, profileId, confirm, force, delayRange, maxDms } =
		parseArgs();

	// Validate inputs
	if (usernames.length === 0) {
		console.error("❌ No usernames provided\n");
		console.error("Usage:");
		console.error(
			"  tsx scripts/dm_batch.ts --users 'user1,user2,user3' --profile test-account --confirm",
		);
		console.error(
			"  tsx scripts/dm_batch.ts --file usernames.txt --profile test-account --confirm",
		);
		console.error("\nOptions:");
		console.error("  --users <list>       Comma-separated list of usernames");
		console.error("  --file <path>        File with one username per line");
		console.error(
			"  --profile <id>       Profile to use (default: test-account)",
		);
		console.error(
			"  --confirm            Actually send messages (dry-run without)",
		);
		console.error(
			"  --force              Skip database check for already-sent DMs",
		);
		console.error(
			"  --delay <seconds>    Custom delay between DMs (default: 10-30s)",
		);
		console.error("  --max <number>       Maximum DMs to send (safety limit)");
		process.exit(1);
	}

	await dmBatch({
		usernames,
		profileId,
		dryRun: !confirm,
		force,
		delayRange,
		maxDms,
	});
}

main().catch(console.error);
