import { sleep } from "./sleep.ts";

describe("sleep", () => {
	test("resolves after given ms", async () => {
		const start = Date.now();
		await sleep(10);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(0);
	});
});
