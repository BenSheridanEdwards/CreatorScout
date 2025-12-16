/**
 * Proxy utilities for HTTP requests and API calls.
 * Provides proxy agent configuration for external API requests.
 */
import { HttpsProxyAgent } from "https-proxy-agent";
import { PROXY_URL } from "../config/config.ts";

/**
 * Get a proxy agent for HTTP/HTTPS requests.
 * Used for API calls that should go through the proxy (e.g., vision API).
 */
export function getProxyAgent() {
	if (!PROXY_URL) {
		return undefined;
	}

	try {
		return new HttpsProxyAgent(PROXY_URL);
	} catch (error) {
		console.warn("Failed to create proxy agent:", error);
		return undefined;
	}
}

/**
 * Create a fetch function that uses the proxy agent.
 * Useful for API calls that need to be proxied.
 */
export async function fetchWithProxy(
	url: string | URL,
	options: RequestInit = {},
): Promise<Response> {
	const agent = getProxyAgent();

	return fetch(url, {
		...options,
		// @ts-ignore - Agent is not in standard RequestInit but works with node-fetch
		agent,
	});
}
