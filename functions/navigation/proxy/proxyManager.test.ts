import { describe, test, expect, beforeEach } from "@jest/globals";
import { ProxyManager } from "./proxyManager.ts";

describe("ProxyManager", () => {
	let proxyManager: ProxyManager;

	beforeEach(() => {
		proxyManager = new ProxyManager({
			host: "gate.smartproxy.com",
			port: 7000,
			username: "test_user",
			password: "test_pass",
			stickySessionMinutes: 20,
		});
	});

	describe("getSession", () => {
		test("creates a new session if none exists", () => {
			const session = proxyManager.getSession();
			expect(session).toBeTruthy();
			expect(session.sessionId).toBeTruthy();
			expect(session.sessionId).toHaveLength(10);
			expect(session.createdAt).toBeInstanceOf(Date);
			expect(session.expiresAt).toBeInstanceOf(Date);
		});

		test("returns same session if not expired", () => {
			const session1 = proxyManager.getSession();
			const session2 = proxyManager.getSession();
			expect(session1.sessionId).toBe(session2.sessionId);
		});

		test("creates new session if expired", () => {
			// Create short-lived session
			const shortProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
				stickySessionMinutes: 0.001, // 0.06 seconds
			});

			const session1 = shortProxyManager.getSession();

			// Wait for expiry
			return new Promise((resolve) => {
				setTimeout(() => {
					const session2 = shortProxyManager.getSession();
					expect(session2.sessionId).not.toBe(session1.sessionId);
					resolve(undefined);
				}, 100);
			});
		});
	});

	describe("getProxyUrl", () => {
		test("formats proxy URL correctly", () => {
			const url = proxyManager.getProxyUrl();
			expect(url).toMatch(
				/^http:\/\/test_user-session-[a-f0-9]{10}:test_pass@gate\.smartproxy\.com:7000$/,
			);
		});

		test("includes country in URL when specified", () => {
			const geoProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
				country: "us",
			});

			const url = geoProxyManager.getProxyUrl();
			expect(url).toContain("-country-us");
		});

		test("includes city in URL when specified", () => {
			const geoProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
				city: "newyork",
			});

			const url = geoProxyManager.getProxyUrl();
			expect(url).toContain("-city-newyork");
		});

		test("includes both country and city when specified", () => {
			const geoProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
				country: "us",
				city: "newyork",
			});

			const url = geoProxyManager.getProxyUrl();
			expect(url).toContain("-country-us");
			expect(url).toContain("-city-newyork");
		});
	});

	describe("getProxyCredentials", () => {
		test("returns credentials object", () => {
			const creds = proxyManager.getProxyCredentials();
			expect(creds.server).toBe("gate.smartproxy.com:7000");
			expect(creds.username).toMatch(/^test_user-session-[a-f0-9]{10}$/);
			expect(creds.password).toBe("test_pass");
		});
	});

	describe("rotateSession", () => {
		test("forces creation of new session", () => {
			const session1 = proxyManager.getSession();
			const session2 = proxyManager.rotateSession();
			expect(session2.sessionId).not.toBe(session1.sessionId);
		});
	});

	describe("getTimeRemaining", () => {
		test("returns time remaining in minutes", () => {
			proxyManager.getSession();
			const remaining = proxyManager.getTimeRemaining();
			expect(remaining).toBeGreaterThan(0);
			expect(remaining).toBeLessThanOrEqual(20);
		});

		test("returns 0 if no session", () => {
			const newProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
			});
			// Don't create session
			expect(newProxyManager.getTimeRemaining()).toBe(0);
		});
	});

	describe("getSessionInfo", () => {
		test("returns session info", () => {
			proxyManager.getSession();
			const info = proxyManager.getSessionInfo();
			expect(info).toBeTruthy();
			expect(info?.sessionId).toBeTruthy();
		});

		test("returns null if no session", () => {
			const newProxyManager = new ProxyManager({
				host: "gate.smartproxy.com",
				port: 7000,
				username: "test_user",
				password: "test_pass",
			});
			expect(newProxyManager.getSessionInfo()).toBeNull();
		});
	});
});



