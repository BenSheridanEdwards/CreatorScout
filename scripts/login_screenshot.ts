import dotenv from "dotenv";

// Load env first so config picks up LOCAL_BROWSER/BROWSERLESS_TOKEN
dotenv.config();

// Enable logging for this script
process.env.DEBUG_LOGS = "true";

const hasBrowserless = Boolean(process.env.BROWSERLESS_TOKEN);
// Prefer Browserless when token is present; otherwise force local headful
if (!hasBrowserless) {
	process.env.LOCAL_BROWSER = "true";
}

// Dynamic imports so config reads the env we just set
const { createBrowser, createPage } = await import(
	"../functions/navigation/browser/browser.ts"
);
const { login } = await import("../functions/auth/login/login.ts");
const { IG_USER, IG_PASS } = await import(
	"../functions/shared/config/config.ts"
);

async function main() {
	const username = IG_USER || process.env.INSTAGRAM_USERNAME;
	const password = IG_PASS || process.env.INSTAGRAM_PASSWORD;
	if (!username || !password) {
		throw new Error(
			"INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env",
		);
	}

	// Headful locally so you can see the window; headless flag ignored for Browserless connect
	const browser = await createBrowser({
		headless: hasBrowserless ? true : false,
	});

	try {
		const page = await createPage(browser, {
			viewport: { width: 1440, height: 900 },
		});

		await login(
			page,
			{ username, password },
			{
				skipSubmit: true, // fill but don't log in
			},
		);
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
