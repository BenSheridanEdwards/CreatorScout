#!/usr/bin/env tsx
/**
 * Re-analyze Visited Profiles
 *
 * This script re-visits all previously visited profiles and re-analyzes them
 * to check for Influencer indicators. Useful for:
 * - Catching profiles that were visited before link analysis was implemented
 * - Re-checking profiles with updated analysis logic
 * - Auditing the database for missed creators
 */

// Set SKIP_VISION before any imports if flag is present
if (process.argv.includes("--skip-vision")) {
	process.env.SKIP_VISION = "true";
}

import "dotenv/config";
import chalk from "chalk";
import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.js";
import { navigateToProfile } from "../functions/navigation/profileNavigation/profileNavigation.js";
import { analyzeProfileComprehensive } from "../functions/profile/profileAnalysis/profileAnalysis.js";
import { getPrismaClient } from "../functions/shared/database/database.js";
import { getProfile } from "../functions/shared/profiles/profileLoader.js";
import {
	markRunComplete,
	setupGracefulShutdown,
} from "../functions/shared/runs/gracefulShutdown.js";
import {
	addCreatorToRun,
	addErrorToRun,
	setCurrentRunId,
	updateRun,
} from "../functions/shared/runs/runs.js";

interface ProfileRecord {
	username: string;
	display_name: string | null;
	is_creator: boolean;
	confidence: number;
	visited_at: Date;
}

async function getVisitedProfiles(): Promise<ProfileRecord[]> {
	const prisma = getPrismaClient();
	const profiles = await prisma.profile.findMany({
		where: {
			username: {
				not: {
					startsWith: "testuser",
				},
			},
		},
		select: {
			username: true,
			displayName: true,
			isCreator: true,
			confidence: true,
			visitedAt: true,
		},
		orderBy: {
			visitedAt: "desc",
		},
	});
	return profiles.map((p) => ({
		username: p.username,
		display_name: p.displayName,
		is_creator: p.isCreator,
		confidence: p.confidence,
		visited_at: p.visitedAt,
	}));
}

