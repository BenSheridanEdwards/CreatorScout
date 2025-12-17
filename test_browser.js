import puppeteer from "puppeteer";

async function test() {
	console.log("🚀 Launching browser...");
	const browser = await puppeteer.launch({
		headless: false,
		args: ["--start-maximized", "--new-window"],
	});
	const page = await browser.newPage();
	await page.goto("https://www.google.com");
	console.log("✅ Browser should be visible now!");
	console.log("Press Ctrl+C to exit");
}

test();



