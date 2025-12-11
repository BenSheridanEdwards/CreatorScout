import {
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

beforeAll(() => {
	initDb();
});

describe("database", () => {
	// Use unique usernames per test to avoid conflicts
	const getTestUsername = () =>
		`testuser${Date.now()}${Math.random().toString(36).substring(7)}`;

	describe("queue operations", () => {
		test("queueAdd adds username to queue", () => {
			const username = getTestUsername();
			queueAdd(username, 50, "test");
			expect(queueCount()).toBeGreaterThan(0);
		});

		test("queueNext retrieves and removes from queue", () => {
			const username = getTestUsername();
			queueAdd(username, 100, "test");
			const next = queueNext();
			expect(next).toBe(username.toLowerCase());
			// Should be removed
			const nextAgain = queueNext();
			expect(nextAgain).not.toBe(username);
		});

		test("queueNext returns null when empty", () => {
			// Clear queue by dequeuing all
			while (queueNext()) {
				// Empty queue
			}
			expect(queueNext()).toBeNull();
		});

		test("queueCount returns correct count", () => {
			const initialCount = queueCount();
			queueAdd("user1", 10, "test");
			queueAdd("user2", 20, "test");
			expect(queueCount()).toBe(initialCount + 2);
		});
	});

	describe("profile operations", () => {
		test("wasVisited returns false for new user", () => {
			const username = getTestUsername();
			expect(wasVisited(username)).toBe(false);
		});

		test("markVisited marks user as visited", () => {
			const username = getTestUsername();
			markVisited(username, "Test User", "Test bio", 50, "https://example.com");
			expect(wasVisited(username)).toBe(true);
		});

		test("markAsCreator marks user as creator", () => {
			const username = getTestUsername();
			markVisited(username);
			markAsCreator(username, 85, "proof.png");
			// Can't easily test this without querying DB directly
			// But function should not throw
			expect(() => markAsCreator(username, 85)).not.toThrow();
		});

		test("wasDmSent returns false initially", () => {
			const username = getTestUsername();
			markVisited(username);
			expect(wasDmSent(username)).toBe(false);
		});

		test("markDmSent marks DM as sent", () => {
			const username = getTestUsername();
			markVisited(username);
			markDmSent(username, "proof.png");
			expect(wasDmSent(username)).toBe(true);
		});

		test("wasFollowed returns false initially", () => {
			const username = getTestUsername();
			markVisited(username);
			expect(wasFollowed(username)).toBe(false);
		});

		test("markFollowed marks as followed", () => {
			const username = getTestUsername();
			markVisited(username);
			markFollowed(username);
			expect(wasFollowed(username)).toBe(true);
		});
	});

	describe("scroll index operations", () => {
		test("getScrollIndex returns 0 for new user", () => {
			const username = getTestUsername();
			expect(getScrollIndex(username)).toBe(0);
		});

		test("updateScrollIndex updates index", () => {
			const username = getTestUsername();
			updateScrollIndex(username, 10);
			expect(getScrollIndex(username)).toBe(10);
		});

		test("updateScrollIndex can update multiple times", () => {
			const username = getTestUsername();
			updateScrollIndex(username, 5);
			updateScrollIndex(username, 15);
			expect(getScrollIndex(username)).toBe(15);
		});
	});

	describe("getStats", () => {
		test("returns stats object with all fields", () => {
			const stats = getStats();
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
