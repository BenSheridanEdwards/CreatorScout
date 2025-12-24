#!/usr/bin/env tsx
/**
 * Manual Override Script
 *
 * Allows manual classification of profiles when automated detection is wrong.
 * Manual overrides ALWAYS take precedence over automated detection.
 *
 * Usage:
 *   tsx scripts/manual_override.ts mark-creator <username> "<reason>"
 *   tsx scripts/manual_override.ts mark-not-creator <username> "<reason>"
 *   tsx scripts/manual_override.ts clear <username>
 *   tsx scripts/manual_override.ts list
 *
 * Examples:
 *   tsx scripts/manual_override.ts mark-creator sophiie_xdt "Confirmed via manual review"
 *   tsx scripts/manual_override.ts mark-not-creator thebiggerbodycoach "Fitness coach, not influencer"
 *   tsx scripts/manual_override.ts clear username
 *   tsx scripts/manual_override.ts list
 */
import "dotenv/config";
import { getPrismaClient } from "../functions/shared/database/database.js";
import chalk from "chalk";

async function manualOverride() {
	const args = process.argv.slice(2);
	const command = args[0];
	const username = args[1];
	const reason = args[2];

	const prisma = getPrismaClient();

	if (command === "list") {
		// List all manually overridden profiles
		console.log(chalk.blue("📋 Manually Overridden Profiles"));
		console.log(chalk.gray("━".repeat(60)));
		console.log();

		const profiles = await prisma.profile.findMany({
			where: {
				manualOverride: true,
			},
			select: {
				username: true,
				isCreator: true,
				confidence: true,
				manuallyMarkedCreator: true,
				manualOverrideReason: true,
				manualOverrideAt: true,
			},
			orderBy: {
				manualOverrideAt: "desc",
			},
		});

		if (profiles.length === 0) {
			console.log(chalk.gray("No manual overrides found."));
			return;
		}

		for (const profile of profiles) {
			const mark = profile.manuallyMarkedCreator ? "✅" : "❌";
			const autoMark = profile.isCreator ? "✅" : "❌";

			console.log(chalk.white(`@${profile.username}`));
			console.log(
				chalk.gray(
					`  Manual: ${mark} ${profile.manuallyMarkedCreator ? "CREATOR" : "NOT CREATOR"}`,
				),
			);
			console.log(chalk.gray(`  Auto: ${autoMark} ${profile.confidence}%`));
			console.log(
				chalk.gray(`  Reason: ${profile.manualOverrideReason || "N/A"}`),
			);
			console.log(
				chalk.gray(
					`  Override at: ${profile.manualOverrideAt ? new Date(profile.manualOverrideAt).toLocaleString() : "N/A"}`,
				),
			);
			console.log();
		}

		console.log(chalk.white(`Total: ${profiles.length} manual overrides`));
		return;
	}

	if (!username) {
		console.error(chalk.red("❌ Error: Username required"));
		console.log("\nUsage:");
		console.log(
			'  tsx scripts/manual_override.ts mark-creator <username> "<reason>"',
		);
		console.log(
			'  tsx scripts/manual_override.ts mark-not-creator <username> "<reason>"',
		);
		console.log("  tsx scripts/manual_override.ts clear <username>");
		console.log("  tsx scripts/manual_override.ts list");
		process.exit(1);
	}

	// Check if profile exists
	const profile = await prisma.profile.findUnique({
		where: { username },
		select: {
			username: true,
			isCreator: true,
			confidence: true,
			bioText: true,
			manualOverride: true,
			manuallyMarkedCreator: true,
		},
	});

	if (!profile) {
		console.error(
			chalk.red(`❌ Error: Profile @${username} not found in database`),
		);
		console.log(
			chalk.yellow(
				"💡 The profile must be visited/analyzed before you can override it",
			),
		);
		process.exit(1);
	}

	console.log(chalk.blue(`📝 Manual Override for @${username}`));
	console.log(chalk.gray("━".repeat(60)));
	console.log();

	console.log(chalk.white("Current Status:"));
	console.log(
		chalk.gray(
			`  Automated: ${profile.isCreator ? "✅" : "❌"} ${profile.confidence}%`,
		),
	);
	if (profile.manualOverride) {
		console.log(
			chalk.gray(
				`  Manual: ${profile.manuallyMarkedCreator ? "✅" : "❌"} ${profile.manuallyMarkedCreator ? "CREATOR" : "NOT CREATOR"}`,
			),
		);
	}
	if (profile.bioText) {
		console.log(chalk.gray(`  Bio: ${profile.bioText.substring(0, 100)}...`));
	}
	console.log();

	if (command === "mark-creator") {
		await prisma.profile.update({
			where: { username },
			data: {
				manualOverride: true,
				manuallyMarkedCreator: true,
				manualOverrideReason: reason || "Manually confirmed as creator",
				manualOverrideAt: new Date(),
				// Also update isCreator to match (so it shows up in queries)
				isCreator: true,
			},
		});

		console.log(chalk.green("✅ Marked as CREATOR"));
		console.log(
			chalk.gray(`   Reason: ${reason || "Manually confirmed as creator"}`),
		);
		console.log(
			chalk.gray("   This override will persist even if re-analyzed"),
		);
	} else if (command === "mark-not-creator") {
		await prisma.profile.update({
			where: { username },
			data: {
				manualOverride: true,
				manuallyMarkedCreator: false,
				manualOverrideReason: reason || "Manually confirmed NOT a creator",
				manualOverrideAt: new Date(),
				// Also update isCreator to match
				isCreator: false,
			},
		});

		console.log(chalk.yellow("⚠️  Marked as NOT CREATOR"));
		console.log(
			chalk.gray(`   Reason: ${reason || "Manually confirmed NOT a creator"}`),
		);
		console.log(
			chalk.gray("   This override will persist even if re-analyzed"),
		);
	} else if (command === "clear") {
		await prisma.profile.update({
			where: { username },
			data: {
				manualOverride: false,
				manuallyMarkedCreator: null,
				manualOverrideReason: null,
				manualOverrideAt: null,
			},
		});

		console.log(chalk.blue("🔄 Cleared manual override"));
		console.log(chalk.gray("   Profile will now use automated detection"));
	} else {
		console.error(chalk.red(`❌ Error: Unknown command "${command}"`));
		console.log(
			"\nValid commands: mark-creator, mark-not-creator, clear, list",
		);
		process.exit(1);
	}

	console.log();
	console.log(chalk.cyan(`💡 View profile: https://instagram.com/${username}`));
}

manualOverride().catch((error) => {
	console.error(chalk.red("Fatal error:"), error);
	process.exit(1);
});
