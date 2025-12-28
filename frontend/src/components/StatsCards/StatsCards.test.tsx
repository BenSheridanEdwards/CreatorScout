import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatsCards from "./StatsCards";

const mockStats = {
	creatorsFound: 42,
	dmsSent: 15,
};

const mockFetch = vi.fn();

describe("StatsCards", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the component with loading state initially", async () => {
		mockFetch.mockReset();
		mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

		render(<StatsCards />);

		expect(screen.getByText("Statistics")).toBeInTheDocument();

		// Wait for the initial load to start
		await waitFor(
			() => {
				expect(screen.getAllByText("Loading...").length).toBeGreaterThanOrEqual(
					1,
				);
			},
			{ timeout: 3000 },
		);
	});

	it("loads and displays stats on mount", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockStats),
		});

		render(<StatsCards />);

		await waitFor(() => {
			expect(screen.getByText("42")).toBeInTheDocument();
		});

		expect(screen.getByText("15")).toBeInTheDocument();
		expect(screen.getByText("Avatar Creators Found")).toBeInTheDocument();
		expect(screen.getByText("DMs Sent")).toBeInTheDocument();
	});

	it("refreshes stats when clicking refresh button", async () => {
		const user = userEvent.setup();

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockStats),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ creatorsFound: 50, dmsSent: 20 }),
			});

		render(<StatsCards />);

		await waitFor(() => {
			expect(screen.getByText("42")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Refresh"));

		await waitFor(() => {
			expect(screen.getByText("50")).toBeInTheDocument();
		});

		expect(screen.getByText("20")).toBeInTheDocument();
	});

	it("shows loading state while refreshing", async () => {
		const user = userEvent.setup();

		let resolvePromise: (value: unknown) => void = () => {};
		const pendingPromise = new Promise((resolve) => {
			resolvePromise = resolve;
		});

		mockFetch.mockReset();
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockStats),
			})
			.mockReturnValueOnce(pendingPromise);

		render(<StatsCards />);

		await waitFor(
			() => {
				expect(screen.getByText("42")).toBeInTheDocument();
			},
			{ timeout: 3000 },
		);

		const refreshButton = screen.getByRole("button", { name: /refresh/i });
		expect(refreshButton).not.toBeDisabled();

		await user.click(refreshButton);

		// Wait for loading state - button should be disabled
		await waitFor(
			() => {
				const button = screen.getByRole("button");
				expect(button).toBeDisabled();
			},
			{ timeout: 1000 },
		);

		// Resolve the promise
		resolvePromise({
			ok: true,
			json: () => Promise.resolve(mockStats),
		});

		await waitFor(
			() => {
				expect(
					screen.getByRole("button", { name: /refresh/i }),
				).not.toBeDisabled();
			},
			{ timeout: 3000 },
		);
	});

	it("displays zero when stats are null", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(null),
		});

		render(<StatsCards />);

		await waitFor(() => {
			const zeros = screen.getAllByText("0");
			expect(zeros).toHaveLength(2);
		});
	});

	it("shows tooltip on info icon hover", async () => {
		const user = userEvent.setup();

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockStats),
		});

		render(<StatsCards />);

		await waitFor(() => {
			expect(screen.getByText("42")).toBeInTheDocument();
		});

		// User can see the "Avatar Creators Found" text
		const avatarCreatorsText = screen.getByText("Avatar Creators Found");
		expect(avatarCreatorsText).toBeInTheDocument();

		// User hovers over the info icon - we find it by hovering near the text
		// Since the icon is interactive and visible, we can hover over the text area
		// which will trigger the tooltip on the nearby icon
		await user.hover(avatarCreatorsText);

		// After hovering, the tooltip with filter parameters should appear
		await waitFor(() => {
			expect(screen.getByText("Filter Parameters:")).toBeInTheDocument();
		});

		expect(screen.getByText(/Followers: < 100k/)).toBeInTheDocument();
		expect(screen.getByText(/Excludes hidden creators/)).toBeInTheDocument();
	});

	it("calls correct API endpoint", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockStats),
		});

		render(<StatsCards />);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/api/stats");
		});
	});
});
