import { jest } from "@jest/globals";

jest.unstable_mockModule("../config/config.ts", () => ({
	SMARTPROXY_USERNAME: "u",
	SMARTPROXY_PASSWORD: "p",
	SMARTPROXY_HOST: "gate.smartproxy.com",
	SMARTPROXY_PORT: 7000,
	SMARTPROXY_STICKY_SESSION_MIN: 15,
	SMARTPROXY_STICKY_SESSION_MAX: 30,
	DEBUG_SCREENSHOTS: false,
}));

jest.unstable_mockModule("../logger/logger.ts", () => ({
	createLogger: () => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

const {
	getProxyForProfile,
	rotateProxy,
	getProxyUrl,
	isProxySessionValid,
	getProxySessionRemainingMinutes,
	clearAllProxySessions,
} = await import("./smartproxy.ts");

describe("smartproxy", () => {
	beforeEach(() => {
		clearAllProxySessions();
	});

	it("creates and caches a sticky session per profile", async () => {
		const p1 = await getProxyForProfile("profile-1", "US");
		const p2 = await getProxyForProfile("profile-1", "US");

		expect(p1.stickySession).toBe(p2.stickySession);
		expect(p1.host).toBe("gate.smartproxy.com");
		expect(p1.port).toBe(7000);
		expect(isProxySessionValid("profile-1")).toBe(true);
		expect(getProxyUrl(p1)).toContain("http://user-u-session-");
	});

	it("rotates proxy by creating a new sticky session", async () => {
		const p1 = await getProxyForProfile("profile-2");
		const p2 = await rotateProxy("profile-2");
		expect(p1.stickySession).not.toBe(p2.stickySession);
	});

	it("returns remaining minutes as a non-negative number", async () => {
		await getProxyForProfile("profile-3");
		const remaining = getProxySessionRemainingMinutes("profile-3");
		expect(remaining).toBeGreaterThanOrEqual(0);
	});
});
