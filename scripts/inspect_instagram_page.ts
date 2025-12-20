/**
 * Diagnostic script to inspect what's actually visible on the Instagram page
 * Helps debug navigation issues by showing what UI elements are available
 */

import {
	createBrowser,
	createPage,
} from "../functions/navigation/browser/browser.ts";
import { snapshot } from "../functions/shared/snapshot/snapshot.ts";
import { waitForInstagramContent } from "../functions/shared/waitForContent/waitForContent.ts";

async function inspectInstagramPage(): Promise<void> {
	console.log("🔍 Starting Instagram page inspection...");

	const browser = await createBrowser({ headless: false });
	const page = await createPage(browser);

	try {
		console.log("📱 Navigating to Instagram...");
		// Navigate directly to see what's there
		await page.goto("https://www.instagram.com/", {
			waitUntil: "networkidle0",
			timeout: 30000,
		});

		console.log("⏳ Waiting for Instagram content to load...");
		// Wait for Instagram-specific content to appear
		const contentLoaded = await waitForInstagramContent(page, 30000);
		if (!contentLoaded) {
			console.log("⚠️  Instagram content did not load within timeout");
		} else {
			console.log("✅ Instagram content detected!");
		}

		// Wait additional time for dynamic content
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Check if we're on a login page
		const isLoginPage = await page.evaluate(() => {
			return (
				window.location.href.includes("/accounts/login") ||
				document.querySelector('input[name="username"]') !== null ||
				document.querySelector('input[type="password"]') !== null ||
				document.body?.innerText?.toLowerCase().includes("log in") ||
				document.body?.innerText?.toLowerCase().includes("sign up")
			);
		});

		if (isLoginPage) {
			console.log("🔐 Detected: This appears to be a LOGIN PAGE");
		}

		// Check for iframes
		const iframeCount = await page.evaluate(() => {
			return document.querySelectorAll("iframe").length;
		});
		if (iframeCount > 0) {
			console.log(
				`📦 Found ${iframeCount} iframe(s) - content might be in iframes`,
			);
		}

		const currentUrl = page.url();
		console.log(`📍 Current URL: ${currentUrl}`);

		// Take a screenshot
		console.log("📸 Taking screenshot...");
		const screenshotPath = await snapshot(page, "instagram_inspection");
		console.log(`✅ Screenshot saved: ${screenshotPath}`);

		// Inspect what's actually on the page
		console.log("\n🔎 Inspecting page elements...\n");

		const pageInfo = await page.evaluate(() => {
			const info: {
				title: string;
				url: string;
				readyState: string;
				bodyExists: boolean;
				bodyHasContent: boolean;
				hasIframes: boolean;
				iframeCount: number;
				isLoginPage: boolean;
				hasHomeIcon: boolean;
				homeSelectors: string[];
				hasNavBar: boolean;
				hasMainContent: boolean;
				hasSearchOrExplore: boolean;
				allLinks: Array<{ href: string; text: string; ariaLabel: string }>;
				allButtons: Array<{ text: string; ariaLabel: string }>;
				allSvgIcons: Array<{ ariaLabel: string; parentTag: string }>;
				allInputs: Array<{ type: string; name: string; placeholder: string }>;
				pageText: string;
				htmlLength: number;
			} = {
				title: document.title,
				url: window.location.href,
				readyState: document.readyState,
				bodyExists: !!document.body,
				bodyHasContent: !!document.body?.innerText?.trim(),
				hasIframes: document.querySelectorAll("iframe").length > 0,
				iframeCount: document.querySelectorAll("iframe").length,
				isLoginPage:
					window.location.href.includes("/accounts/login") ||
					!!document.querySelector('input[name="username"]') ||
					!!document.querySelector('input[type="password"]') ||
					document.body?.innerText?.toLowerCase().includes("log in") ||
					false,
				hasHomeIcon: false,
				homeSelectors: [],
				hasNavBar: false,
				hasMainContent: false,
				hasSearchOrExplore: false,
				allLinks: [],
				allButtons: [],
				allSvgIcons: [],
				allInputs: [],
				pageText: document.body?.innerText?.substring(0, 500) || "",
				htmlLength: document.documentElement.innerHTML.length,
			};

			// Check for home icon/logo
			const homeLink = document.querySelector('a[href="/"]');
			if (homeLink) {
				info.hasHomeIcon = true;
				info.homeSelectors.push('a[href="/"]');
			}

			const homeAriaLabel = document.querySelector('a[aria-label*="Home"]');
			if (homeAriaLabel) {
				info.hasHomeIcon = true;
				info.homeSelectors.push('a[aria-label*="Home"]');
			}

			const homeSvg = Array.from(document.querySelectorAll("svg")).find(
				(svg) => svg.getAttribute("aria-label") === "Home",
			);
			if (homeSvg) {
				info.hasHomeIcon = true;
				info.homeSelectors.push('svg[aria-label="Home"]');
			}

			// Check for nav bar
			info.hasNavBar =
				document.querySelector("nav") !== null ||
				document.querySelector('div[role="navigation"]') !== null;

			// Check for main content
			info.hasMainContent =
				document.querySelector("main") !== null ||
				document.querySelector("article") !== null ||
				document.querySelector('div[role="main"]') !== null;

			// Check for search/explore
			info.hasSearchOrExplore =
				document.querySelector('a[href="/explore/"]') !== null ||
				document.querySelector('input[placeholder*="Search"]') !== null ||
				document.querySelector('input[aria-label*="Search"]') !== null;

			// Get all links
			const links = Array.from(document.querySelectorAll("a"));
			info.allLinks = links
				.slice(0, 50) // Limit to first 50
				.map((link) => ({
					href: link.getAttribute("href") || "",
					text: link.textContent?.trim().substring(0, 50) || "",
					ariaLabel: link.getAttribute("aria-label") || "",
				}))
				.filter((link) => link.href || link.text || link.ariaLabel);

			// Get all buttons
			const buttons = Array.from(document.querySelectorAll("button"));
			info.allButtons = buttons
				.slice(0, 50) // Limit to first 50
				.map((btn) => ({
					text: btn.textContent?.trim().substring(0, 50) || "",
					ariaLabel: btn.getAttribute("aria-label") || "",
				}))
				.filter((btn) => btn.text || btn.ariaLabel);

			// Get all SVG icons with aria-labels
			const svgs = Array.from(document.querySelectorAll("svg"));
			info.allSvgIcons = svgs
				.map((svg) => ({
					ariaLabel: svg.getAttribute("aria-label") || "",
					parentTag: svg.parentElement?.tagName || "",
				}))
				.filter((svg) => svg.ariaLabel);

			// Get all input fields
			const inputs = Array.from(document.querySelectorAll("input"));
			info.allInputs = inputs.map((input) => ({
				type: input.type || "",
				name: input.name || "",
				placeholder: input.placeholder || "",
			}));

			return info;
		});

		// Print results
		console.log("=".repeat(80));
		console.log("📊 PAGE INSPECTION RESULTS");
		console.log("=".repeat(80));
		console.log(`Title: ${pageInfo.title}`);
		console.log(`URL: ${pageInfo.url}`);
		console.log(`Ready State: ${pageInfo.readyState}`);
		console.log(`Body Exists: ${pageInfo.bodyExists}`);
		console.log(`Body Has Content: ${pageInfo.bodyHasContent}`);
		console.log(`HTML Length: ${pageInfo.htmlLength} characters`);
		console.log(
			`Has Iframes: ${pageInfo.hasIframes} (${pageInfo.iframeCount} iframe(s))`,
		);
		console.log(`Is Login Page: ${pageInfo.isLoginPage}`);

		if (!pageInfo.bodyHasContent && pageInfo.htmlLength < 1000) {
			console.log(
				"\n⚠️  WARNING: Page appears to be empty or not fully loaded!",
			);
			console.log("   This could mean:");
			console.log("   - Page is still loading");
			console.log("   - Content is in an iframe");
			console.log("   - JavaScript hasn't rendered content yet");
			console.log("   - Page requires authentication");
		}

		console.log(`\n🏠 Home Icon Found: ${pageInfo.hasHomeIcon}`);
		if (pageInfo.homeSelectors.length > 0) {
			console.log(
				`   Selectors that work: ${pageInfo.homeSelectors.join(", ")}`,
			);
		} else {
			console.log("   ⚠️  No home icon selectors found!");
		}
		console.log(`\n📱 Navigation Bar: ${pageInfo.hasNavBar}`);
		console.log(`📄 Main Content: ${pageInfo.hasMainContent}`);
		console.log(`🔍 Search/Explore: ${pageInfo.hasSearchOrExplore}`);

		console.log(`\n🔗 LINKS (showing first ${pageInfo.allLinks.length}):`);
		pageInfo.allLinks.forEach((link, i) => {
			console.log(
				`   ${i + 1}. href="${link.href}" text="${link.text}" aria-label="${link.ariaLabel}"`,
			);
		});

		console.log(`\n🔘 BUTTONS (showing first ${pageInfo.allButtons.length}):`);
		pageInfo.allButtons.forEach((btn, i) => {
			console.log(
				`   ${i + 1}. text="${btn.text}" aria-label="${btn.ariaLabel}"`,
			);
		});

		console.log(
			`\n🎨 SVG ICONS (showing first ${Math.min(20, pageInfo.allSvgIcons.length)}):`,
		);
		pageInfo.allSvgIcons.slice(0, 20).forEach((svg, i) => {
			console.log(
				`   ${i + 1}. aria-label="${svg.ariaLabel}" parent="${svg.parentTag}"`,
			);
		});

		console.log(
			`\n📝 INPUT FIELDS (showing first ${Math.min(20, pageInfo.allInputs.length)}):`,
		);
		pageInfo.allInputs.slice(0, 20).forEach((input, i) => {
			console.log(
				`   ${i + 1}. type="${input.type}" name="${input.name}" placeholder="${input.placeholder}"`,
			);
		});

		console.log(`\n📝 PAGE TEXT PREVIEW (first 500 chars):`);
		if (pageInfo.pageText.trim()) {
			console.log(pageInfo.pageText);
		} else {
			console.log("   (No text content found)");
		}

		console.log("\n" + "=".repeat(80));
		console.log("✅ Inspection complete!");
		console.log("💡 Check the screenshot to see the visual state of the page");
		console.log("=".repeat(80));

		// Keep browser open for manual inspection
		console.log(
			"\n⏸️  Browser will stay open for 60 seconds for manual inspection...",
		);
		await new Promise((resolve) => setTimeout(resolve, 60000));
	} catch (error) {
		console.error("❌ Error during inspection:", error);
		await snapshot(page, "instagram_inspection_error");
	} finally {
		await browser.close();
	}
}

inspectInstagramPage().catch((err) => {
	console.error(err);
	process.exit(1);
});
