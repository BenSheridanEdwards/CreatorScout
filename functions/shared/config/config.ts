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
export const DELAYS: Record<string, [number, number]> = {
	// Navigation
	after_navigate: [2, 4],
	after_go_back: [2, 3],

	// Modal
	after_modal_open: [2, 4],
	after_modal_close: [1, 2],
	after_scroll: [0.5, 1.5],
	after_scroll_batch: [2, 4],

	// Input/Interaction
	after_click: [0.5, 1.5],
	after_type: [0.3, 0.8],
	after_linktree_click: [3, 5],
	mouse_wiggle: [0.7, 2.4],

	// Actions (higher risk - should be slower)
	after_message_open: [2, 4],
	after_dm_type: [1, 2],
	after_dm_send: [2, 4],
	after_follow: [1, 2],

	// Pacing
	between_profiles: [2, 6],
	between_seeds: [60, 180],
	queue_empty: [300, 300], // Fixed 5 min wait

	// Login
	after_credentials: [1.5, 3.5],
	after_login_submit: [4, 7],
	after_popup_dismiss: [0.7, 2.4],
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

// Base timeout values in milliseconds
export const TIMEOUTS: Record<string, number> = {
	// Page loads
	page_load: 30000,
	navigation: 20000,

	// Element waits
	element_default: 10000,
	element_modal: 5000,
	element_button: 3000,
	element_input: 5000,

	// Actions
	login: 15000,
	dm_send: 10000,
	follow: 3000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// API & CREDENTIALS
// ═══════════════════════════════════════════════════════════════════════════════

export const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const IG_USER = process.env.INSTAGRAM_USERNAME;
export const IG_PASS = process.env.INSTAGRAM_PASSWORD;

// ═══════════════════════════════════════════════════════════════════════════════
// PROXY CONFIGURATION (Optional - BrowserLess stealth includes residential proxies)
// ═══════════════════════════════════════════════════════════════════════════════

// Optional external proxy for API calls (vision analysis) - not needed with BrowserLess stealth
export const PROXY_URL = process.env.PROXY_URL;

// <<< BEST MODEL RIGHT NOW (Dec 2025) >>>
export const VISION_MODEL = "google/gemini-flash-1.5-exp"; // fastest + cheapest winner
// export const VISION_MODEL = 'google/gemini-pro-vision-2.5'; // max accuracy if you want
// export const VISION_MODEL = 'anthropic/claude-3-5-sonnet-20241022';

export const CONFIDENCE_THRESHOLD = 50;
export const MAX_DMS_PER_DAY = 120;
export const DM_MESSAGE =
	"Hey beautiful, loved your vibe — just followed you on OF too if you're there"; // change it
