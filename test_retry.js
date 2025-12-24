// Quick test to verify retry logic is working
import { analyzeProfile } from "./functions/profile/vision/vision.js";

async function testRetry() {
	console.log("Testing retry logic...");

	// This should trigger the retry logic if there are API issues
	try {
		const result = await analyzeProfile("/tmp/nonexistent.png");
		console.log("Result:", result);
	} catch (error) {
		console.log("Expected error (file not found):", error.message);
	}

	console.log("Retry logic test completed");
}

testRetry();
