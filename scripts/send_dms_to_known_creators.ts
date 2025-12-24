import { initializeInstagramSession } from "../functions/auth/sessionInitializer/sessionInitializer.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";
import { getConfirmedCreatorsNotDmBefore } from "../functions/shared/database/database.ts";

/**
 * Script to fetch confirmed creators from the database,
 * who haven't been DM'd,
 * and message them sequentially
 */
export async function sendDmsToKnownCreators(): Promise<void> {
	const { browser, page, logger } = await initializeInstagramSession({
		headless: false,
		debug: process.env.DEBUG_LOGS === "true",
	});

	try {
		logger.info(
			"ACTION",
			"Starting to send DMs to known creators that haven't been messaged yet",
		);

		const confirmedCreatorsNotDmBefore =
			await getConfirmedCreatorsNotDmBefore();

		// Send DMs sequentially to avoid rate limiting
		for (const creator of confirmedCreatorsNotDmBefore) {
			try {
				await sendDMToUser(page, creator.username);
				logger.info("ACTION", `✅ DM sent to @${creator.username}`);
			} catch (dmError) {
				logger.error(
					"ERROR",
					`Failed to send DM to @${creator.username}: ${dmError}`,
				);
				// Continue with next creator
			}
		}
	} catch (error) {
		logger.error(
			"ERROR",
			`Error occurred trying to send DMs to fresh known creators: ${error}`,
		);
	} finally {
		await browser.close();
	}
}
