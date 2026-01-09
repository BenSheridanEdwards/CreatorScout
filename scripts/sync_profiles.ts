/**
 * Sync Profiles Script
 *
 * Syncs profiles from profiles.config.json to the database.
 * This bridges the gap between file-based config and the database-backed scheduler.
 *
 * Usage:
 *   tsx scripts/sync_profiles.ts              # Sync all profiles
 *   tsx scripts/sync_profiles.ts --dry-run    # Preview changes without applying
 *   tsx scripts/sync_profiles.ts --force      # Update even if profile exists
 *
 * What it does:
 *   - Creates new profiles in DB if they don't exist
 *   - Updates existing profiles if --force is used
 *   - Preserves daily counters (followsToday, dmsToday, etc.)
 *   - Reports what was synced
 */

import { getPrismaClient } from "../functions/shared/database/database.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import {
	loadProfilesConfig,
	type ProfileConfig as FileProfileConfig,
} from "../functions/shared/profiles/profileLoader.ts";

const logger = createLogger();

interface SyncResult {
	created: string[];
	updated: string[];
	skipped: string[];
	errors: Array<{ id: string; error: string }>;
}

async function syncProfiles(options: {
	dryRun: boolean;
	force: boolean;
}): Promise<SyncResult> {
	const { dryRun, force } = options;
	const result: SyncResult = {
		created: [],
		updated: [],
		skipped: [],
		errors: [],
	};

	// Load profiles from config file
	logger.info("SYNC", "Loading profiles from profiles.config.json...");
	let configProfiles: FileProfileConfig[];

	try {
		const config = loadProfilesConfig();
		configProfiles = config.profiles;
		logger.info("SYNC", `Found ${configProfiles.length} profile(s) in config`);
	} catch (error) {
		logger.error(
			"SYNC",
			`Failed to load config: ${error instanceof Error ? error.message : error}`,
		);
		throw error;
	}

	const prisma = getPrismaClient();

	for (const profile of configProfiles) {
		try {
			// Check if profile exists in database
			const existing = await prisma.instagramProfile.findFirst({
				where: {
					OR: [
						{ id: profile.id },
						{ username: profile.username },
						{ adsPowerProfileId: profile.adsPowerProfileId },
					],
				},
			});

			if (existing) {
				if (force) {
					// Update existing profile
					if (dryRun) {
						logger.info(
							"SYNC",
							`[DRY RUN] Would update: ${profile.id} (@${profile.username})`,
						);
					} else {
						await prisma.instagramProfile.update({
							where: { id: existing.id },
							data: {
								username: profile.username,
								password: profile.password,
								type: profile.type,
								adsPowerProfileId: profile.adsPowerProfileId,
								proxyConfig: profile.proxyConfig || null,
								maxFollowsPerDay: profile.limits.followsPerDay,
								maxDmsPerDay: profile.limits.dmsPerDay,
								maxDiscoveriesPerDay: profile.limits.discoveriesPerDay,
								// Don't reset counters - preserve daily progress
							},
						});
						logger.info(
							"SYNC",
							`✓ Updated: ${profile.id} (@${profile.username})`,
						);
					}
					result.updated.push(profile.id);
				} else {
					logger.info(
						"SYNC",
						`⊘ Skipped (exists): ${profile.id} (@${profile.username}) - use --force to update`,
					);
					result.skipped.push(profile.id);
				}
			} else {
				// Create new profile
				if (dryRun) {
					logger.info(
						"SYNC",
						`[DRY RUN] Would create: ${profile.id} (@${profile.username})`,
					);
				} else {
					await prisma.instagramProfile.create({
						data: {
							id: profile.id,
							username: profile.username,
							password: profile.password,
							type: profile.type,
							adsPowerProfileId: profile.adsPowerProfileId,
							proxyConfig: profile.proxyConfig || null,
							maxFollowsPerDay: profile.limits.followsPerDay,
							maxDmsPerDay: profile.limits.dmsPerDay,
							maxDiscoveriesPerDay: profile.limits.discoveriesPerDay,
							// Counters default to 0 in schema
						},
					});
					logger.info(
						"SYNC",
						`✓ Created: ${profile.id} (@${profile.username})`,
					);
				}
				result.created.push(profile.id);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error("SYNC", `✗ Error with ${profile.id}: ${errorMessage}`);
			result.errors.push({ id: profile.id, error: errorMessage });
		}
	}

	return result;
}

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const force = args.includes("--force");

	console.log("═══════════════════════════════════════════════════════════");
	console.log("  Profile Sync: profiles.config.json → Database");
	console.log("═══════════════════════════════════════════════════════════");
	console.log("");

	if (dryRun) {
		console.log("🔍 DRY RUN MODE - No changes will be made\n");
	}
	if (force) {
		console.log("⚡ FORCE MODE - Existing profiles will be updated\n");
	}

	try {
		const result = await syncProfiles({ dryRun, force });

		console.log("");
		console.log("═══════════════════════════════════════════════════════════");
		console.log("  Summary");
		console.log("═══════════════════════════════════════════════════════════");
		console.log(`  Created:  ${result.created.length}`);
		console.log(`  Updated:  ${result.updated.length}`);
		console.log(`  Skipped:  ${result.skipped.length}`);
		console.log(`  Errors:   ${result.errors.length}`);
		console.log("");

		if (result.created.length > 0) {
			console.log("  Created profiles:");
			result.created.forEach((id) => console.log(`    + ${id}`));
		}
		if (result.updated.length > 0) {
			console.log("  Updated profiles:");
			result.updated.forEach((id) => console.log(`    ~ ${id}`));
		}
		if (result.skipped.length > 0) {
			console.log("  Skipped profiles:");
			result.skipped.forEach((id) => console.log(`    - ${id}`));
		}
		if (result.errors.length > 0) {
			console.log("  Errors:");
			result.errors.forEach(({ id, error }) =>
				console.log(`    ✗ ${id}: ${error}`),
			);
		}

		console.log("");

		if (dryRun && (result.created.length > 0 || result.updated.length > 0)) {
			console.log("💡 Run without --dry-run to apply changes");
		}

		if (result.errors.length > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error(
			"❌ Sync failed:",
			error instanceof Error ? error.message : error,
		);
		process.exit(1);
	}
}

main();
