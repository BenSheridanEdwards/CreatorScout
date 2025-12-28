import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreatorsTable from "./CreatorsTable";

const mockCreators = [
	{
		username: "testcreator1",
		bioText: "Test bio for creator 1",
		confidence: 95,
		manualOverride: false,
		dmSent: false,
		dmSentAt: null,
		visitedAt: "2025-12-24T10:00:00.000Z",
	},
	{
		username: "testcreator2",
		bioText: "Test bio for creator 2",
		confidence: 75,
		manualOverride: true,
		dmSent: true,
		dmSentAt: "2025-12-25T12:00:00.000Z",
		visitedAt: "2025-12-23T08:00:00.000Z",
	},
	{
		username: "testcreator3",
		bioText: null,
		confidence: 50,
		manualOverride: false,
		dmSent: false,
		dmSentAt: null,
		visitedAt: "2025-12-22T14:00:00.000Z",
	},
];

const mockResponse = {
	creators: mockCreators,
	total: 3,
	pendingCount: 2,
	page: 1,
	totalPages: 1,
};

const mockResponsePage2 = {
	creators: mockCreators,
	total: 100,
	pendingCount: 80,
	page: 2,
	totalPages: 2,
};

const mockFetch = vi.fn();

describe("CreatorsTable", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
		// Mock the initial fetch that happens on mount for most tests
		// Individual tests can override this if needed
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		});
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders the component and loads creators on mount", async () => {
		render(<CreatorsTable />);

		expect(screen.getByText("Confirmed Creators")).toBeInTheDocument();

		// Wait for initial load to complete
		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		// After load completes, button should be available
		expect(screen.getByText("Load creators")).toBeInTheDocument();
	});

	it("loads creators when clicking the Load creators button", async () => {
		const user = userEvent.setup();

		// First mock is for initial mount, second is for button click
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			});

		render(<CreatorsTable />);

		// Wait for initial load
		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		// Click load button to reload
		await user.click(screen.getByText("Load creators"));

		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		expect(screen.getByText("@testcreator2")).toBeInTheDocument();
		expect(screen.getByText("@testcreator3")).toBeInTheDocument();
		expect(screen.getByText("Test bio for creator 1")).toBeInTheDocument();
		// Text is split across elements, use regex matcher
		expect(screen.getByText(/3.*total creators/)).toBeInTheDocument();
		expect(screen.getByText(/2.*awaiting DMs/)).toBeInTheDocument();
	});

	it("displays confidence badges with correct styling", async () => {
		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("95%")).toBeInTheDocument();
		});

		expect(screen.getByText("75%")).toBeInTheDocument();
		expect(screen.getByText("50%")).toBeInTheDocument();
	});

	it("displays manual override indicator correctly", async () => {
		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("@testcreator2")).toBeInTheDocument();
		});

		// testcreator2 has manualOverride: true, should show wrench
		expect(screen.getByTitle("Manual override")).toBeInTheDocument();
		// Other creators should show robot
		expect(screen.getAllByTitle("Automated")).toHaveLength(2);
	});

	it("displays No bio text when bioText is null", async () => {
		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("No bio")).toBeInTheDocument();
		});
	});

	it("toggles DM checkbox and updates state", async () => {
		const user = userEvent.setup();

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ dmSent: true }),
			});

		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		const checkboxes = screen.getAllByRole("checkbox");
		// First checkbox (testcreator1) should be unchecked
		expect(checkboxes[0]).not.toBeChecked();

		await user.click(checkboxes[0]);

		await waitFor(() => {
			expect(checkboxes[0]).toBeChecked();
		});

		expect(mockFetch).toHaveBeenCalledWith("/api/creators/testcreator1/dm", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ dmSent: true }),
		});
	});

	it("changes filter and reloads creators", async () => {
		const user = userEvent.setup();

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						...mockResponse,
						creators: [mockCreators[0], mockCreators[2]],
						pendingCount: 2,
					}),
			});

		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		const select = screen.getByRole("combobox");
		await user.selectOptions(select, "pending");

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/creators"),
			);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("dmFilter=pending"),
			);
		});
	});

	it("renders pagination when totalPages > 1", async () => {
		// Override the default mock for this test
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponsePage2),
		});

		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
		});

		expect(screen.getByText("Previous")).toBeInTheDocument();
		expect(screen.getByText("Next")).toBeInTheDocument();
	});

	it("navigates to previous page when clicking Previous", async () => {
		const user = userEvent.setup();

		mockFetch.mockReset();
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponsePage2),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						...mockResponse,
						page: 1,
						totalPages: 2,
						total: 100,
					}),
			});

		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Previous"));

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/creators"),
			);
			expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("page=1"));
		});
	});

	it("disables Next button on last page", async () => {
		mockFetch.mockReset();
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(mockResponsePage2),
		});

		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
		});

		expect(screen.getByText("Next")).toBeDisabled();
	});

	it("renders Instagram links correctly", async () => {
		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("@testcreator1")).toBeInTheDocument();
		});

		// User can see and click the creator link
		const link = screen.getByRole("link", { name: "@testcreator1" });
		expect(link).toHaveAttribute("href", "https://instagram.com/testcreator1");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("displays DM sent date when available", async () => {
		render(<CreatorsTable />);

		await waitFor(() => {
			expect(screen.getByText("@testcreator2")).toBeInTheDocument();
		});

		// testcreator2 has dmSentAt set
		const formattedDate = new Date(
			"2025-12-25T12:00:00.000Z",
		).toLocaleDateString();
		expect(screen.getByText(formattedDate)).toBeInTheDocument();
	});
});
