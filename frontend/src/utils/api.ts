/**
 * API Configuration
 *
 * In production, API calls go directly to the configured API URL with auth.
 * In development, Vite proxy handles /api requests (no auth needed for localhost).
 */

// API base URL - set via environment variable in Vercel
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// API key for authentication - set via environment variable in Vercel
const API_KEY = import.meta.env.VITE_API_KEY || '';

/**
 * Get headers with authentication
 */
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  return headers;
}

/**
 * Make an API request with proper base URL and auth handling
 */
export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = endpoint.startsWith('/api')
    ? `${API_BASE_URL}${endpoint}`
    : `${API_BASE_URL}/api${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get full API URL for an endpoint
 */
export function getApiUrl(endpoint: string): string {
  if (endpoint.startsWith('/api')) {
    return `${API_BASE_URL}${endpoint}`;
  }
  return `${API_BASE_URL}/api${endpoint}`;
}

/**
 * Fetch wrapper that adds auth headers automatically
 */
export async function apiFetch(
  endpoint: string,
  options?: RequestInit,
): Promise<Response> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : endpoint.startsWith('/api')
      ? `${API_BASE_URL}${endpoint}`
      : `${API_BASE_URL}/api${endpoint}`;

  return fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });
}

/**
 * Get WebSocket URL for an endpoint
 * Converts the API base URL to a WebSocket URL
 */
export function getWsUrl(endpoint: string): string {
  // If no API_BASE_URL, use current location (local dev)
  if (!API_BASE_URL) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${endpoint}`;
  }

  // Convert https:// to wss:// or http:// to ws://
  const wsBase = API_BASE_URL.replace(/^https:/, 'wss:').replace(
    /^http:/,
    'ws:',
  );

  return `${wsBase}${endpoint}`;
}
