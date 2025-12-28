import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecentRuns from "./RecentRuns";
import type { RunMetadata } from "../../types";

const mockRuns: RunMetadata[] = [
	{
		id: "run1",
		scriptName: "discover",
		startTime: "2025-12-24T10:00:00.000Z",
		endTime: "2025-12-24T10:30:00.000Z",
		status: "completed",
		profilesProcessed: 50,
		creatorsFound: 5,
		errors: 2,
		screenshots: ["/screenshots/1.png", "/screenshots/2.png"],
		finalScreenshot: "/screenshots/final.png",
		stats: {
			duration: 1800,
			avgProcessingTime: 36,
			successRate: 96,
		},
	},
	{
		id: "run2",
		scriptName: "dm_batch",
		startTime: "2025-12-24T11:00:00.000Z",
		status: "running",
		profilesProcessed: 10,
		creatorsFound: 0,
		errors: 0,
		screenshots: [],
	},
	{
		id: "run3",
		scriptName: "scrape",
		startTime: "2025-12-24T09:00:00.000Z",
		endTime: "2025-12-24T09:15:00.000Z",
		status: "error",
		profilesProcessed: 20,
		creatorsFound: 0,
		errors: 5,
		screenshots: [],
		errorMessage: "Connection timeout",
	},
];

const mockFetch = vi.fn();

describe("RecentRuns", () => {
	const mockOnRunSelect = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockOnRunSelect.mockClear();
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the component with initial empty state", () => {
		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		expect(screen.getByText("Recent Runs")).toBeInTheDocument();
		expect(screen.getByText("Load runs")).toBeInTheDocument();
		expect(
			screen.getByText(/No runs yet\. Start a script/),
		).toBeInTheDocument();
	});

	it("loads runs when clicking Load runs button", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText(/DISCOVER/i)).toBeInTheDocument();
		});

		expect(screen.getByText(/DM_BATCH/i)).toBeInTheDocument();
		expect(screen.getByText(/SCRAPE/i)).toBeInTheDocument();
	});

	it("displays run status badges correctly", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText("completed")).toBeInTheDocument();
		});

		expect(screen.getByText("running")).toBeInTheDocument();
		expect(screen.getByText("error")).toBeInTheDocument();
	});

	it("displays run metrics correctly", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText(/DISCOVER/i)).toBeInTheDocument();
		});

		// Check for metrics in the discover run
		const discoverRun = screen.getByText(/DISCOVER/i).closest("button");
		expect(discoverRun).toBeInTheDocument();
		if (discoverRun) {
			expect(discoverRun).toHaveTextContent("50");
			expect(discoverRun).toHaveTextContent("5");
			expect(discoverRun).toHaveTextContent("2");
			expect(discoverRun).toHaveTextContent("30m 0s");
		}
	});

	it("displays screenshot count when available", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText("📸 2")).toBeInTheDocument();
		});
	});

	it("displays error message when run has error", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText("Error: Connection timeout")).toBeInTheDocument();
		});
	});

	it("calls onRunSelect when clicking a run", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText(/DISCOVER/i)).toBeInTheDocument();
		});

		// User clicks on the visible run button that contains "DISCOVER" text
		const discoverButton = screen.getByRole("button", { name: /DISCOVER/i });
		await user.click(discoverButton);

		await waitFor(() => {
			expect(mockOnRunSelect).toHaveBeenCalledWith(mockRuns[0]);
		});
	});

	it("highlights selected run", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText(/DISCOVER/i)).toBeInTheDocument();
		});

		// User clicks on the visible run button that contains "DISCOVER" text
		const discoverButton = screen.getByRole("button", { name: /DISCOVER/i });
		await user.click(discoverButton);

		// After clicking, the button should be visually highlighted (user can see it's selected)
		await waitFor(() => {
			expect(discoverButton).toHaveClass("border-sky-500");
		});
	});

	it("displays final screenshot when available", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			const img = screen.getByAltText("Final screenshot");
			expect(img).toBeInTheDocument();
			expect(img).toHaveAttribute(
				"src",
				"http://localhost:4000/screenshots/final.png",
			);
		});
	});

	it("shows loading state while fetching", async () => {
		const user = userEvent.setup();

		let resolvePromise: (value: unknown) => void = () => {};
		const pendingPromise = new Promise((resolve) => {
			resolvePromise = resolve;
		});

		mockFetch.mockReturnValueOnce(pendingPromise);

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		const loadButton = screen.getByRole("button", { name: /load runs/i });
		await user.click(loadButton);

		await waitFor(() => {
			expect(screen.getByText("Loading...")).toBeInTheDocument();
		});
		expect(loadButton).toBeDisabled();

		resolvePromise({
			ok: true,
			json: () => Promise.resolve(mockRuns),
		});

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /load runs/i }),
			).not.toBeDisabled();
		});
	});

	it("displays error message when API fails", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 500,
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(
				screen.getByText("Failed to load runs (status 500)."),
			).toBeInTheDocument();
		});
	});

	it("displays error message when network fails", async () => {
		const user = userEvent.setup();

		mockFetch.mockRejectedValueOnce(new Error("Network error"));

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(
				screen.getByText(
					"Could not reach /api/runs. Is the API server running?",
				),
			).toBeInTheDocument();
		});
	});

	it("formats duration correctly", async () => {
		const user = userEvent.setup();

		const runWithShortDuration: RunMetadata = {
			...mockRuns[0],
			stats: { duration: 45 },
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve([runWithShortDuration]),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText("45s")).toBeInTheDocument();
		});
	});

	it("displays N/A when duration is not available", async () => {
		const user = userEvent.setup();

		const runWithoutDuration: RunMetadata = {
			...mockRuns[0],
			stats: {},
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve([runWithoutDuration]),
		});

		render(<RecentRuns onRunSelect={mockOnRunSelect} />);

		await user.click(screen.getByText("Load runs"));

		await waitFor(() => {
			expect(screen.getByText("N/A")).toBeInTheDocument();
		});
	});
});
