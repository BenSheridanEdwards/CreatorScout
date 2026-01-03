/**
 * Test DM Variation System
 *
 * Usage:
 *   tsx scripts/test_dm_variation.ts
 *   tsx scripts/test_dm_variation.ts --count 5
 *   tsx scripts/test_dm_variation.ts --strategy cold
 *   tsx scripts/test_dm_variation.ts --batch 20
 */

import {
	generateDMBatch,
	getDMStats,
	testDMGeneration,
} from "../functions/profile/dmVariation/dmVariation.ts";

function parseArgs(): {
	count: number;
	strategy: "cold" | "warm" | "pitch";
	batch?: number;
} {
	const args = process.argv.slice(2);
	let count = 10;
	let strategy: "cold" | "warm" | "pitch" = "cold";
	let batch: number | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--count" && args[i + 1]) {
			count = parseInt(args[i + 1], 10);
		}
		if (args[i] === "--strategy" && args[i + 1]) {
			strategy = args[i + 1] as "cold" | "warm" | "pitch";
		}
		if (args[i] === "--batch" && args[i + 1]) {
			batch = parseInt(args[i + 1], 10);
		}
	}

	return { count, strategy, batch };
}

async function main() {
	const { count, strategy, batch } = parseArgs();

	console.log("\n🎯 DM Variation System Test\n");

	// Show stats
	const stats = getDMStats();
	console.log("📊 Database Stats:");
	console.log(`   Total lines: ${stats.totalLines}`);
	console.log(`   Possible combinations: ${stats.possibleCombinations}`);
	console.log("");

	if (batch) {
		// Generate batch
		console.log(`📦 Generating batch of ${batch} ${strategy} DMs...\n`);
		const dms = generateDMBatch(batch, strategy);
		dms.forEach((dm, i) => {
			console.log(`${i + 1}. ${dm}`);
		});
	} else {
		// Run full test
		testDMGeneration(count);
	}

	console.log("\n✅ Test complete!\n");
}

main();
