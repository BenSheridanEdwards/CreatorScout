import { API_BASE_URL } from './api';

/**
 * Get the full URL for an image/screenshot path
 * In production, images are served from the VPS via the API URL (Cloudflare tunnel)
 * In development, images are served from localhost:4000
 */
export function getImageUrl(path: string): string {
	// Remove leading slash if present (we'll add it back)
	const cleanPath = path.startsWith("/") ? path : `/${path}`;

	// In development, use localhost:4000 (backend server)
	if (import.meta.env.DEV) {
		return `http://localhost:4000${cleanPath}`;
	}

	// In production, use the API base URL (Cloudflare tunnel to VPS)
	// This ensures images are fetched from the VPS, not Vercel
	return `${API_BASE_URL}${cleanPath}`;
}
