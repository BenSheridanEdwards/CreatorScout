import dotenv from "dotenv";

// Load env first so config picks up LOCAL_BROWSER/BROWSERLESS_TOKEN
dotenv.config();

const hasBrowserless = Boolean(process.env.BROWSERLESS_TOKEN);
// Prefer Browserless when token is present; otherwise force local headful
// if (!hasBrowserless) {
// 	process.env.LOCAL_BROWSER = "true";
// }

// Log which browser we're using
const usingLocalBrowser = process.env.LOCAL_BROWSER === "true";
console.log(
	`🌐 Using ${usingLocalBrowser ? "LOCAL BROWSER" : "BROWSERLESS"} ${usingLocalBrowser ? "(headful)" : "(headless)"}`,
);

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

	// Headful locally so you can see the window; headless for Browserless
	const browser = await createBrowser({
		headless: usingLocalBrowser ? false : true,
	});

	try {
		const page = await createPage(browser, {
			viewport: { width: 1440, height: 900 },
		});

		// Wait for browser window to be visible before continuing
		if (usingLocalBrowser) {
			console.log("🖥️  Browser window should now be visible on your desktop!");
			console.log("💡  Check ALL desktops/spaces if you don't see it");
			console.log("⏳ Waiting 3 seconds for browser to fully load...");
			await new Promise((resolve) => setTimeout(resolve, 3000));
			console.log("✅ Continuing with login process...");
		}

		await login(
			page,
			{ username, password },
			{
				skipSubmit: true, // fill but don't log in
				// skipCookies: true, // uncomment to skip loading saved cookies
			},
		);
	} finally {
		// Only close browser automatically for headless/browserless mode
		if (!usingLocalBrowser) {
			await browser.close();
		} else {
			console.log(
				"🖥️  Browser window left open for inspection. Press Ctrl+C to exit.",
			);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
