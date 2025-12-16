import dotenv from "dotenv";

dotenv.config();

function _flag(name: string, defaultVal: boolean = false): boolean {
	const val = process.env[name];
	if (val === undefined) {
		return defaultVal;
	}
	return ["1", "true", "yes", "y", "on"].includes(val.trim().toLowerCase());
}

function _float(name: string, defaultVal: number): number {
	const val = process.env[name];
	if (val === undefined) {
		return defaultVal;
	}
	try {
		return parseFloat(val);
	} catch {
		return defaultVal;
	}
}

// Feature flags / runtime tuning
export const FAST_MODE = _flag("FAST_MODE", false);
export const SKIP_VISION = _flag("SKIP_VISION", FAST_MODE);
export const LOCAL_BROWSER = _flag("LOCAL_BROWSER", FAST_MODE);

// ═══════════════════════════════════════════════════════════════════════════════
// DELAYS - Intentional waits for humanization & rate limiting
// ═══════════════════════════════════════════════════════════════════════════════

// Global multiplier (0.0 = instant, 1.0 = normal, 2.0 = extra cautious)
export const DELAY_SCALE = _float("DELAY_SCALE", FAST_MODE ? 0.2 : 1.0);
export const SLEEP_SCALE = DELAY_SCALE; // Legacy alias

// Per-category multipliers (stacks with DELAY_SCALE)
export const DELAY_SCALES = {
	navigation: _float("DELAY_SCALE_NAV", 1.0),
	modal: _float("DELAY_SCALE_MODAL", 1.0),
	input: _float("DELAY_SCALE_INPUT", 1.0),
	action: _float("DELAY_SCALE_ACTION", 1.0),
	pacing: _float("DELAY_SCALE_PACING", 1.0),
};

// Base delay values (min, max) in seconds - before scaling
// Based on human behavior studies and real usage patterns
export const DELAYS: Record<string, [number, number]> = {
	// Navigation - Page loads and major transitions
	after_navigate: [1.5, 3.5], // Faster, more confident
	after_go_back: [1.8, 3.2], // Slightly longer for back actions

	// Modal - Instagram modal interactions
	after_modal_open: [1.2, 2.8], // Quicker for expected modals
	after_modal_close: [0.8, 1.8], // Faster modal close
	after_scroll: [0.3, 1.2], // Shorter scroll delays
	after_scroll_batch: [1.5, 3.5], // Modal batch processing

	// Input/Interaction - Core interactions
	after_click: [0.2, 0.8], // Much faster - humans click quickly
	after_type: [0.1, 0.4], // Minimal delay after typing
	after_linktree_click: [2.5, 4.5], // Linktree loads slower
	mouse_wiggle: [0.5, 1.8], // More natural wiggle timing

	// Actions (higher risk - Instagram monitors these)
	after_message_open: [1.8, 3.5], // DM opening - careful
	after_dm_type: [0.8, 1.8], // After typing message
	after_dm_send: [1.5, 3.5], // After sending - wait for response
	after_follow: [0.8, 1.8], // Follow action timing

	// Pacing - Rate limiting and anti-detection
	between_profiles: [1.5, 4.5], // More variable profile timing
	between_seeds: [45, 150], // Shorter seed delays for efficiency
	queue_empty: [180, 300], // 3-5 min when queue empty

	// Login - Critical path, be more cautious
	after_credentials: [1.2, 2.8], // Username/password entry
	after_login_submit: [3.5, 6.5], // Wait for login processing
	after_popup_dismiss: [0.5, 1.8], // Quick popup dismissal
};

// Category mapping - which scale applies to which delay
export const DELAY_CATEGORIES: Record<string, keyof typeof DELAY_SCALES> = {
	// Navigation
	after_navigate: "navigation",
	after_go_back: "navigation",
	after_linktree_click: "navigation",

	// Modal
	after_modal_open: "modal",
	after_modal_close: "modal",
	after_scroll: "modal",
	after_scroll_batch: "modal",

	// Input
	after_click: "input",
	after_type: "input",
	mouse_wiggle: "input",
	after_credentials: "input",
	after_popup_dismiss: "input",

	// Actions (high risk)
	after_message_open: "action",
	after_dm_type: "action",
	after_dm_send: "action",
	after_follow: "action",
	after_login_submit: "action",

	// Pacing
	between_profiles: "pacing",
	between_seeds: "pacing",
	queue_empty: "pacing",
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEOUTS - Maximum wait before giving up (not for humanization)
// ═══════════════════════════════════════════════════════════════════════════════

export const TIMEOUT_SCALE = _float("TIMEOUT_SCALE", 1.0);

// Base timeout values in milliseconds - more realistic for modern web
export const TIMEOUTS: Record<string, number> = {
	// Page loads - Instagram loads relatively fast
	page_load: 25000, // Reduced from 30s - Instagram is fast
	navigation: 15000, // Reduced from 20s - profile switches are quick

	// Element waits - Instagram elements appear quickly
	element_default: 8000, // Reduced from 10s - elements load fast
	element_modal: 4000, // Reduced from 5s - modals are snappy
	element_button: 2500, // Reduced from 3s - buttons appear quickly
	element_input: 3500, // Reduced from 5s - inputs are responsive

	// Actions - Instagram actions are quick
	login: 12000, // Reduced from 15s - login is fast
	dm_send: 8000, // Reduced from 10s - DMs send quickly
	follow: 2500, // Reduced from 3s - follow is instant
};

// ═══════════════════════════════════════════════════════════════════════════════
// API & CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

export const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const IG_USER = process.env.INSTAGRAM_USERNAME;
export const IG_PASS = process.env.INSTAGRAM_PASSWORD;

// BrowserLess stealth includes residential proxies for all browser requests.
// No additional proxy configuration needed.

// <<< BEST MODEL RIGHT NOW (Dec 2025) >>>
export const VISION_MODEL = "google/gemini-flash-1.5-exp"; // fastest + cheapest winner
// export const VISION_MODEL = 'google/gemini-pro-vision-2.5'; // max accuracy if you want
// export const VISION_MODEL = 'anthropic/claude-3-5-sonnet-20241022';

export const CONFIDENCE_THRESHOLD = 50;
export const MAX_DMS_PER_DAY = 120;
export const DM_MESSAGE =
	"Hey beautiful, loved your vibe — just followed you on OF too if you're there"; // change it
