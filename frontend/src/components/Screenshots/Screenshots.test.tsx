import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Screenshots from "./Screenshots";
import type { Screenshot } from "../../types";

const mockScreenshots: Screenshot[] = [
	{
		username: "creator1",
		type: "dm",
		date: "2025-12-24T10:00:00.000Z",
		path: "/screenshots/dm1.png",
		filename: "dm1.png",
	},
	{
		username: "creator2",
		type: "profile",
		date: "2025-12-24T09:00:00.000Z",
		path: "/screenshots/profile1.png",
		filename: "profile1.png",
	},
	{
		username: "creator3",
		type: "link",
		date: "2025-12-24T08:00:00.000Z",
		path: "/screenshots/link1.png",
		filename: "link1.png",
	},
	{
		username: "creator4",
		type: "error",
		date: "2025-12-24T07:00:00.000Z",
		path: "/screenshots/error1.png",
		filename: "error1.png",
	},
	{
		username: "creator5",
		type: "debug",
		date: "2025-12-24T06:00:00.000Z",
		path: "/screenshots/debug1.png",
		filename: "debug1.png",
	},
];

const mockFetch = vi.fn();

describe("Screenshots", () => {
	const mockOnScreenshotSelect = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockOnScreenshotSelect.mockClear();
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the component with initial empty state", () => {
		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		expect(screen.getByText("Screenshots")).toBeInTheDocument();
		expect(screen.getByText("Load screenshots")).toBeInTheDocument();
		expect(screen.getByText("Proof (0)")).toBeInTheDocument();
		expect(screen.getByText("Profile Analysis (0)")).toBeInTheDocument();
		expect(screen.getByText("Errors & Debug (0)")).toBeInTheDocument();
	});

	it("loads screenshots when clicking Load screenshots button", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});
	});

	it("displays screenshots in proof tab by default", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});

		// Only DM screenshots should be visible in proof tab
		expect(screen.queryByText("@creator2")).not.toBeInTheDocument();
		expect(screen.queryByText("@creator3")).not.toBeInTheDocument();
	});

	it("switches to analysis tab and shows profile/link screenshots", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Profile Analysis (2)"));

		await waitFor(() => {
			expect(screen.getByText("@creator2")).toBeInTheDocument();
		});

		expect(screen.getByText("@creator3")).toBeInTheDocument();
		expect(screen.queryByText("@creator1")).not.toBeInTheDocument();
	});

	it("switches to errors tab and shows error/debug screenshots", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Errors & Debug (2)"));

		await waitFor(() => {
			expect(screen.getByText("@creator4")).toBeInTheDocument();
		});

		expect(screen.getByText("@creator5")).toBeInTheDocument();
		expect(screen.queryByText("@creator1")).not.toBeInTheDocument();
	});

	it("updates tab counts after loading screenshots", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("Proof (1)")).toBeInTheDocument();
		});

		expect(screen.getByText("Profile Analysis (2)")).toBeInTheDocument();
		expect(screen.getByText("Errors & Debug (2)")).toBeInTheDocument();
	});

	it("calls onScreenshotSelect when clicking a screenshot", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});

		// User can see and click the button that contains the creator name
		const screenshotButton = screen.getByRole("button", { name: /@creator1/i });
		await user.click(screenshotButton);

		await waitFor(() => {
			expect(mockOnScreenshotSelect).toHaveBeenCalledWith(mockScreenshots[0]);
		});
	});

	it("displays screenshot images with correct src", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			const img = screen.getByAltText("creator1");
			expect(img).toBeInTheDocument();
			expect(img).toHaveAttribute(
				"src",
				"http://localhost:4000/screenshots/dm1.png",
			);
		});
	});

	it("displays screenshot type badges correctly", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("dm")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Profile Analysis (2)"));

		await waitFor(() => {
			expect(screen.getByText("profile")).toBeInTheDocument();
		});

		expect(screen.getByText("link")).toBeInTheDocument();
	});

	it("shows message when no screenshots in current tab", async () => {
		const user = userEvent.setup();

		// Only DM screenshots
		const dmOnlyScreenshots = [mockScreenshots[0]];

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(dmOnlyScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@creator1")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Profile Analysis (0)"));

		await waitFor(() => {
			expect(
				screen.getByText("No analysis screenshots yet."),
			).toBeInTheDocument();
		});
	});

	it("shows loading state while fetching", async () => {
		const user = userEvent.setup();

		let resolvePromise: (value: unknown) => void = () => {};
		const pendingPromise = new Promise((resolve) => {
			resolvePromise = resolve;
		});

		mockFetch.mockReturnValueOnce(pendingPromise);

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		const loadButton = screen.getByRole("button", {
			name: /load screenshots/i,
		});
		await user.click(loadButton);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
		expect(loadButton).toBeDisabled();

		resolvePromise({
			ok: true,
			json: () => Promise.resolve(mockScreenshots),
		});

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /load screenshots/i }),
			).not.toBeDisabled();
		});
	});

	it("displays error message when API fails", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(
				screen.getByText("Failed to load screenshots (status 500)."),
			).toBeInTheDocument();
		});
	});

	it("displays error message when network fails", async () => {
		const user = userEvent.setup();

		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(
				screen.getByText(
					"Could not reach /api/screenshots. Is the API server running?",
				),
			).toBeInTheDocument();
		});
	});

	it("limits displayed screenshots to 20 per tab", async () => {
		const user = userEvent.setup();

		// Create 25 DM screenshots
		const manyScreenshots: Screenshot[] = Array.from(
			{ length: 25 },
			(_, i) => ({
				username: `creator${i + 1}`,
				type: "dm",
				date: `2025-12-24T${10 + i}:00:00.000Z`,
				path: `/screenshots/dm${i + 1}.png`,
				filename: `dm${i + 1}.png`,
			}),
		);

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(manyScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(
				screen.getByText("Showing 20 of 25 screenshots"),
			).toBeInTheDocument();
		});

		// Should only show 20 screenshots
		const screenshots = screen.getAllByText(/@creator\d+/);
		expect(screenshots).toHaveLength(20);
	});

	it("sorts screenshots by date, newest first", async () => {
		const user = userEvent.setup();

		const unsortedScreenshots: Screenshot[] = [
			{
				username: "old",
				type: "dm",
				date: "2025-12-24T08:00:00.000Z",
				path: "/screenshots/old.png",
				filename: "old.png",
			},
			{
				username: "new",
				type: "dm",
				date: "2025-12-24T10:00:00.000Z",
				path: "/screenshots/new.png",
				filename: "new.png",
			},
			{
				username: "middle",
				type: "dm",
				date: "2025-12-24T09:00:00.000Z",
				path: "/screenshots/middle.png",
				filename: "middle.png",
			},
		];

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(unsortedScreenshots),
		});

		render(<Screenshots onScreenshotSelect={mockOnScreenshotSelect} />);

		await user.click(screen.getByText("Load screenshots"));

		await waitFor(() => {
			expect(screen.getByText("@new")).toBeInTheDocument();
		});

		const screenshots = screen.getAllByText(/@(new|middle|old)/);
		expect(screenshots[0]).toHaveTextContent("@new");
		expect(screenshots[1]).toHaveTextContent("@middle");
		expect(screenshots[2]).toHaveTextContent("@old");
	});
});
