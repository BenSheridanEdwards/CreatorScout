/**
 * Get the full URL for an image/screenshot path
 * Uses relative paths in production, or window.location.origin for absolute URLs
 */
export function getImageUrl(path: string): string {
	// Remove leading slash if present (we'll add it back)
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	
	// In development, vite proxy handles /api, but images are served directly
	// In production, use relative paths or window.location.origin
	if (import.meta.env.DEV) {
		// Development: use localhost:4000 (backend server)
		return `http://localhost:4000${cleanPath}`;
	}
	
	// Production: use relative path or window.location.origin
	// This works because the backend serves static files from the same origin
	return cleanPath;
}


