import { jest } from "@jest/globals";

// Mock Prisma client
const mockProfile = {
	findUnique: jest.fn<() => Promise<unknown>>(),
	findFirst: jest.fn<() => Promise<unknown>>(),
	count: jest.fn<() => Promise<number>>(),
	upsert: jest.fn<() => Promise<unknown>>(),
	update: jest.fn<() => Promise<unknown>>(),
	updateMany: jest.fn<() => Promise<unknown>>(),
	create: jest.fn<() => Promise<unknown>>(),
	delete: jest.fn<() => Promise<unknown>>(),
	deleteMany: jest.fn<() => Promise<unknown>>(),
};

const mockQueueItem = {
	findUnique: jest.fn<() => Promise<unknown>>(),
	findFirst: jest.fn<() => Promise<unknown>>(),
	count: jest.fn<() => Promise<number>>(),
	upsert: jest.fn<() => Promise<unknown>>(),
	update: jest.fn<() => Promise<unknown>>(),
	create: jest.fn<() => Promise<unknown>>(),
	delete: jest.fn<() => Promise<unknown>>(),
	deleteMany: jest.fn<() => Promise<unknown>>(),
};

const mockFollowingScraped = {
	findUnique: jest.fn<() => Promise<unknown>>(),
	upsert: jest.fn<() => Promise<unknown>>(),
};

const mockMetric = {
	create: jest.fn<() => Promise<unknown>>(),
	updateMany: jest.fn<() => Promise<unknown>>(),
	findMany: jest.fn<() => Promise<unknown>>(),
};

const mockPrismaClient = {
	profile: mockProfile,
	queueItem: mockQueueItem,
	followingScraped: mockFollowingScraped,
	metric: mockMetric,
	$connect: jest.fn(),
	$disconnect: jest.fn(),
	$queryRawUnsafe: jest.fn(),
	$executeRawUnsafe: jest.fn(),
};

// Mock the pg Pool
const mockPool = {
	end: jest.fn(),
};

jest.unstable_mockModule("@prisma/client", () => ({
	PrismaClient: jest.fn(() => mockPrismaClient),
	Prisma: {
		Decimal: jest.fn((val: unknown) => val),
	},
}));

jest.unstable_mockModule("@prisma/adapter-pg", () => ({
	PrismaPg: jest.fn(() => ({})),
}));

jest.unstable_mockModule("pg", () => ({
	Pool: jest.fn(() => mockPool),
}));

// Set DATABASE_URL for tests
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

const {
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
} = await import("./database.ts");

beforeAll(async () => {
	await initDb();
});

afterAll(async () => {
	await closeDb();
});

beforeEach(() => {
	jest.clearAllMocks();
});

