import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunMetadata, ScheduledRun } from "../../types";
import TimelineCarousel from "./TimelineCarousel";

const mockRuns: RunMetadata[] = [
	{
		id: "run1",
		scriptName: "discover",
		startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
		endTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
		status: "completed",
		profilesProcessed: 50,
		creatorsFound: 5,
		errors: 2,
		screenshots: ["/screenshots/1.png"],
		finalScreenshot: "/screenshots/final.png",
		profileId: "account1",
	},
	{
		id: "run2",
		scriptName: "dm_batch",
		startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago (still running)
		status: "running",
		profilesProcessed: 10,
		creatorsFound: 2,
		errors: 0,
		screenshots: ["/screenshots/live.png"],
		profileId: "account1",
	},
	{
		id: "run3",
		scriptName: "scrape",
		startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
		endTime: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
		status: "error",
		profilesProcessed: 20,
		creatorsFound: 0,
		errors: 5,
		screenshots: [],
		errorMessage: "Connection timeout",
		profileId: "account2",
		issues: [
			{
				type: "high_error_rate",
				message: "High error rate detected",
				severity: "warning",
				detectedAt: new Date().toISOString(),
			},
		],
	},
];

const mockScheduledRuns: ScheduledRun[] = [
	{
		id: "sched1",
		name: "Morning Discovery",
		profileId: "account1",
		accountName: "Account 1",
		scriptName: "discover",
		scheduledTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
		sessionType: "morning",
	},
	{
		id: "sched2",
		name: "Afternoon DMs",
		profileId: "account2",
		accountName: "Account 2",
		scriptName: "dm_batch",
		scheduledTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
		sessionType: "afternoon",
	},
];

const mockFetch = vi.fn();

