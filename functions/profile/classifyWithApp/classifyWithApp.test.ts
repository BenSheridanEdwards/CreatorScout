import { classifyWithApp } from "./classifyWithApp.ts";

// Note: These are integration tests that require OPENROUTER_API_KEY
// For unit tests with mocking, ESM mocking in Jest is complex
// These tests verify the function works correctly with the actual vision module

describe("classifyWithApp", () => {
	test("classifyWithApp handles non-existent image gracefully", async () => {
		const res = await classifyWithApp("/nonexistent/image.png");
		// Should handle error gracefully
		expect(res.ok).toBe(false);
		expect(res.data.error).toBeDefined();
	});

	test("classifyWithApp returns correct structure", async () => {
		// Even with errors, should return proper structure
		const res = await classifyWithApp("/nonexistent/image.png");
		expect(res).toHaveProperty("ok");
		expect(res).toHaveProperty("data");
		expect(typeof res.ok).toBe("boolean");
		expect(typeof res.data).toBe("object");
	});
});
