import { jest } from "@jest/globals";
import type { Browser } from "puppeteer";

const mockConnect =
	jest.fn<
		(options: {
			browserWSEndpoint?: string;
			browserURL?: string;
		}) => Promise<Browser>
	>();

jest.unstable_mockModule("puppeteer", () => ({
	default: {
		connect: mockConnect,
	},
}));

jest.unstable_mockModule("../../shared/logger/logger.ts", () => ({
	createLogger: () => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

const { connectToGoLoginProfile, getGoLoginWebSocketUrl } = await import(
	"./goLoginConnector.ts"
);

describe("goLoginConnector", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("connects to remote GoLogin using browserWSEndpoint", async () => {
		const fakeBrowser = {
			pages: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
		} as unknown as Browser;
		mockConnect.mockResolvedValue(fakeBrowser);

		const browser = await connectToGoLoginProfile("token-123", {
			local: false,
		});
		expect(browser).toBe(fakeBrowser);
		expect(mockConnect).toHaveBeenCalledWith(
			expect.objectContaining({
				browserWSEndpoint:
					"wss://remote.gologin.com:443/connect?token=token-123",
			}),
		);
	});

	it("connects to local Orbita using browserURL (http)", async () => {
		const fakeBrowser = {
			pages: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
		} as unknown as Browser;
		mockConnect.mockResolvedValue(fakeBrowser);

		await connectToGoLoginProfile("token-ignored", {
			local: true,
			vpsIp: "1.2.3.4",
			localPort: 9222,
		});

		expect(mockConnect).toHaveBeenCalledWith(
			expect.objectContaining({
				browserURL: "http://1.2.3.4:9222",
			}),
		);
	});

	it("getGoLoginWebSocketUrl returns http URL for local", () => {
		expect(getGoLoginWebSocketUrl("x", true, "host", 9222)).toBe(
			"http://host:9222",
		);
	});
});
