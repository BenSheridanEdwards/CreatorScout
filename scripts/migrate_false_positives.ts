#!/usr/bin/env tsx
/**
 * Migrate False Positives - Apply New Detection Logic to Existing Profiles
 *
 * This script re-evaluates profiles that were likely false positives:
 * - Profiles marked as creators with confidence < 80%
 * - Applies the new, stricter combined signal logic
 * - Updates database with corrected values
 * - Generates a report of changes
 */
import "dotenv/config";
import chalk from "chalk";
import { calculateScore } from "../functions/profile/bioMatcher/bioMatcher.js";
import { getPrismaClient } from "../functions/shared/database/database.js";

interface ProfileToMigrate {
	username: string;
	bioText: string | null;
	linkUrl: string | null;
	confidence: number;
	isCreator: boolean;
	bioScore: number;
}

async function migrateFalsePositives() {
	console.log(chalk.blue("🔄 Migrating False Positives"));
	console.log(chalk.gray("━".repeat(60)));
	console.log();

	const prisma = getPrismaClient();

	// Find all profiles marked as creators with medium confidence
	// These are most likely to be false positives from the old logic
	console.log(
		chalk.cyan(
			"📋 Finding profiles marked as creators with confidence < 80%...",
		),
	);

	const profiles = await prisma.profile.findMany({
		where: {
			isCreator: true,
			confidence: {
				lt: 80, // Less than 80% confidence
			},
		},
		select: {
			username: true,
			bioText: true,
			linkUrl: true,
			confidence: true,
			isCreator: true,
			bioScore: true,
		},
		orderBy: {
			confidence: "desc",
		},
	});

	console.log(chalk.white(`📊 Found ${profiles.length} profiles to review`));
	console.log();

	if (profiles.length === 0) {
		console.log(chalk.green("✅ No profiles need migration!"));
		return;
	}

	const stats = {
		reviewed: 0,
		corrected: 0,
		unchanged: 0,
		bioOnly: 0,
		linkOnly: 0,
		noSignals: 0,
	};

	const corrections: Array<{
		username: string;
		oldConfidence: number;
		newConfidence: number;
		oldIsCreator: boolean;
		newIsCreator: boolean;
		reason: string;
	}> = [];

	console.log(chalk.blue("🔍 Reviewing profiles with new logic...\n"));

	for (const profile of profiles) {
		stats.reviewed++;
		const progress = `[${stats.reviewed}/${profiles.length}]`;

		console.log(chalk.blue(`${progress} @${profile.username}`));
		console.log(
			chalk.gray(
				`   Current: ${profile.isCreator ? "✅" : "❌"} ${profile.confidence}% confidence`,
			),
		);

		// Re-calculate bio score with new logic
		const bioScore = profile.bioText
			? calculateScore(profile.bioText, profile.username).score
			: 0;

		// Estimate link confidence from old total confidence and bio score
		// oldConfidence ≈ max(bioScore, linkConfidence)
		const estimatedLinkConfidence = Math.max(0, profile.confidence - bioScore);

		// Apply new combined signal logic
		let newConfidence = profile.confidence;
		let newIsCreator = profile.isCreator;
		let reason = "unchanged";

		// Check if bio has definitive signals (100% triggers)
		const bio = profile.bioText?.toLowerCase() || "";
		const hasDefinitiveBioSignal =
			bio.includes("patreon") ||
			bio.includes("ko-fi") ||
			bio.includes("link in bio") ||
			bio.includes("linktree");

		if (hasDefinitiveBioSignal) {
			// Keep as creator - definitive signal
			reason = "definitive_bio_signal";
			console.log(chalk.green("   ✅ Has definitive bio signal - keeping"));
		} else if (bioScore >= 60) {
			// Strong bio score alone is enough
			reason = "strong_bio_score";
			console.log(
				chalk.green(`   ✅ Strong bio score (${bioScore}) - keeping`),
			);
		} else if (estimatedLinkConfidence >= 70) {
			// Strong link confidence (probably had platform icons)
			reason = "strong_link_confidence";
			console.log(
				chalk.green(
					`   ✅ Strong link confidence (~${estimatedLinkConfidence}%) - keeping`,
				),
			);
		} else if (estimatedLinkConfidence < 50 && bioScore < 40) {
			// BOTH weak signals = FALSE POSITIVE
			newIsCreator = false;
			newConfidence = Math.min(newConfidence, 35);
			reason = "weak_combined_signals";
			stats.corrected++;

			console.log(chalk.yellow("   ⚠️  CORRECTING: Weak combined signals"));
			console.log(
				chalk.gray(
					`      Link: ~${estimatedLinkConfidence}% + Bio: ${bioScore} = Not enough evidence`,
				),
			);

			corrections.push({
				username: profile.username,
				oldConfidence: profile.confidence,
				newConfidence,
				oldIsCreator: profile.isCreator,
				newIsCreator,
				reason:
					"Both link and bio signals too weak (likely fitness/gaming/art creator)",
			});
		} else if (bioScore + estimatedLinkConfidence < 90) {
			// Medium signals but combined not strong enough
			newIsCreator = false;
			newConfidence = Math.min(newConfidence, 45);
			reason = "medium_combined_insufficient";
			stats.corrected++;

			console.log(
				chalk.yellow("   ⚠️  CORRECTING: Medium signals insufficient"),
			);
			console.log(
				chalk.gray(
					`      Link: ~${estimatedLinkConfidence}% + Bio: ${bioScore} = ${bioScore + estimatedLinkConfidence} < 90 threshold`,
				),
			);

			corrections.push({
				username: profile.username,
				oldConfidence: profile.confidence,
				newConfidence,
				oldIsCreator: profile.isCreator,
				newIsCreator,
				reason:
					"Combined signals below threshold (likely generic content creator)",
			});
		} else {
			// Passes new logic - keep as creator
			reason = "passes_new_logic";
			stats.unchanged++;
			console.log(chalk.green("   ✅ Passes new combined signal logic"));
		}

		// Update database if changed
		if (
			newIsCreator !== profile.isCreator ||
			newConfidence !== profile.confidence
		) {
			await prisma.profile.update({
				where: { username: profile.username },
				data: {
					isCreator: newIsCreator,
					confidence: newConfidence,
				},
			});
		}

		console.log();
	}

	// Print summary
	console.log(chalk.blue("━".repeat(60)));
	console.log(chalk.blue.bold("📊 Migration Summary"));
	console.log(chalk.blue("━".repeat(60)));
	console.log(chalk.white(`✅ Profiles reviewed: ${stats.reviewed}`));
	console.log(
		chalk.yellow(`⚠️  Corrected (unmarked as creators): ${stats.corrected}`),
	);
	console.log(chalk.green(`✓  Unchanged (still creators): ${stats.unchanged}`));
	console.log();

	if (corrections.length > 0) {
		console.log(chalk.yellow("📋 Corrected Profiles:"));
		console.log();

		for (const correction of corrections) {
			console.log(chalk.white(`@${correction.username}`));
			console.log(
				chalk.gray(
					`  Before: ${correction.oldIsCreator ? "✅" : "❌"} ${correction.oldConfidence}%`,
				),
			);
			console.log(
				chalk.gray(
					`  After:  ${correction.newIsCreator ? "✅" : "❌"} ${correction.newConfidence}%`,
				),
			);
			console.log(chalk.gray(`  Reason: ${correction.reason}`));
			console.log();
		}

		// Save report
		const reportPath = `migration_report_${Date.now()}.json`;
		const reportData = {
			timestamp: new Date().toISOString(),
			summary: stats,
			corrections,
		};

		await import("fs/promises").then((fs) =>
			fs.writeFile(reportPath, JSON.stringify(reportData, null, 2)),
		);

		console.log(chalk.gray(`📄 Full report saved to: ${reportPath}`));
	}

	console.log();
	console.log(chalk.green("✅ Migration complete!"));
	console.log();
	console.log(
		chalk.cyan(
			"💡 TIP: Run 'npm run reanalyze' to do a full re-analysis with screenshots",
		),
	);
}

migrateFalsePositives().catch((error) => {
	console.error(chalk.red("Fatal error:"), error);
	process.exit(1);
});
