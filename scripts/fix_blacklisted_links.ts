#!/usr/bin/env tsx
/**
 * Fix False Positives with Blacklisted Links
 * 
 * This script finds profiles marked as creators with blacklisted domain links
 * (meta.com, threads.com, facebook.com, etc.) and un-marks them.
 */
import "dotenv/config";
import { getPrismaClient } from "../functions/shared/database/database.js";
import chalk from "chalk";

const BLACKLISTED_DOMAINS = [
	"meta.com",
	"facebook.com",
	"instagram.com",
	"twitter.com",
	"x.com",
	"threads.net",
	"threads.com",
	"linkedin.com",
	"youtube.com",
	"tiktok.com",
	"snapchat.com",
	"imdb.com",
	"wikipedia.org",
	"amazon.com",
	"ebay.com",
	"google.com",
	"spotify.com",
	"apple.com",
];

async function fixBlacklistedLinks() {
	console.log(chalk.blue("🔄 Fixing False Positives with Blacklisted Links"));
	console.log(chalk.gray("━".repeat(60)));
	console.log();

	const prisma = getPrismaClient();

	// Find all profiles marked as creators
	const profiles = await prisma.profile.findMany({
		where: {
			isCreator: true,
			manualOverride: false, // Don't touch manually overridden profiles
		},
		select: {
			username: true,
			confidence: true,
			linkUrl: true,
			bioText: true,
		},
	});

	console.log(chalk.white(`📊 Found ${profiles.length} profiles marked as creators (excluding manual overrides)`));
	console.log();

	const toUnmark: string[] = [];

	for (const profile of profiles) {
		if (!profile.linkUrl) continue;

		const linkLower = profile.linkUrl.toLowerCase();
		const hasBlacklistedDomain = BLACKLISTED_DOMAINS.some((domain) =>
			linkLower.includes(domain),
		);

		if (hasBlacklistedDomain) {
			toUnmark.push(profile.username);
			console.log(
				chalk.yellow(
					`⚠️  @${profile.username} (${profile.confidence}%) - has blacklisted link: ${new URL(profile.linkUrl).hostname}`,
				),
			);
		}
	}

	console.log();
	console.log(chalk.blue("━".repeat(60)));
	console.log(chalk.white(`Found ${toUnmark.length} profiles to unmark`));
	console.log(chalk.blue("━".repeat(60)));
	console.log();

	if (toUnmark.length === 0) {
		console.log(chalk.green("✅ No false positives found! Database is clean."));
		return;
	}

	console.log(chalk.yellow(`Unmarking ${toUnmark.length} profiles...`));
	console.log();

	for (const username of toUnmark) {
		await prisma.profile.update({
			where: { username },
			data: {
				isCreator: false,
				confidence: 0,
			},
		});
		console.log(chalk.gray(`  ✓ Unmarked @${username}`));
	}

	console.log();
	console.log(chalk.green("✅ All false positives corrected!"));
	console.log();
	console.log(chalk.blue("📊 Summary:"));
	console.log(chalk.white(`  Total reviewed: ${profiles.length}`));
	console.log(chalk.yellow(`  Corrected: ${toUnmark.length}`));
	console.log(chalk.green(`  Remaining creators: ${profiles.length - toUnmark.length}`));
}

fixBlacklistedLinks().catch((error) => {
	console.error(chalk.red("Fatal error:"), error);
	process.exit(1);
});

