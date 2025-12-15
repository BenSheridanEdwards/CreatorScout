import dotenv from "dotenv";

// Load env first so config picks up LOCAL_BROWSER/BROWSERLESS_TOKEN
dotenv.config();

// Force local browser for discovery mode so user can see what's happening
process.env.LOCAL_BROWSER = "true";

const hasBrowserless = Boolean(process.env.BROWSERLESS_TOKEN);

// Log which browser we're using
const usingLocalBrowser = process.env.LOCAL_BROWSER === "true";
console.log(`🔍 Scout - Instagram Creator Discovery Agent`);
console.log(
	`🌐 Using ${usingLocalBrowser ? "LOCAL BROWSER" : "BROWSERLESS"} ${usingLocalBrowser ? "(headful)" : "(headless)"}`,
);

// Dynamic imports so config reads the env we just set
const { scrapeWithoutDM } = await import("./scrape.ts");

// Check if inspect mode is enabled
const inspectMode = process.env.INSPECT_MODE === "true";

async function main() {
	console.log("🚀 Starting Instagram Creator Discovery...");
	console.log("📋 This will:");
	console.log("   • Load seed profiles from seeds.txt");
	console.log("   • Analyze bios for influencer indicators");
	console.log("   • 🔗 CLICK links in bios and analyze with AI vision");
	console.log("   • 👥 Follow confirmed creators");
	console.log("   • 📊 Show real-time progress and notifications");
	console.log("   • 🔄 Expand network by exploring following lists");
	console.log("❌ This will NOT send DMs (discovery mode)");
	console.log("");
	console.log("🔔 You'll see system notifications when:");
	console.log("   • Links are clicked and analyzed");
	console.log("   • Creators are discovered");
	console.log("   • Profiles are followed");
	console.log("");

	// Start the discovery process
	await scrapeWithoutDM(
		process.argv.includes("--debug") || process.argv.includes("-d"),
	);
}

main().catch((err) => {
	console.error("💥 Discovery failed:", err);
	process.exit(1);
});