describe("database", () => {
	// Use unique usernames per test to avoid conflicts
	const getTestUsername = () =>
		`testuser${Date.now()}${Math.random().toString(36).substring(7)}`;

	describe("queue operations", () => {
		test("queueAdd adds username to queue", async () => {
			const username = getTestUsername();
			mockQueueItem.upsert.mockResolvedValue({ username });
			mockQueueItem.count.mockResolvedValue(1);

			await queueAdd(username, 50, "test");
			expect(await queueCount()).toBeGreaterThan(0);
			expect(mockQueueItem.upsert).toHaveBeenCalled();
		});

		test("queueNext retrieves and removes from queue", async () => {
			const username = getTestUsername();
			mockQueueItem.findFirst.mockResolvedValueOnce({
				username: username.toLowerCase(),
			});
			mockQueueItem.delete.mockResolvedValue({});
			mockQueueItem.findFirst.mockResolvedValueOnce(null);

			// Clear queue first by mocking deleteMany
			mockQueueItem.deleteMany.mockResolvedValue({ count: 0 });
			await clearQueue();

			// Add item
			mockQueueItem.upsert.mockResolvedValue({ username });
			await queueAdd(username, 100, "test");

			const next = await queueNext();
			expect(next).toBe(username.toLowerCase());

			// Should be removed
			const nextAgain = await queueNext();
			expect(nextAgain).toBeNull();
		});

		test("queueNext returns null when empty", async () => {
			mockQueueItem.findFirst.mockResolvedValue(null);
			expect(await queueNext()).toBeNull();
		});

		test("queueCount returns correct count", async () => {
			mockQueueItem.count.mockResolvedValue(5);
			expect(await queueCount()).toBe(5);
		});
	});

	describe("profile operations", () => {
		test("wasVisited returns false for new user", async () => {
			const username = getTestUsername();
			mockProfile.findUnique.mockResolvedValue(null);
			expect(await wasVisited(username)).toBe(false);
		});

		test("markVisited marks user as visited", async () => {
			const username = getTestUsername();
			mockProfile.upsert.mockResolvedValue({ username });
			mockProfile.findUnique.mockResolvedValue({ username });

			await markVisited(
				username,
				"Test User",
				"Test bio",
				50,
				"https://example.com",
				75,
			);
			expect(await wasVisited(username)).toBe(true);
			expect(mockProfile.upsert).toHaveBeenCalled();
		});

		test("markAsCreator marks user as creator", async () => {
			const username = getTestUsername();
			mockProfile.update.mockResolvedValue({ username, isCreator: true });

			await expect(
				markAsCreator(username, 85, "proof.png"),
			).resolves.not.toThrow();
			await expect(markAsCreator(username, 85)).resolves.not.toThrow();
			expect(mockProfile.update).toHaveBeenCalled();
		});

		test("wasDmSent returns false initially", async () => {
			const username = getTestUsername();
			mockProfile.findUnique.mockResolvedValue({ dmSent: false });
			expect(await wasDmSent(username)).toBe(false);
		});

		test("markDmSent marks DM as sent", async () => {
			const username = getTestUsername();
			mockProfile.update.mockResolvedValue({ dmSent: true });
			mockProfile.findUnique.mockResolvedValue({ dmSent: true });

			await markDmSent(username, "proof.png");
			expect(await wasDmSent(username)).toBe(true);
		});

		test("wasFollowed returns false initially", async () => {
			const username = getTestUsername();
			mockProfile.findUnique.mockResolvedValue({ followed: false });
			expect(await wasFollowed(username)).toBe(false);
		});

		test("markFollowed marks as followed", async () => {
			const username = getTestUsername();
			mockProfile.update.mockResolvedValue({ followed: true });
			mockProfile.findUnique.mockResolvedValue({ followed: true });

			await markFollowed(username);
			expect(await wasFollowed(username)).toBe(true);
		});
	});

	describe("scroll index operations", () => {
		test("getScrollIndex returns 0 for new user", async () => {
			const username = getTestUsername();
			mockFollowingScraped.findUnique.mockResolvedValue(null);
			expect(await getScrollIndex(username)).toBe(0);
		});

		test("updateScrollIndex updates index", async () => {
			const username = getTestUsername();
			mockFollowingScraped.upsert.mockResolvedValue({ scrollIndex: 10 });
			mockFollowingScraped.findUnique.mockResolvedValue({ scrollIndex: 10 });

			await updateScrollIndex(username, 10);
			expect(await getScrollIndex(username)).toBe(10);
		});

		test("updateScrollIndex can update multiple times", async () => {
			const username = getTestUsername();
			mockFollowingScraped.upsert.mockResolvedValue({});

			await updateScrollIndex(username, 5);
			mockFollowingScraped.findUnique.mockResolvedValue({ scrollIndex: 5 });
			expect(await getScrollIndex(username)).toBe(5);

			await updateScrollIndex(username, 15);
			mockFollowingScraped.findUnique.mockResolvedValue({ scrollIndex: 15 });
			expect(await getScrollIndex(username)).toBe(15);
		});
	});

	describe("getStats", () => {
		test("returns stats object with all fields", async () => {
			mockProfile.count
				.mockResolvedValueOnce(100) // total_visited
				.mockResolvedValueOnce(20) // confirmed_creators
				.mockResolvedValueOnce(10); // dms_sent
			mockQueueItem.count.mockResolvedValue(5); // queue_size

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
