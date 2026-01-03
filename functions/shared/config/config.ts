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
export const DEBUG_SCREENSHOTS = _flag("DEBUG_SCREENSHOTS", false);
export const PRIORITIZE_QUEUE_OVER_SEEDS = _flag(
	"PRIORITIZE_QUEUE_OVER_SEEDS",
	false,
);

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
// EFFICIENT DELAYS: Short for routine actions, longer only for high-risk (DMs)
// Target: 50-100 actions per 15-20 minute session
export const DELAYS: Record<string, [number, number]> = {
	// ═══ MICRO-DELAYS (0.5-2s) - Rapid actions ═══
	micro_delay: [0.5, 2], // Between rapid actions
	after_click: [0.3, 1], // Quick clicks
	after_type: [0.1, 0.4], // Minimal delay after typing
	like_action: [0.5, 2], // After liking a post

	// ═══ SHORT DELAYS (1-5s) - Routine actions ═══
	after_navigate: [1, 3], // Page navigation
	after_go_back: [1, 2.5], // Back navigation
	after_modal_open: [1, 2], // Modal opens
	after_modal_close: [0.5, 1.5], // Modal closes
	after_scroll: [1, 3], // Scroll pause (was 4-15s)
	after_scroll_batch: [1.5, 3], // Batch scroll processing
	page_load: [1, 3], // After page loads
	after_linktree_click: [1.5, 3], // External link loads
	mouse_wiggle: [0.3, 1.2], // Quick wiggle
	after_follow: [1, 5], // Follow action (was 30-90s)
	discovery_action: [1, 3], // Between discovery actions
	between_profiles: [1.5, 4], // Between profile visits

	// ═══ MEDIUM DELAYS (3-8s) - Engagement actions ═══
	reel_watch: [3, 8], // Watch reels/stories (was 8-25s)
	story_view: [3, 8], // View a story

	// ═══ LONGER DELAYS (10-30s) - HIGH-RISK actions (DMs) ═══
	after_message_open: [5, 10], // Opening DM thread
	after_dm_type: [2, 5], // After typing DM message
	after_dm_send: [5, 15], // After sending DM (matches plan: dm_after_send)
	dm_action: [10, 30], // Between DM actions

	// ═══ PACING - Rate limiting ═══
	between_seeds: [18, 36], // Between seed profiles (reduced by 60%, min 18s)
	queue_empty: [120, 240], // 2-4 min when queue empty

	// ═══ LOGIN - Critical path ═══
	after_credentials: [1, 2.5], // Username/password entry
	after_login_submit: [3, 5], // Wait for login processing
	after_popup_dismiss: [0.5, 1.5], // Quick popup dismissal
};

