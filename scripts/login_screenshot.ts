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
const { initializeInstagramSession } = await import(
	"../functions/auth/sessionInitializer/sessionInitializer.ts"
);
const { IG_USER, IG_PASS } = await import(
	"../functions/shared/config/config.ts"
);

// Check if inspect mode is enabled
const inspectMode = process.env.INSPECT_MODE === "true";

async function main() {
	const username = IG_USER || process.env.INSTAGRAM_USERNAME;
	const password = IG_PASS || process.env.INSTAGRAM_PASSWORD;
	if (!username || !password) {
		throw new Error(
			"INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD must be set in .env",
		);
	}

	// Headful locally so you can see the window; headless for Browserless
	const { browser } = await initializeInstagramSession({
		headless: usingLocalBrowser ? false : true,
		viewport: { width: 1440, height: 900 },
		debug: true,
		credentials: { username, password },
		loginOptions: {
			skipSubmit: true, // fill but don't log in
		},
	});

	try {
		// Wait for browser window to be visible before continuing
		if (usingLocalBrowser) {
			console.log("🖥️  Browser window should now be visible on your desktop!");
			console.log("💡  Check ALL desktops/spaces if you don't see it");
			console.log("✅ Login process completed");
		}
	} finally {
		// Close browser automatically for headless/browserless mode, or when inspect mode is disabled
		if (!usingLocalBrowser || !inspectMode) {
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
