import { jest } from "@jest/globals";

const isConfirmedCreatorMock =
	jest.fn<
		(
			imagePath: string,
			threshold?: number,
		) => Promise<
			[
				boolean,
				{ confidence?: number; reason?: string; indicators?: string[] } | null,
			]
		>
	>();

jest.unstable_mockModule("../vision/vision.ts", () => ({
	isConfirmedCreator: isConfirmedCreatorMock,
}));

const { classifyWithVision } = await import("./classifyWithVision.ts");

describe("classifyWithVision", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	test("handles vision error gracefully", async () => {
		isConfirmedCreatorMock.mockRejectedValue(new Error("boom"));

		const res = await classifyWithVision("/nonexistent/image.png");

		expect(res.ok).toBe(false);
		expect(res.data.error).toContain("vision_error");
	});

	test("returns ok false when vision returns null data", async () => {
		isConfirmedCreatorMock.mockResolvedValue([false, null]);

		const res = await classifyWithVision("path");

		expect(res.ok).toBe(false);
		expect(res.data).toMatchObject({ error: "vision_analysis_failed" });
	});

	test("maps vision data and ok flag", async () => {
		isConfirmedCreatorMock.mockResolvedValue([
			true,
			{ confidence: 88, reason: "test", indicators: ["a"] },
		]);

		const res = await classifyWithVision("img", 70);

		expect(isConfirmedCreatorMock).toHaveBeenCalledWith("img", 70);
		expect(res.ok).toBe(true);
		expect(res.data).toMatchObject({
			confidence: 88,
			reason: "test",
			indicators: ["a"],
		});
	});
});
