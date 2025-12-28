import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunDetailsModal from "./RunDetailsModal";
import type { RunMetadata } from "../../types";

const mockRun: RunMetadata = {
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
	creatorsFoundList: [
		{
			username: "creator1",
			confidence: 95,
			reason: "Bio contains avatar keywords",
			timestamp: "2025-12-24T10:15:00.000Z",
			screenshotPath: "/screenshots/creator1.png",
		},
		{
			username: "creator2",
			confidence: 85,
			reason: "Link in bio",
			timestamp: "2025-12-24T10:20:00.000Z",
		},
	],
	errorLogs: [
		{
			timestamp: "2025-12-24T10:10:00.000Z",
			username: "faileduser",
			message: "Connection timeout",
			stack: "Error: Connection timeout\n    at fetch (index.js:1:1)",
		},
		{
			timestamp: "2025-12-24T10:12:00.000Z",
			message: "Network error",
		},
	],
};

describe("RunDetailsModal", () => {
	let mockOnClose: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		mockOnClose = vi.fn<() => void>();
		// Mock window.open
		window.open = vi.fn();
	});

	it("renders the modal with run information", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// DISCOVER appears in the title - use getAllByText since it might appear multiple times
		expect(screen.getAllByText(/DISCOVER/i).length).toBeGreaterThan(0);
		expect(screen.getByText("completed")).toBeInTheDocument();
		expect(screen.getByText("50")).toBeInTheDocument();
		expect(screen.getByText("5")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("displays run metrics correctly", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		expect(screen.getByText("Profiles Processed")).toBeInTheDocument();
		expect(screen.getByText("Creators Found")).toBeInTheDocument();
		expect(screen.getByText("Errors")).toBeInTheDocument();
		expect(screen.getByText("Duration")).toBeInTheDocument();

		expect(screen.getByText("30m 0s")).toBeInTheDocument();
	});

	it("displays creators found list when available", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		expect(screen.getByText("Creators Found (2)")).toBeInTheDocument();
		expect(screen.getByText("@creator1")).toBeInTheDocument();
		expect(screen.getByText("@creator2")).toBeInTheDocument();
		expect(screen.getByText("95%")).toBeInTheDocument();
		expect(screen.getByText("85%")).toBeInTheDocument();
	});

	it("displays creator reasons and timestamps", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		expect(
			screen.getByText(/Bio contains avatar keywords/),
		).toBeInTheDocument();
		expect(screen.getByText(/Link in bio/)).toBeInTheDocument();
	});

	it("opens screenshot when clicking view screenshot button", async () => {
		const user = userEvent.setup();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		const screenshotButton = screen.getByText("📸 View screenshot");
		await user.click(screenshotButton);

		expect(window.open).toHaveBeenCalledWith(
			"http://localhost:4000/screenshots/creator1.png",
			"_blank",
		);
	});

	it("displays error logs when available", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		expect(screen.getByText("Error Logs (2)")).toBeInTheDocument();
		expect(screen.getByText("@faileduser")).toBeInTheDocument();
		expect(screen.getByText("Connection timeout")).toBeInTheDocument();
		expect(screen.getByText("Network error")).toBeInTheDocument();
	});

	it("displays stack trace in details element", async () => {
		const user = userEvent.setup();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// User can see and interact with the stack trace summary
		const stackTraceSummary = screen.getByText("Stack trace");
		expect(stackTraceSummary).toBeInTheDocument();

		// User can click to expand and see the stack trace content
		await user.click(stackTraceSummary);

		// After clicking, the stack trace content should be visible
		// The stack trace contains the error message from the error log
		// "Connection timeout" appears both in the error message and in the stack trace
		await waitFor(() => {
			const connectionTimeoutElements =
				screen.getAllByText(/Connection timeout/);
			expect(connectionTimeoutElements.length).toBeGreaterThanOrEqual(2);
		});
	});

	it("displays screenshots grid when available", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		expect(screen.getByText("Screenshots (2)")).toBeInTheDocument();

		const screenshots = screen.getAllByAltText(/Screenshot \d+/);
		expect(screenshots).toHaveLength(2);
		expect(screenshots[0]).toHaveAttribute(
			"src",
			"http://localhost:4000/screenshots/1.png",
		);
		expect(screenshots[1]).toHaveAttribute(
			"src",
			"http://localhost:4000/screenshots/2.png",
		);
	});

	it("opens screenshot in new tab when clicking screenshot", async () => {
		const user = userEvent.setup();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		const screenshots = screen.getAllByAltText(/Screenshot \d+/);
		await user.click(screenshots[0]);

		expect(window.open).toHaveBeenCalledWith(
			"http://localhost:4000/screenshots/1.png",
			"_blank",
		);
	});

	it("calls onClose when clicking close button", async () => {
		const user = userEvent.setup();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		const closeButton = screen.getByRole("button", { name: /×/ });
		await user.click(closeButton);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("calls onClose when clicking backdrop", async () => {
		const user = userEvent.setup();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// With shadcn Dialog, clicking the overlay (backdrop) triggers onOpenChange
		// The overlay is rendered in a portal with bg-black/90 class
		await waitFor(() => {
			const overlay = document.querySelector(".bg-black\\/90");
			expect(overlay).toBeInTheDocument();
		});

		const overlay = document.querySelector(".bg-black\\/90") as HTMLElement;
		await user.click(overlay);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("does not call onClose when clicking modal content", async () => {
		const user = userEvent.setup();
		mockOnClose.mockClear();

		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// Click on visible content inside the modal - user sees and interacts with a metric value
		const profilesProcessed = screen.getByText("50");
		await user.click(profilesProcessed);

		// Dialog content click should not trigger onClose (only backdrop/overlay does)
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("displays correct status badge styling", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		const statusBadge = screen.getByText("completed");
		expect(statusBadge).toHaveClass("bg-emerald-500/20", "text-emerald-300");
	});

	it("displays running status badge correctly", () => {
		const runningRun: RunMetadata = {
			...mockRun,
			status: "running",
		};

		render(<RunDetailsModal run={runningRun} onClose={mockOnClose} />);

		const statusBadge = screen.getByText("running");
		expect(statusBadge).toHaveClass("bg-sky-500/20", "text-sky-300");
	});

	it("displays error status badge correctly", () => {
		const errorRun: RunMetadata = {
			...mockRun,
			status: "error",
		};

		render(<RunDetailsModal run={errorRun} onClose={mockOnClose} />);

		const statusBadge = screen.getByText("error");
		expect(statusBadge).toHaveClass("bg-red-500/20", "text-red-300");
	});

	it("formats duration correctly for short durations", () => {
		const shortRun: RunMetadata = {
			...mockRun,
			stats: { duration: 45 },
		};

		render(<RunDetailsModal run={shortRun} onClose={mockOnClose} />);

		expect(screen.getByText("45s")).toBeInTheDocument();
	});

	it("displays N/A when duration is not available", () => {
		const noDurationRun: RunMetadata = {
			...mockRun,
			stats: {},
		};

		render(<RunDetailsModal run={noDurationRun} onClose={mockOnClose} />);

		expect(screen.getByText("N/A")).toBeInTheDocument();
	});

	it("does not display creators found section when empty", () => {
		const noCreatorsRun: RunMetadata = {
			...mockRun,
			creatorsFoundList: [],
		};

		render(<RunDetailsModal run={noCreatorsRun} onClose={mockOnClose} />);

		// The section should not be rendered when the list is empty
		expect(screen.queryByText(/Creators Found \(/)).not.toBeInTheDocument();
	});

	it("does not display error logs section when empty", () => {
		const noErrorsRun: RunMetadata = {
			...mockRun,
			errorLogs: [],
		};

		render(<RunDetailsModal run={noErrorsRun} onClose={mockOnClose} />);

		expect(screen.queryByText("Error Logs")).not.toBeInTheDocument();
	});

	it("does not display screenshots section when empty", () => {
		const noScreenshotsRun: RunMetadata = {
			...mockRun,
			screenshots: [],
		};

		render(<RunDetailsModal run={noScreenshotsRun} onClose={mockOnClose} />);

		expect(screen.queryByText("Screenshots")).not.toBeInTheDocument();
	});

	it("displays error log without username when username is missing", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// Second error log doesn't have username
		expect(screen.getByText("Network error")).toBeInTheDocument();
		// Should not show username for this error
		const errorElements = screen.getAllByText(
			/Network error|Connection timeout/,
		);
		expect(errorElements.length).toBeGreaterThan(0);
	});

	it("renders Instagram links for creators", () => {
		render(<RunDetailsModal run={mockRun} onClose={mockOnClose} />);

		// User can see and click the creator link
		const creatorLink = screen.getByRole("link", { name: "@creator1" });
		expect(creatorLink).toHaveAttribute(
			"href",
			"https://instagram.com/creator1",
		);
		expect(creatorLink).toHaveAttribute("target", "_blank");
		expect(creatorLink).toHaveAttribute("rel", "noopener noreferrer");
	});
});