// Category mapping - which scale applies to which delay
export const DELAY_CATEGORIES: Record<string, keyof typeof DELAY_SCALES> = {
	// Navigation
	after_navigate: "navigation",
	after_go_back: "navigation",
	after_linktree_click: "navigation",
	page_load: "navigation",

	// Modal
	after_modal_open: "modal",
	after_modal_close: "modal",
	after_scroll: "modal",
	after_scroll_batch: "modal",

	// Input (micro-delays)
	micro_delay: "input",
	after_click: "input",
	after_type: "input",
	mouse_wiggle: "input",
	after_credentials: "input",
	after_popup_dismiss: "input",
	like_action: "input",

	// Actions (high risk - DMs)
	after_message_open: "action",
	after_dm_type: "action",
	after_dm_send: "action",
	dm_action: "action",
	after_follow: "action",
	after_login_submit: "action",
	discovery_action: "action",

	// Engagement
	reel_watch: "action",
	story_view: "action",

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

export const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN; // Legacy - kept for fallback
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const IG_USER = process.env.INSTAGRAM_USERNAME;
export const IG_PASS = process.env.INSTAGRAM_PASSWORD;

// ═══════════════════════════════════════════════════════════════════════════════
// ADSPOWER CONFIGURATION (RECOMMENDED)
// ═══════════════════════════════════════════════════════════════════════════════

// AdsPower Local API base URL (default: http://127.0.0.1:50325)
export const ADSPOWER_API_BASE =
	process.env.ADSPOWER_API_BASE || "http://127.0.0.1:50325";

// AdsPower API key (optional - only if API verification is enabled in AdsPower)
export const ADSPOWER_API_KEY = process.env.ADSPOWER_API_KEY;

// ═══════════════════════════════════════════════════════════════════════════════
// DECODO PROXY CONFIGURATION (RECOMMENDED)
// ═══════════════════════════════════════════════════════════════════════════════

export const DECODO_USERNAME = process.env.DECODO_USERNAME;
export const DECODO_PASSWORD = process.env.DECODO_PASSWORD;
export const DECODO_HOST = process.env.DECODO_HOST || "gate.decodo.net";
export const DECODO_PORT = parseInt(process.env.DECODO_PORT || "20011", 10);
export const DECODO_STICKY_SESSION_MIN = 20; // minutes
export const DECODO_STICKY_SESSION_MAX = 30;

// ═══════════════════════════════════════════════════════════════════════════════
// SMARTPROXY CONFIGURATION (LEGACY)
// ═══════════════════════════════════════════════════════════════════════════════

export const SMARTPROXY_USERNAME = process.env.SMARTPROXY_USERNAME;
export const SMARTPROXY_PASSWORD = process.env.SMARTPROXY_PASSWORD;
export const SMARTPROXY_HOST =
	process.env.SMARTPROXY_HOST || "gate.smartproxy.com";
export const SMARTPROXY_PORT = parseInt(
	process.env.SMARTPROXY_PORT || "7000",
	10,
);
export const SMARTPROXY_STICKY_SESSION_MIN = 15; // minutes
export const SMARTPROXY_STICKY_SESSION_MAX = 30;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

// Main accounts (high-trust) - light use
export const MAIN_PROFILE_FOLLOWS_PER_WEEK = 10;
export const MAIN_PROFILE_DMS_PER_DAY = 15;
export const MAIN_PROFILE_DISCOVERIES_PER_DAY = 100;

// Burner accounts - heavy outbound
export const BURNER_PROFILE_FOLLOWS_PER_DAY_MIN = 80;
export const BURNER_PROFILE_FOLLOWS_PER_DAY_MAX = 150;
export const BURNER_PROFILE_DMS_PER_DAY_START = 30;
export const BURNER_PROFILE_DMS_PER_DAY_MAX = 80;
export const BURNER_PROFILE_DMS_RAMP_UP = 5; // +5 every 3 days
export const BURNER_PROFILE_DISCOVERIES_PER_DAY = 2000;

// New burner limits (first 7 days) - 50% of aged limits
export const NEW_BURNER_LIMIT_MULTIPLIER = 0.5;
export const NEW_BURNER_PERIOD_DAYS = 7;

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const SESSION_DURATION_MIN = 15; // minutes
export const SESSION_DURATION_MAX = 20;
export const SESSIONS_PER_DAY = 3;
export const SESSION_STAGGER_MINUTES = 5; // Between profiles
export const TOTAL_SESSION_TIME_PER_DAY = 45; // minutes per account

// ═══════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT & WARM-UP
// ═══════════════════════════════════════════════════════════════════════════════

export const WARMUP_DURATION_MINUTES = 1.5; // Quick warm-up
export const ENGAGEMENT_RATIO_MIN = 3; // 3:1 engagement to outbound
export const ENGAGEMENT_RATIO_MAX = 4; // 4:1 for safety
export const TARGET_ACTIONS_PER_SESSION = 75; // 50-100 actions per session

// <<< BEST MODEL RIGHT NOW (Dec 2025) >>>
export const VISION_MODEL = "google/gemini-2.0-flash-exp:free"; // Free tier works!
export const VISION_MODEL_FALLBACK = "openai/gpt-4o-mini"; // Reliable paid fallback when rate limited
// Other options:
// export const VISION_MODEL_FALLBACK = 'anthropic/claude-3-5-sonnet'; // More expensive but very accurate

export const CONFIDENCE_THRESHOLD = 70;
export const MAX_DMS_PER_DAY = 120;
export const DM_MESSAGE =
	"Hey beautiful, loved your vibe — just followed you on OF too if you're there"; // change it
