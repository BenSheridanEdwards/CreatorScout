import { jest } from "@jest/globals";
import {
	createPageMock,
	createPageWithElementMock,
} from "../../__test__/testUtils.ts";
import { getLinkFromBio } from "./getLinkFromBio.ts";

describe("getLinkFromBio", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("when link element is found", () => {
		test("extracts href from anchor element", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue("https://example.com"),
				}),
			});

			const result = await getLinkFromBio(page);
			expect(result).toBe("https://example.com");
		});

		test("returns null when href is empty", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue(""),
				}),
			});

			const result = await getLinkFromBio(page);
			expect(result).toBeNull();
		});

		test("returns null when href is null", async () => {
			const page = createPageMock({
				$: jest.fn<any>().mockResolvedValue({
					evaluate: jest.fn<any>().mockResolvedValue(null),
				}),
			});

			const result = await getLinkFromBio(page);
			expect(result).toBeNull();
		});
	});

	describe("when link element is not found", () => {
		test("returns null when selector fails", async () => {
			const page = createPageMock();
			const result = await getLinkFromBio(page);
			expect(result).toBeNull();
		});
	});

	describe("when element evaluation fails", () => {
		test("returns null on evaluation error", async () => {
			const linkElement = {
				evaluate: jest
					.fn<any>()
					.mockRejectedValue(new Error("Evaluation failed")),
			};
			const page = createPageWithElementMock({
				$: jest.fn<any>().mockResolvedValue(linkElement),
			});

			const result = await getLinkFromBio(page);
			expect(result).toBeNull();
		});
	});
});
