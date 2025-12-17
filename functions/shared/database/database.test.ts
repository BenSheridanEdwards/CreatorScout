import {
	clearQueue,
	closeDb,
	getScrollIndex,
	getStats,
	initDb,
	markAsCreator,
	markDmSent,
	markFollowed,
	markVisited,
	queueAdd,
	queueCount,
	queueNext,
	updateScrollIndex,
	wasDmSent,
	wasFollowed,
	wasVisited,
} from "./database.ts";

beforeAll(async () => {
	await initDb();
});

afterAll(async () => {
	await closeDb();
});

describe("database", () => {
	// Use unique usernames per test to avoid conflicts
	const getTestUsername = () =>
		`testuser${Date.now()}${Math.random().toString(36).substring(7)}`;

	describe("queue operations", () => {
		test("queueAdd adds username to queue", async () => {
			const username = getTestUsername();
			await queueAdd(username, 50, "test");
			expect(await queueCount()).toBeGreaterThan(0);
		});

		test("queueNext retrieves and removes from queue", async () => {
			// Clear queue to ensure clean state
			await clearQueue();
			const username = getTestUsername();
			await queueAdd(username, 100, "test");
			const next = await queueNext();
			expect(next).toBe(username.toLowerCase());
			// Should be removed
			const nextAgain = await queueNext();
			expect(nextAgain).not.toBe(username);
		});

		test("queueNext returns null when empty", async () => {
			// Clear queue by dequeuing all
			while (await queueNext()) {
				// Empty queue
			}
			expect(await queueNext()).toBeNull();
		});

		test("queueCount returns correct count", async () => {
			const initialCount = await queueCount();
			await queueAdd("user1", 10, "test");
			await queueAdd("user2", 20, "test");
			expect(await queueCount()).toBe(initialCount + 2);
		});
	});

	describe("profile operations", () => {
		test("wasVisited returns false for new user", async () => {
			const username = getTestUsername();
			expect(await wasVisited(username)).toBe(false);
		});

		test("markVisited marks user as visited", async () => {
			const username = getTestUsername();
			await markVisited(
				username,
				"Test User",
				"Test bio",
				50,
				"https://example.com",
			);
			expect(await wasVisited(username)).toBe(true);
		});

		test("markAsCreator marks user as creator", async () => {
			const username = getTestUsername();
			await markVisited(username);
			await expect(
				markAsCreator(username, 85, "proof.png"),
			).resolves.toBeUndefined();
			await expect(markAsCreator(username, 85)).resolves.toBeUndefined();
		});

		test("wasDmSent returns false initially", async () => {
			const username = getTestUsername();
			await markVisited(username);
			expect(await wasDmSent(username)).toBe(false);
		});

		test("markDmSent marks DM as sent", async () => {
			const username = getTestUsername();
			await markVisited(username);
			await markDmSent(username, "proof.png");
			expect(await wasDmSent(username)).toBe(true);
		});

		test("wasFollowed returns false initially", async () => {
			const username = getTestUsername();
			await markVisited(username);
			expect(await wasFollowed(username)).toBe(false);
		});

		test("markFollowed marks as followed", async () => {
			const username = getTestUsername();
			await markVisited(username);
			await markFollowed(username);
			expect(await wasFollowed(username)).toBe(true);
		});
	});

	describe("scroll index operations", () => {
		test("getScrollIndex returns 0 for new user", async () => {
			const username = getTestUsername();
			expect(await getScrollIndex(username)).toBe(0);
		});

		test("updateScrollIndex updates index", async () => {
			const username = getTestUsername();
			await updateScrollIndex(username, 10);
			expect(await getScrollIndex(username)).toBe(10);
		});

		test("updateScrollIndex can update multiple times", async () => {
			const username = getTestUsername();
			await updateScrollIndex(username, 5);
			await updateScrollIndex(username, 15);
			expect(await getScrollIndex(username)).toBe(15);
		});
	});

	describe("getStats", () => {
		test("returns stats object with all fields", async () => {
			const stats = await getStats();
			expect(stats).toHaveProperty("total_visited");
			expect(stats).toHaveProperty("confirmed_creators");
			expect(stats).toHaveProperty("dms_sent");
			expect(stats).toHaveProperty("queue_size");
			expect(typeof stats.total_visited).toBe("number");
			expect(typeof stats.confirmed_creators).toBe("number");
			expect(typeof stats.dms_sent).toBe("number");
			expect(typeof stats.queue_size).toBe("number");
		});
	});
});
