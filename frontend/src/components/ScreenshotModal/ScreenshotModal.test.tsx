import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScreenshotModal from "./ScreenshotModal";
import type { Screenshot } from "../../types";

const mockScreenshot: Screenshot = {
	username: "testcreator",
	type: "profile",
	date: "2025-12-24T10:00:00.000Z",
	path: "/screenshots/test.png",
	filename: "test.png",
};

describe("ScreenshotModal", () => {
	let mockOnClose: ReturnType<typeof vi.fn<() => void>>;

	beforeEach(() => {
		mockOnClose = vi.fn<() => void>();
	});

	it("renders the modal with screenshot information", () => {
		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		expect(screen.getByText("@testcreator")).toBeInTheDocument();
		expect(screen.getByText("profile")).toBeInTheDocument();
		expect(screen.getByAltText("testcreator")).toBeInTheDocument();
	});

	it("displays screenshot image with correct src", () => {
		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		const img = screen.getByAltText("testcreator");
		expect(img).toHaveAttribute(
			"src",
			"http://localhost:4000/screenshots/test.png",
		);
	});

	it("displays correct type badge for profile", () => {
		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		const badge = screen.getByText("profile");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveClass("bg-emerald-500/20", "text-emerald-300");
	});

	it("displays correct type badge for link", () => {
		const linkScreenshot: Screenshot = {
			...mockScreenshot,
			type: "link",
		};

		render(
			<ScreenshotModal screenshot={linkScreenshot} onClose={mockOnClose} />,
		);

		const badge = screen.getByText("link");
		expect(badge).toHaveClass("bg-purple-500/20", "text-purple-300");
	});

	it("displays formatted date", () => {
		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		const formattedDate = new Date("2025-12-24T10:00:00.000Z").toLocaleString();
		expect(screen.getByText(formattedDate)).toBeInTheDocument();
	});

	it("calls onClose when clicking close button", async () => {
		const user = userEvent.setup();

		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		const closeButton = screen.getByRole("button", { name: /×/ });
		await user.click(closeButton);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("calls onClose when clicking backdrop", async () => {
		const user = userEvent.setup();

		const { container } = render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		// User clicks on the dark backdrop area outside the modal content
		// The backdrop is the outermost div with the onClick handler
		const backdrop = container.firstChild as HTMLElement;
		expect(backdrop).toBeInTheDocument();

		// Click on the backdrop (but not on the modal content inside)
		await user.click(backdrop);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("does not call onClose when clicking modal content", async () => {
		const user = userEvent.setup();

		render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		// Click on visible content inside the modal - user clicks on the screenshot image
		const screenshot = screen.getByAltText("testcreator");
		await user.click(screenshot);

		// stopPropagation should prevent the click from reaching the backdrop
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("renders with different screenshot types", () => {
		const dmScreenshot: Screenshot = {
			...mockScreenshot,
			type: "dm",
			username: "dmcreator",
		};

		const { rerender } = render(
			<ScreenshotModal screenshot={mockScreenshot} onClose={mockOnClose} />,
		);

		expect(screen.getByText("@testcreator")).toBeInTheDocument();

		rerender(
			<ScreenshotModal screenshot={dmScreenshot} onClose={mockOnClose} />,
		);

		expect(screen.getByText("@dmcreator")).toBeInTheDocument();
		expect(screen.queryByText("@testcreator")).not.toBeInTheDocument();
	});
});