async function reanalyzeProfiles() {
	console.log(chalk.blue("🔄 Re-analyzing Visited Profiles"));
	console.log(chalk.gray("━".repeat(60)));

	// Get profile info
	const args = process.argv.slice(2);
	let profileId = "test-account";
	const profileIdx = args.findIndex((a) => a === "--profile");
	if (profileIdx !== -1 && args[profileIdx + 1]) {
		profileId = args[profileIdx + 1];
	}

	const profile = getProfile(profileId);
	if (!profile) {
		console.error(chalk.red(`❌ Profile '${profileId}' not found`));
		process.exit(1);
	}
	console.log(chalk.cyan(`📋 Using profile: @${profile.username}`));
	console.log(chalk.cyan(`🌐 AdsPower ID: ${profile.adsPowerProfileId}`));
	console.log();

	// Parse options
	const limit = args.includes("--limit")
		? parseInt(args[args.findIndex((a) => a === "--limit") + 1] || "10", 10)
		: undefined;
	const skipConfirmed = args.includes("--skip-confirmed");
	const onlyLowConfidence = args.includes("--low-confidence");
	const skipVision = args.includes("--skip-vision");

	// Set vision flag if requested
	if (skipVision) {
		process.env.SKIP_VISION = "true";
		console.log(chalk.yellow("👁️  Vision analysis disabled"));
	}

	// Get profiles to analyze
	let profiles = await getVisitedProfiles();
	console.log(chalk.white(`📊 Found ${profiles.length} visited profiles`));

	// Apply filters
	if (skipConfirmed) {
		profiles = profiles.filter((p) => !p.is_creator);
		console.log(
			chalk.gray(`   Filtered to ${profiles.length} unconfirmed profiles`),
		);
	}

	if (onlyLowConfidence) {
		profiles = profiles.filter((p) => p.confidence < 70);
		console.log(
			chalk.gray(
				`   Filtered to ${profiles.length} low-confidence profiles (<70%)`,
			),
		);
	}

	if (limit) {
		profiles = profiles.slice(0, limit);
		console.log(chalk.gray(`   Limited to ${limit} profiles`));
	}

	console.log();

	// Set run ID if provided by server
	const runId = process.env.SCOUT_RUN_ID;
	if (runId) {
		setCurrentRunId(runId);
		setupGracefulShutdown(); // Register shutdown handlers
		console.log(chalk.gray(`📊 Run ID: ${runId}`));
	}

	// Initialize browser session
	console.log(chalk.blue("🚀 Initializing browser session..."));
	const { browser, page } = await initializeInstagramSession({
		headless: false,
		adsPowerProfileId: profile.adsPowerProfileId,
		credentials: {
			username: profile.username,
			password: profile.password,
		},
	});

	const stats = {
		processed: 0,
		newCreators: 0,
		confidenceIncreased: 0,
		errors: 0,
	};

	try {
		for (let i = 0; i < profiles.length; i++) {
			const profile = profiles[i];
			const progress = `[${i + 1}/${profiles.length}]`;

			console.log(chalk.blue(`\n${progress} Analyzing @${profile.username}`));
			console.log(
				chalk.gray(
					`   Previous: ${profile.is_creator ? "✅" : "❌"} ${profile.confidence}% confidence`,
				),
			);

			try {
				// Navigate to profile
				await navigateToProfile(page, profile.username, "search");

				// Run comprehensive analysis (automatically saves to database)
				const analysis = await analyzeProfileComprehensive(
					page,
					profile.username,
				);

				// Track stats
				stats.processed++;

				const wasCreator = profile.is_creator;
				const isCreator = analysis.isCreator;
				const confidenceChanged = analysis.confidence !== profile.confidence;

				// Log bio text if available
				if (analysis.bio) {
					console.log(chalk.cyan(`   📝 Bio: "${analysis.bio}"`));
				} else {
					console.log(chalk.gray(`   📝 Bio: (none found)`));
				}

				// Log external links if found
				if (analysis.links && analysis.links.length > 0) {
					console.log(chalk.cyan(`   🔗 Links: ${analysis.links.join(", ")}`));
				}

				// Log indicators (what matched/triggered the analysis)
				if (analysis.indicators && analysis.indicators.length > 0) {
					console.log(chalk.yellow(`   💡 Indicators:`));
					analysis.indicators.forEach((indicator) => {
						console.log(chalk.yellow(`      • ${indicator}`));
					});
				}

				// Log reason for classification
				if (analysis.reason) {
					console.log(chalk.blue(`   🎯 Reason: ${analysis.reason}`));
				}

				if (!wasCreator && isCreator) {
					stats.newCreators++;
					console.log(
						chalk.green(
							`   ✨ NEW CREATOR FOUND! ${analysis.confidence}% confidence`,
						),
					);

					// Log creator to run
					if (runId) {
						await addCreatorToRun(runId, {
							username: profile.username,
							confidence: analysis.confidence,
							reason: analysis.reason || "profile_analysis",
							timestamp: new Date().toISOString(),
							screenshotPath: analysis.screenshotPath,
						});
					}
				} else if (
					confidenceChanged &&
					analysis.confidence > profile.confidence
				) {
					stats.confidenceIncreased++;
					console.log(
						chalk.yellow(
							`   ⬆️  Confidence increased: ${profile.confidence}% → ${analysis.confidence}%`,
						),
					);
				} else {
					console.log(
						chalk.gray(
							`   Result: ${isCreator ? "✅" : "❌"} ${analysis.confidence}% confidence`,
						),
					);
				}

				// Update run progress
				if (runId) {
					await updateRun(runId, {
						profilesProcessed: stats.processed,
						creatorsFound: stats.newCreators,
						errors: stats.errors,
					});
				}

				// Delay between profiles (Instagram rate limiting)
				if (i < profiles.length - 1) {
					const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5s
					console.log(
						chalk.gray(`   ⏳ Waiting ${(delay / 1000).toFixed(1)}s...`),
					);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			} catch (error) {
				stats.errors++;

				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const errorStack = error instanceof Error ? error.stack : undefined;

				// Log error to run
				if (runId) {
					await addErrorToRun(runId, {
						timestamp: new Date().toISOString(),
						username: profile.username,
						message: errorMessage,
						stack: errorStack,
					});
				}

				console.error(
					chalk.red(
						`   ❌ Error analyzing @${profile.username}: ${errorMessage}`,
					),
				);
			}
		}
	} finally {
		if (browser) {
			await browser.close();
		}
	}

	// Print summary
	console.log();
	console.log(chalk.blue("━".repeat(60)));
	console.log(chalk.blue.bold("📊 Re-analysis Complete"));
	console.log(chalk.blue("━".repeat(60)));
	console.log(
		chalk.white(`✅ Processed: ${stats.processed}/${profiles.length}`),
	);
	console.log(chalk.green(`✨ New creators found: ${stats.newCreators}`));
	console.log(
		chalk.yellow(`⬆️  Confidence increased: ${stats.confidenceIncreased}`),
	);
	console.log(chalk.red(`❌ Errors: ${stats.errors}`));
	console.log();

	// Mark run as complete
	if (runId) {
		const finalStatus =
			stats.errors > profiles.length / 2 ? "error" : "completed";
		await updateRun(runId, {
			status: finalStatus,
			profilesProcessed: stats.processed,
			creatorsFound: stats.newCreators,
			errors: stats.errors,
		});
		console.log(chalk.gray(`📊 Run marked as ${finalStatus}`));
	}
}

// Run
reanalyzeProfiles().catch((error) => {
	console.error(chalk.red("Fatal error:"), error);
	process.exit(1);
});