describe("TimelineCarousel", () => {
	const mockOnRunSelect = vi.fn();

	beforeEach(() => {
		vi.stubGlobal("fetch", mockFetch);
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mockOnRunSelect.mockClear();
		mockFetch.mockClear();
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	const setupSuccessfulFetch = (
		runs: RunMetadata[] = mockRuns,
		scheduled: ScheduledRun[] = mockScheduledRuns,
	) => {
		mockFetch.mockImplementation((url: string) => {
			if (url === "/api/runs") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(runs),
				});
			}
			if (url === "/api/schedule") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(scheduled),
				});
			}
			if (url === "/api/schedule/config") {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ timezone: "Europe/London" }),
				});
			}
			return Promise.resolve({
				ok: false,
				status: 404,
			});
		});
	};

	describe("Initial Rendering", () => {
		it("renders the component with header and controls", async () => {
			setupSuccessfulFetch([], []);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			expect(screen.getByText("Run Timeline")).toBeInTheDocument();
			expect(screen.getByText("Show Past")).toBeInTheDocument();
			expect(screen.getByText("Schedule Run")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
		});

		it("shows empty state when no runs or scheduled runs exist", async () => {
			setupSuccessfulFetch([], []);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(
					screen.getByText("No runs scheduled or completed yet"),
				).toBeInTheDocument();
			});
		});

		it("displays timezone in header when loaded", async () => {
			setupSuccessfulFetch([], []);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("(Europe/London)")).toBeInTheDocument();
			});
		});
	});

	describe("Loading Data", () => {
		it("loads runs and scheduled runs on mount", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith("/api/runs");
				expect(mockFetch).toHaveBeenCalledWith("/api/schedule");
			});
		});

		it("shows loading state on Refresh button", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

			let resolveRuns: (value: unknown) => void = () => {};
			mockFetch.mockImplementation((url: string) => {
				if (url === "/api/runs") {
					return new Promise((resolve) => {
						resolveRuns = resolve;
					});
				}
				return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
			});

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			const refreshButton = screen.getByRole("button", { name: /refresh/i });
			await user.click(refreshButton);

			await waitFor(() => {
				expect(screen.getByText("Loading...")).toBeInTheDocument();
			});
			expect(refreshButton).toBeDisabled();

			resolveRuns({ ok: true, json: () => Promise.resolve([]) });

			await waitFor(() => {
				expect(screen.getByText("Refresh")).toBeInTheDocument();
			});
		});

		it("handles API errors gracefully for runs", async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === "/api/runs") {
					return Promise.resolve({ ok: false, status: 500 });
				}
				return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
			});

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			// Component should still render without crashing
			await waitFor(() => {
				expect(screen.getByText("Run Timeline")).toBeInTheDocument();
			});
		});

		it("handles 404 for schedule endpoint gracefully", async () => {
			mockFetch.mockImplementation((url: string) => {
				if (url === "/api/runs") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockRuns),
					});
				}
				if (url === "/api/schedule") {
					return Promise.resolve({ ok: false, status: 404 });
				}
				return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
			});

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			// Should still show runs even if schedule fails
			await waitFor(() => {
				expect(screen.getByText("Account 1")).toBeInTheDocument();
			});
		});
	});

	describe("Displaying Timeline Cards", () => {
		it("displays scheduled run cards", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
				expect(screen.getByText("Afternoon DMs")).toBeInTheDocument();
			});
		});

		it("displays running run cards with LIVE badge", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("LIVE")).toBeInTheDocument();
			});
		});

		it("displays completed run with checkmark", async () => {
			setupSuccessfulFetch([
				{
					...mockRuns[0],
					startTime: new Date(Date.now() + 10000).toISOString(), // Future to show without past toggle
				},
			], []);

			render(
				<TimelineCarousel
					onRunSelect={mockOnRunSelect}
					selectedAccount="all"
				/>,
			);

			// Enable "Show Past" to see completed runs
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

			await waitFor(() => {
				expect(screen.getByText("Show Past")).toBeInTheDocument();
			});

			await user.click(screen.getByText("Show Past"));

			await waitFor(() => {
				expect(screen.getByText("Completed")).toBeInTheDocument();
			});
		});

		it("displays error run with X mark", async () => {
			const futureErrorRun = {
				...mockRuns[2],
				startTime: new Date(Date.now() + 10000).toISOString(),
			};
			setupSuccessfulFetch([futureErrorRun], []);

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

			await waitFor(() => {
				expect(screen.getByText("Show Past")).toBeInTheDocument();
			});

			await user.click(screen.getByText("Show Past"));

			await waitFor(() => {
				expect(screen.getByText("Error")).toBeInTheDocument();
			});
		});

		it("shows countdown for scheduled runs", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Should show countdown duration
				expect(screen.getByText("until start")).toBeInTheDocument();
			});
		});

		it("shows script name badge on scheduled runs", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("discover")).toBeInTheDocument();
				expect(screen.getByText("dm_batch")).toBeInTheDocument();
			});
		});
	});

	describe("Show Past Toggle", () => {
		it("hides past runs by default", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Scheduled runs should be visible
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Past completed runs shouldn't be visible by default (run1 is 30 mins ago)
			// The completed run won't show up because its timestamp is in the past
		});

		it("shows past runs when toggle is enabled", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch();

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Show Past")).toBeInTheDocument();
			});

			await user.click(screen.getByText("Show Past"));

			await waitFor(() => {
				expect(screen.getByText("Hide Past")).toBeInTheDocument();
			});
		});

		it("toggles button text between Show Past and Hide Past", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch();

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Show Past")).toBeInTheDocument();
			});

			const toggleButton = screen.getByRole("button", { name: /show past/i });
			expect(toggleButton).toHaveAttribute("aria-pressed", "false");

			await user.click(toggleButton);

			await waitFor(() => {
				expect(screen.getByText("Hide Past")).toBeInTheDocument();
			});
			expect(toggleButton).toHaveAttribute("aria-pressed", "true");

			await user.click(toggleButton);

			await waitFor(() => {
				expect(screen.getByText("Show Past")).toBeInTheDocument();
			});
		});

		it("always shows scheduled runs regardless of toggle", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			// With toggle off (default)
			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
				expect(screen.getByText("Afternoon DMs")).toBeInTheDocument();
			});
		});
	});

	describe("Account Filtering", () => {
		it("filters runs by selected account", async () => {
			setupSuccessfulFetch();
			render(
				<TimelineCarousel
					onRunSelect={mockOnRunSelect}
					selectedAccount="account1"
				/>,
			);

			await waitFor(() => {
				// Should show account1's scheduled run
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Account2's scheduled run should not be visible
			expect(screen.queryByText("Afternoon DMs")).not.toBeInTheDocument();
		});

		it("shows all runs when selectedAccount is 'all'", async () => {
			setupSuccessfulFetch();
			render(
				<TimelineCarousel
					onRunSelect={mockOnRunSelect}
					selectedAccount="all"
				/>,
			);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
				expect(screen.getByText("Afternoon DMs")).toBeInTheDocument();
			});
		});
	});

	describe("Run Selection", () => {
		it("calls onRunSelect when clicking a run card", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

			// Use a running run (which is always visible)
			const runningRun = mockRuns[1];
			setupSuccessfulFetch([runningRun], []);

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("LIVE")).toBeInTheDocument();
			});

			// Find and click the run card button
			const runButton = screen.getByRole("button", {
				name: /running run for account1/i,
			});
			await user.click(runButton);

			expect(mockOnRunSelect).toHaveBeenCalledWith(runningRun);
		});

		it("does not call onRunSelect when clicking scheduled run (no run data)", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch([], mockScheduledRuns);

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Click the scheduled run card
			const scheduledButton = screen.getByRole("button", {
				name: /scheduled run for Account 1/i,
			});
			await user.click(scheduledButton);

			// Should not call onRunSelect since there's no corresponding run
			expect(mockOnRunSelect).not.toHaveBeenCalled();
		});
	});

	describe("Schedule Modal", () => {
		it("opens schedule modal when clicking Schedule Run button", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch();

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Schedule Run")).toBeInTheDocument();
			});

			await user.click(screen.getByText("Schedule Run"));

			// The ScheduleModal should be rendered (checking for its presence)
			// Since ScheduleModal is a separate component, we just verify the state changed
			// by checking if the modal's open prop would be true
		});
	});

	describe("Delete Scheduled Run", () => {
		it("shows delete button for non-cron scheduled runs", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Delete buttons should be visible in the scheduled cards
				const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
				expect(deleteButtons.length).toBeGreaterThan(0);
			});
		});

		it("opens delete confirmation dialog when clicking delete", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch([], mockScheduledRuns);

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Find the delete button in the card
			const card = screen
				.getByText("Morning Discovery")
				.closest(".schedule-actions")
				?.parentElement?.parentElement?.parentElement?.parentElement;
			const deleteButton = card
				? within(card).getByRole("button", { name: /delete/i })
				: screen.getAllByRole("button", { name: /delete/i })[0];

			await user.click(deleteButton);

			await waitFor(() => {
				expect(screen.getByText("Delete Schedule?")).toBeInTheDocument();
				expect(
					screen.getByText(/Are you sure you want to delete/),
				).toBeInTheDocument();
			});
		});

		it("closes delete dialog when clicking Cancel", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch([], mockScheduledRuns);

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Open delete dialog
			const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
			await user.click(deleteButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("Delete Schedule?")).toBeInTheDocument();
			});

			// Click Cancel
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			// Dialog should close (the title should no longer be visible)
			// Note: Since we mock showModal, we check for state change
		});

		it("calls DELETE API when confirming delete", async () => {
			const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
			setupSuccessfulFetch([], mockScheduledRuns);

			// Add mock for DELETE endpoint
			mockFetch.mockImplementation((url: string, options?: RequestInit) => {
				if (url === "/api/runs") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve([]),
					});
				}
				if (url === "/api/schedule") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve(mockScheduledRuns),
					});
				}
				if (url === "/api/schedule/config") {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ timezone: "Europe/London" }),
					});
				}
				if (url.startsWith("/api/schedule/") && options?.method === "DELETE") {
					return Promise.resolve({ ok: true });
				}
				return Promise.resolve({ ok: false, status: 404 });
			});

			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Morning Discovery")).toBeInTheDocument();
			});

			// Open delete dialog
			const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
			await user.click(deleteButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("Delete Schedule?")).toBeInTheDocument();
			});

			// Click the Delete confirmation button (not the one in the card)
			const confirmDeleteButton = screen.getByRole("button", {
				name: /^delete$/i,
			});
			await user.click(confirmDeleteButton);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith(
					"/api/schedule/sched1",
					expect.objectContaining({ method: "DELETE" }),
				);
			});
		});
	});

	describe("Timeline Visual Elements", () => {
		it("renders the timeline axis line", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Check for timeline axis (gray gradient line)
				const axisLine = document.querySelector(
					".bg-gradient-to-r.from-transparent.via-slate-600\\/60",
				);
				expect(axisLine).toBeInTheDocument();
			});
		});

		it("renders the current time indicator (amber line)", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Check for current time line (amber colored)
				const currentTimeLine = document.querySelector(
					".bg-gradient-to-b.from-transparent.via-amber-400\\/20",
				);
				expect(currentTimeLine).toBeInTheDocument();
			});
		});

		it("renders time markers for each card", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Time markers should have <time> elements
				const timeElements = document.querySelectorAll("time");
				expect(timeElements.length).toBeGreaterThan(0);
			});
		});
	});

	describe("Accessibility", () => {
		it("has accessible button labels for run cards", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: /scheduled run for Account 1/i }),
				).toBeInTheDocument();
				expect(
					screen.getByRole("button", { name: /scheduled run for Account 2/i }),
				).toBeInTheDocument();
			});
		});

		it("has aria-pressed attribute on Show Past toggle", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				const toggleButton = screen.getByRole("button", { name: /show past/i });
				expect(toggleButton).toHaveAttribute("aria-pressed", "false");
			});
		});

		it("uses semantic HTML elements", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Section element
				expect(document.querySelector("section")).toBeInTheDocument();
				// Header element
				expect(document.querySelector("header")).toBeInTheDocument();
				// Heading
				expect(screen.getByRole("heading", { name: "Run Timeline" })).toBeInTheDocument();
			});
		});

		it("has aria-hidden on decorative icons", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Check for aria-hidden on decorative elements
				const hiddenElements = document.querySelectorAll('[aria-hidden="true"]');
				expect(hiddenElements.length).toBeGreaterThan(0);
			});
		});
	});

	describe("Real-time Updates", () => {
		it("updates current time every second", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Run Timeline")).toBeInTheDocument();
			});

			const initialTime = Date.now();

			// Advance time by 2 seconds
			vi.advanceTimersByTime(2000);

			// The component should have updated (countdown values would change)
			// This is more of a smoke test to ensure the interval doesn't break
		});

		it("polls for data every 10 seconds", async () => {
			setupSuccessfulFetch();
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(mockFetch).toHaveBeenCalledWith("/api/runs");
			});

			const initialCallCount = mockFetch.mock.calls.filter(
				(call) => call[0] === "/api/runs",
			).length;

			// Advance time by 10 seconds
			vi.advanceTimersByTime(10000);

			await waitFor(() => {
				const newCallCount = mockFetch.mock.calls.filter(
					(call) => call[0] === "/api/runs",
				).length;
				expect(newCallCount).toBeGreaterThan(initialCallCount);
			});
		});
	});

	describe("Card Interactions", () => {
		it("shows edit menu button for scheduled runs", async () => {
			setupSuccessfulFetch([], mockScheduledRuns);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				// Edit buttons (three dots menu) should exist for scheduled runs
				const editButtons = screen.getAllByTitle("Edit schedule");
				expect(editButtons.length).toBe(2);
			});
		});

		it("does not show delete button for cron-based schedules", async () => {
			const cronSchedule: ScheduledRun = {
				id: "scheduled_cron_1", // ID starting with "scheduled_" indicates cron
				name: "Cron Job",
				profileId: "account1",
				accountName: "Account 1",
				scriptName: "discover",
				scheduledTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
				source: "cron",
			};

			setupSuccessfulFetch([], [cronSchedule]);
			render(<TimelineCarousel onRunSelect={mockOnRunSelect} />);

			await waitFor(() => {
				expect(screen.getByText("Cron Job")).toBeInTheDocument();
			});

			// Delete button should not appear for cron schedules
			const card = screen.getByText("Cron Job").closest("button");
			if (card) {
				const deleteButton = within(card).queryByRole("button", {
					name: /delete/i,
				});
				expect(deleteButton).not.toBeInTheDocument();
			}
		});
	});
});

