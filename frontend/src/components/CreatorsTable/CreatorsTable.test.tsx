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
		dmSentBy: null,
		visitedAt: "2025-12-24T10:00:00.000Z",
		followers: 50000,
		hidden: false,
		hiddenAt: null,
	},
	{
		username: "testcreator2",
		bioText: "Test bio for creator 2",
		confidence: 75,
		manualOverride: true,
		dmSent: true,
		dmSentAt: "2025-12-25T12:00:00.000Z",
		dmSentBy: "profile1",
		visitedAt: "2025-12-23T08:00:00.000Z",
		followers: 150000,
		hidden: false,
		hiddenAt: null,
	},
	{
		username: "testcreator3",
		bioText: null,
		confidence: 50,
		manualOverride: false,
		dmSent: false,
		dmSentAt: null,
		dmSentBy: null,
		visitedAt: "2025-12-22T14:00:00.000Z",
		followers: null,
		hidden: false,
		hiddenAt: null,
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
		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

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
		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// Click load button to reload
		await user.click(screen.getByText("Load creators"));

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		expect(screen.getByText("@testcreator2")).toBeInTheDocument();
		expect(screen.getByText("@testcreator3")).toBeInTheDocument();
		expect(screen.getByText("Test bio for creator 1")).toBeInTheDocument();
		// Text is split across elements, use regex matcher
		expect(screen.getByText(/3.*total creators/)).toBeInTheDocument();
		expect(screen.getByText(/2.*awaiting DMs/)).toBeInTheDocument();
	});

	it("displays confidence badges with correct styling", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("95%")).toBeInTheDocument();

		expect(screen.getByText("75%")).toBeInTheDocument();
		expect(screen.getByText("50%")).toBeInTheDocument();
	});

	it("displays manual override indicator correctly", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator2")).toBeInTheDocument();

		// testcreator2 has manualOverride: true, should show wrench
		expect(screen.getByText("Manual override")).toBeInTheDocument();
		// Other creators should show robot
		expect(screen.getAllByText("Automated")).toHaveLength(2);
	});

	it("displays No bio text when bioText is null", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("No bio")).toBeInTheDocument();
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

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		const checkboxes = screen.getAllByRole("checkbox");
		// First checkbox (testcreator1) should be unchecked
		expect(checkboxes[0]).not.toBeChecked();

		await user.click(checkboxes[0]);

		await waitFor(() => expect(checkboxes[0]).toBeChecked());

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

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

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

		expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();

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

		expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();

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

		expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();

		expect(screen.getByText("Next")).toBeDisabled();
	});

	it("renders Instagram links correctly", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// User can see and click the creator link
		const link = screen.getByRole("link", { name: "@testcreator1" });
		expect(link).toHaveAttribute("href", "https://instagram.com/testcreator1");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("displays DM sent date when available", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator2")).toBeInTheDocument();

		// testcreator2 has dmSentAt set
		const formattedDate = new Date(
			"2025-12-25T12:00:00.000Z",
		).toLocaleDateString();
		expect(screen.getByText(formattedDate)).toBeInTheDocument();
	});

	it("displays DM sent by field with edit functionality", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator2")).toBeInTheDocument();

		// testcreator2 has dmSentBy set, should show value with edit button
		expect(screen.getByText("profile1")).toBeInTheDocument();
		const editButtons = screen.getAllByTitle("Edit DM sent by");
		expect(editButtons.length).toBeGreaterThan(0);
	});

	it("shows input field when dmSentBy is empty", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// testcreator1 has no dmSentBy, should show input field
		const inputs = screen.getAllByPlaceholderText("username");
		expect(inputs.length).toBeGreaterThan(0);
	});

	it("allows editing dmSentBy field", async () => {
		const user = userEvent.setup();

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({ username: "testcreator2", dmSentBy: "newprofile" }),
			});

		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator2")).toBeInTheDocument();

		// Click edit button
		const editButton = screen.getAllByTitle("Edit DM sent by")[0];
		await user.click(editButton);

		// Find the input and type new value
		const inputs = screen.getAllByPlaceholderText("username");
		const input = inputs.find(
			(inp) => (inp as HTMLInputElement).value === "profile1",
		);
		expect(input).toBeInTheDocument();

		if (input) {
			await user.clear(input);
			await user.type(input, "newprofile");
			await user.keyboard("{Enter}");

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					"/api/creators/testcreator2/dm-sent-by",
					expect.objectContaining({
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
					}),
				);
			});
		}
	});

	it("saves dmSentBy on blur", async () => {
		const user = userEvent.setup();

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({ username: "testcreator1", dmSentBy: "profile2" }),
			});

		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// Find the input for testcreator1 (which has no dmSentBy)
		const inputs = screen.getAllByPlaceholderText("username");
		const input = inputs[0];

		await user.type(input, "profile2");
		await user.tab(); // Blur the input

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/creators/testcreator1/dm-sent-by",
				expect.objectContaining({
					method: "PATCH",
				}),
			);
		});
	});

	it("toggles hide status", async () => {
		const user = userEvent.setup();

		// Mock the hide API response
		const hideResponse = {
			username: "testcreator1",
			hidden: true,
			hiddenAt: new Date().toISOString(),
		};

		// Mock the reload after hiding (with testcreator1 removed)
		const reloadResponse = {
			creators: [mockCreators[1], mockCreators[2]], // testcreator1 removed
			total: 2,
			pendingCount: 1,
			page: 1,
			totalPages: 1,
		};

		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(hideResponse),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(reloadResponse),
			});

		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// Find the hide button (✕)
		const hideButtons = screen.getAllByTitle(
			"Strike off / Hide creator (e.g., male, not a creator to DM)",
		);
		expect(hideButtons.length).toBeGreaterThan(0);

		await user.click(hideButtons[0]);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith(
				"/api/creators/testcreator1/hide",
				expect.objectContaining({
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
				}),
			);
		});
	});

	it("displays followers count", async () => {
		render(<CreatorsTable />);

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// testcreator1 has 50000 followers
		expect(screen.getByText("50,000")).toBeInTheDocument();
		// testcreator2 has 150000 followers
		expect(screen.getByText("150,000")).toBeInTheDocument();
		// testcreator3 has null followers, should show "-"
		// There will be multiple "-" elements (for dmSentAt, followers, etc.)
		const dashElements = screen.getAllByText("-");
		expect(dashElements.length).toBeGreaterThanOrEqual(1);
	});

	it("toggles followers filter", async () => {
		const user = userEvent.setup();

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

		expect(await screen.findByText("@testcreator1")).toBeInTheDocument();

		// Find the toggle button for followers filter
		const toggleButton = screen
			.getByText("Followers < 100k")
			.closest("div")
			?.querySelector("button");
		expect(toggleButton).toBeInTheDocument();

		if (toggleButton) {
			await user.click(toggleButton);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					expect.stringContaining("/api/creators"),
				);
			});
		}
	});
});
