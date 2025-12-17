/**
 * Profile Status Tests
 *
 * Pure function for parsing Instagram profile status from page body text:
 *
 * Function:
 * - parseProfileStatus(bodyText): Analyzes text for profile status indicators
 *   - isPrivate: true if "this account is private" found
 *   - notFound: true if page not found indicators present
 *
 * This is a pure function (no side effects) for easy testing and reuse.
 * It works by checking for specific Instagram error message patterns.
 */

import { parseProfileStatus } from "./profileStatus.ts";

describe("parseProfileStatus", () => {
	// ═══════════════════════════════════════════════════════════════════════════
	// Private Account Detection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Private account detection", () => {
		test("detects private account from standard Instagram message", () => {
			const text = "This account is private and you need to follow to see posts";
			const status = parseProfileStatus(text);

			expect(status.isPrivate).toBe(true);
			expect(status.notFound).toBe(false);
		});

		test("detects private with case-insensitive matching", () => {
			const text = "THIS ACCOUNT IS PRIVATE";
			const status = parseProfileStatus(text);

			expect(status.isPrivate).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Not Found Detection
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Profile not found detection", () => {
		test("detects 'page isn't available' message", () => {
			const text =
				"Sorry, this page isn't available because it may have been removed";
			const status = parseProfileStatus(text);

			expect(status.notFound).toBe(true);
			expect(status.isPrivate).toBe(false);
		});

		test("detects 'page not found' message", () => {
			const text = "Page not found - the link may be broken";
			const status = parseProfileStatus(text);

			expect(status.notFound).toBe(true);
		});

		test("detects 'profile isn't available' message", () => {
			const text = "This profile isn't available right now";
			const status = parseProfileStatus(text);

			expect(status.notFound).toBe(true);
		});

		test("detects 'may have been removed' message", () => {
			const text = "This content may have been removed by the user";
			const status = parseProfileStatus(text);

			expect(status.notFound).toBe(true);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Normal/Accessible Profiles
	// ═══════════════════════════════════════════════════════════════════════════

	describe("Normal profile handling", () => {
		test("returns both false for accessible public profile", () => {
			const status = parseProfileStatus("Welcome to an open profile bio");

			expect(status.isPrivate).toBe(false);
			expect(status.notFound).toBe(false);
		});

		test("handles empty text gracefully", () => {
			const status = parseProfileStatus("");

			expect(status.isPrivate).toBe(false);
			expect(status.notFound).toBe(false);
		});

		test("handles null/undefined input gracefully", () => {
			const nullStatus = parseProfileStatus(null as unknown as string);
			const undefinedStatus = parseProfileStatus(undefined as unknown as string);

			expect(nullStatus.isPrivate).toBe(false);
			expect(nullStatus.notFound).toBe(false);
			expect(undefinedStatus.isPrivate).toBe(false);
			expect(undefinedStatus.notFound).toBe(false);
		});
	});
});
