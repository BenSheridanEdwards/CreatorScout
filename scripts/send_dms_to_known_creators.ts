import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { ensureLoggedIn } from "../functions/navigation/profileNavigation/profileNavigation.ts";
import { createLogger } from "../functions/shared/logger/logger.ts";
import {
	detectIfOnInstagramLogin,
	waitForInstagramContent,
} from "../functions/shared/waitForContent/waitForContent.ts";
import { getConfirmedCreatorsNotDmBefore } from "../functions/shared/database/database.ts";
import { sendDMToUser } from "../functions/profile/profileActions/profileActions.ts";

const logger = createLogger(process.env.DEBUG_LOGS === "true");

/**
 * Script to fetch confirmed creators from the database,
 * who haven't been DM'd,
 * and message them sequentially
 */
export async function sendDmsToKnownCreators(): Promise<void> {
	logger.info(
		"ACTION",
		"Starting to send DMs to known creators that haven't been messaged yet",
	);

	// Create browser instance
	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	// Navigate & verify Instagram login page has loaded successfully

	try {
		logger.info("NAVIGATION", "📱 Navigating to Instagram...");

		// Navigate directly to see what's there
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle0",
			timeout: 30000,
		});

		// Wait for page to load
		await waitForInstagramContent(page, 30000);

		// Check if we're on the login page
		await detectIfOnInstagramLogin(page);

		// Login via username/password or cookies
		await ensureLoggedIn(page, logger);

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
