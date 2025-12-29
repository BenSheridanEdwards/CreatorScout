# Scripts & Humanization Elements - Bird's Eye View

## 📋 Executive Summary

This document provides a comprehensive overview of all scripts in the codebase and the humanization elements they use. The goal is to categorize scripts by function and identify opportunities to better distribute and organize humanization utilities.

---

## 📁 Scripts Inventory

### **Core Discovery & Processing Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `scrape.ts` | Main discovery loop - BFS through following lists | `getDelay()`, `mouseWiggle()`, `humanScroll()`, `performRandomEngagement()` |
| `scrapeWithLogging.ts` | Enhanced version with detailed logging | Same as `scrape.ts` |
| `discover.ts` | Discovery-focused script | `getDelay()`, `sleep()` |
| `process_profiles.ts` | Batch profile processing | `getDelay()`, `sleep()` |

### **DM & Messaging Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `dm_batch.ts` | Send DMs to multiple users | `randomDelay()` (10-30s between DMs) |
| `dm_user.ts` | Send single DM | Likely uses DM navigation functions |
| `send_dms_to_known_creators.ts` | DM known creators from DB | Likely uses DM navigation functions |

### **Evaluation & Analysis Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `eval_batch.ts` | Evaluate multiple profiles | None (analysis-only) |
| `eval_profile.ts` | Evaluate single profile | None (analysis-only) |
| `analyze_profile.ts` | Profile analysis | None (analysis-only) |
| `check_profile.ts` | Quick profile check | None (analysis-only) |
| `reanalyze_profiles.ts` | Re-analyze existing profiles | None (analysis-only) |

### **Profile Management Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `follow_user.ts` | Follow a single user | Likely uses `humanClickElement()` |
| `get_following.ts` | Get following list | None (data extraction) |
| `list_profiles.ts` | List available profiles | None (data listing) |
| `list_adspower_profiles.ts` | List AdsPower profiles | None (data listing) |

### **Session & Scheduling Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `cron/sessionRunner.ts` | Run scheduled sessions | `warmUpProfile()` |
| `cron/smartSessionRunner.ts` | Smart session runner | `warmUpProfile()` |
| `cron/rampUpLimits.ts` | Calculate ramp-up limits | None (calculation) |
| `cron/resetDailyCounters.ts` | Reset daily counters | None (DB operation) |

### **Testing Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `test_profile.ts` | Test profile operations | `warmUpProfile()` |
| `test_single_profile.ts` | Test single profile | `sleep()` |
| `test_random_engagement.ts` | Test engagement patterns | `sleep()` |
| `test_enhanced_run.ts` | Test enhanced run tracking | None |
| `test_graceful_shutdown.ts` | Test shutdown handling | None |
| `test_instagram_loads.ts` | Test Instagram loading | None |
| `test_proxy.ts` | Test proxy connection | None |
| `test_adspower_connection.ts` | Test AdsPower API | None |
| `test_adspower_simple.ts` | Simple AdsPower test | None |
| `test_dm_variation.ts` | Test DM variations | None |
| `test_run_tracking.ts` | Test run tracking | None |
| `test/ramp_up_test.ts` | Test ramp-up logic | `randomDelay()`, `warmUpProfile()` |
| `test/test_profile.ts` | Test profile functions | None |

### **Utility Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `dashboard.ts` | Dashboard/UI | `sleep()` |
| `health_check.ts` | Health check endpoint | None |
| `login_screenshot.ts` | Capture login screenshots | None |
| `open_inbox.ts` | Open DM inbox | None |
| `manual_override.ts` | Manual database overrides | None |
| `migrate_false_positives.ts` | Database migration | None |
| `monitoring/costMonitor.ts` | Monitor API costs | None |

### **Deployment Scripts**
| Script | Purpose | Humanization Used |
|--------|---------|-------------------|
| `deploy/app-setup.sh` | Application setup | None (shell script) |
| `deploy/vps-initial-setup.sh` | VPS initial setup | None (shell script) |
| `deploy/vps-setup.sh` | VPS setup | None (shell script) |

---

## 🎭 Humanization Elements Inventory

### **1. Timing & Delays** (`functions/timing/humanize/humanize.ts`)

#### **Delay Functions**
- **`delay(name: string)`** - Named delay from config (e.g., `delay("after_follow")`)
- **`randomDelay(min, max)`** - Simple random delay between min-max seconds
- **`microDelay(min?, max?)`** - Quick delays (0.5-2s default) for rapid actions
- **`shortDelay(min?, max?)`** - Routine delays (1-5s default) for follows, discovery
- **`mediumDelay(min?, max?)`** - Engagement delays (3-8s default) for reels/stories
- **`longDelay(min?, max?)`** - High-risk delays (10-30s default) for DMs
- **`gaussianDelay(min, max)`** - Gaussian distribution for high-risk actions (DMs)

#### **Delay Configuration** (`functions/shared/config/config.ts`)
- **`DELAYS`** - Named delay ranges (micro, short, medium, long)
- **`DELAY_SCALE`** - Global speed multiplier (env: `DELAY_SCALE`)
- **`DELAY_SCALES`** - Category-specific scales (navigation, modal, input, action, pacing)
- **`DELAY_CATEGORIES`** - Maps delay names to categories

#### **Usage Patterns**
```typescript
// Named delays (most common)
await delay("after_follow");
await delay("after_scroll");
await delay("dm_action");

// Direct delays (for custom timing)
await randomDelay(10, 30);  // DM delays
await shortDelay(1, 5);      // Follow delays
await longDelay(10, 30);      // DM delays
```

### **2. Mouse Movement & Clicks** (`functions/timing/humanize/humanize.ts`)

#### **Ghost-Cursor Integration**
- **`getGhostCursor(page)`** - Cached cursor instance per page
- **`moveMouseToElement(page, selector, options)`** - Smooth Bezier movement to element
- **`humanClickElement(page, selector, options)`** - Human-like click with movement
- **`humanHoverElement(page, selector, duration)`** - Hover with realistic timing

#### **ElementHandle Support** (`functions/navigation/humanClick/humanClick.ts`)
- **`humanLikeClickHandle(page, handle, options)`** - Click ElementHandle with ghost-cursor
- **`humanLikeClickAt(page, x, y, options)`** - Click at coordinates

#### **Context-Aware Timing**
- **`getContextualHoverDelay(elementType, override?)`** - Element-specific hover delays:
  - **Buttons**: 80-230ms (quick, confident)
  - **Links**: 50-170ms (very quick)
  - **Inputs**: 120-320ms (careful, deliberate)
  - **Generic**: 100-300ms (standard)

#### **Usage Patterns**
```typescript
// Click with element type awareness
await humanClickElement(page, 'button.submit', {
  elementType: 'button',  // Faster timing
  hoverDelay: 100
});

// Click ElementHandle (from page.$$())
await humanLikeClickHandle(page, buttonHandle, {
  elementType: 'input'  // Slower timing
});
```

### **3. Typing & Text Input** (`functions/timing/humanize/humanize.ts`)

#### **Human Typing**
- **`humanTypeText(page, selector, text, options)`** - Realistic typing with:
  - Variable character delays (80-180ms base)
  - Capital letter delays (+30-80ms for Shift)
  - Word boundary pauses (slower at start/end)
  - Cognitive pauses (5% chance of 100-300ms)
  - Typo simulation (2% default, with backspace correction)
  - Word spacing (200ms + random)

#### **Usage Patterns**
```typescript
// Normal typing (with typos)
await humanTypeText(page, 'input.message', 'Hello world');

// Sensitive fields (no typos)
await humanTypeText(page, 'input.password', 'secret', {
  mistakeRate: 0
});

// Custom timing
await humanTypeText(page, 'input.search', 'query', {
  typeDelay: 100,      // Slower typing
  wordPause: 300,      // Longer pauses
  mistakeRate: 0.01    // Lower typo rate
});
```

### **4. Scrolling & Navigation** (`functions/timing/humanize/humanize.ts`)

#### **Human Scrolling**
- **`humanScroll(page, times?)`** - Natural scrolling with pauses
  - Random scroll amounts (300-700px)
  - Uses `delay("after_scroll")` between scrolls
  - Adaptive count based on `DELAY_SCALE`

#### **Mouse Wiggle**
- **`mouseWiggle(page)`** - Random mouse movement to simulate activity
  - 15-36 steps (or 8-21 in fast mode)
  - Random coordinates (200-1600x, 200-900y)

#### **Usage Patterns**
```typescript
// Natural scrolling
await humanScroll(page, 3);  // 3 scrolls
await humanScroll(page);      // Auto-count based on DELAY_SCALE

// Mouse activity
await mouseWiggle(page);
```

### **5. Random Engagement** (`functions/profile/profileActions/randomEngagement.ts`)

#### **Engagement Actions**
- **`performRandomEngagement(page, username)`** - Random profile engagement:
  - 20% No action (quick check)
  - 30% View post (2-4s)
  - 20% Watch reel (5-12s)
  - 15% Like post (1-2s)
  - 15% Scroll feed (1-3s)

#### **Helper Functions**
- **`viewRandomPost(page, username)`** - View a random post
- **`watchRandomReel(page, username)`** - Watch a random reel
- **`likeRandomPost(page, username)`** - Like a random post
- **`scrollProfileFeed(page, username)`** - Scroll profile feed
- **`shouldEngageOnProfile(bioScore)`** - Decision function (50-75% based on score

#### **Usage Patterns**
```typescript
// Random engagement on profile
const engagement = await performRandomEngagement(page, username);

// Decision-based engagement
if (shouldEngageOnProfile(bioScore)) {
  await performRandomEngagement(page, username);
}
```

### **6. Engagement Tracking** (`functions/shared/engagement/engagementTracker.ts`)

#### **Engagement Tracker**
- **`EngagementTracker`** - Tracks engagement:outbound ratio (3:1 to 4:1)
- **`batchEngagements(page, tracker, count?)`** - Perform batch of quick engagements:
  - 60% scrolls (quickest)
  - 30% likes
  - 10% views/reels

#### **Usage Patterns**
```typescript
const tracker = new EngagementTracker();
await batchEngagements(page, tracker, 10);  // 10 quick engagements
```

### **7. Warm-up** (`functions/timing/warmup/warmup.ts`)

#### **Profile Warm-up**
- **`warmUpProfile(page, duration?)`** - Warm-up session (1.5 min default):
  - Scroll feed
  - Watch reels
  - Like posts
  - Returns warm-up statistics

#### **Usage Patterns**
```typescript
// Standard warm-up (1.5 min)
const stats = await warmUpProfile(page);

// Custom duration
const stats = await warmUpProfile(page, 120);  // 2 minutes
```

### **8. Natural Behavior Simulation** (`functions/navigation/profileNavigation/dmNavigation.ts`)

#### **DM Navigation**
- **`simulateNaturalBehavior(page)`** - Natural behavior before DM actions:
  - Random mouse movements
  - Brief pauses
  - Scroll actions

---

## 📊 Humanization Usage by Script Category

### **High Humanization** (Uses multiple elements)
- ✅ `scrape.ts` - Core discovery (delays, mouse wiggle, scrolling, random engagement)
- ✅ `scrapeWithLogging.ts` - Same as scrape.ts
- ✅ `dm_batch.ts` - DM batching (long delays between DMs)

### **Medium Humanization** (Uses some elements)
- ⚠️ `discover.ts` - Discovery (delays only)
- ⚠️ `process_profiles.ts` - Batch processing (delays only)
- ⚠️ `cron/sessionRunner.ts` - Session runner (warm-up)
- ⚠️ `cron/smartSessionRunner.ts` - Smart runner (warm-up)

### **Low/No Humanization** (Analysis/utility scripts)
- ❌ `eval_batch.ts` - Analysis only
- ❌ `eval_profile.ts` - Analysis only
- ❌ `analyze_profile.ts` - Analysis only
- ❌ `check_profile.ts` - Quick check
- ❌ `list_profiles.ts` - Data listing
- ❌ `get_following.ts` - Data extraction
- ❌ All test scripts (except engagement tests)

---

## 🎯 Categorization Plan

### **Category 1: Core Discovery Scripts**
**Location**: `scripts/core/` (new directory)
- `scrape.ts` → `core/discovery.ts`
- `scrapeWithLogging.ts` → `core/discovery-logged.ts`
- `discover.ts` → `core/discover.ts`
- `process_profiles.ts` → `core/process-batch.ts`

**Humanization Strategy**: Full suite
- Delays (named + direct)
- Mouse movement (wiggle, clicks)
- Scrolling (human scroll)
- Random engagement
- Engagement tracking

### **Category 2: Messaging Scripts**
**Location**: `scripts/messaging/` (new directory)
- `dm_batch.ts` → `messaging/batch.ts`
- `dm_user.ts` → `messaging/single.ts`
- `send_dms_to_known_creators.ts` → `messaging/known-creators.ts`

**Humanization Strategy**: High-risk focus
- Long delays (10-30s) between DMs
- Gaussian delays for DMs
- Natural behavior simulation before DMs
- Context-aware typing (no typos in DMs)

### **Category 3: Analysis Scripts**
**Location**: `scripts/analysis/` (new directory)
- `eval_batch.ts` → `analysis/batch.ts`
- `eval_profile.ts` → `analysis/single.ts`
- `analyze_profile.ts` → `analysis/analyze.ts`
- `check_profile.ts` → `analysis/check.ts`
- `reanalyze_profiles.ts` → `analysis/reanalyze.ts`

**Humanization Strategy**: Minimal
- Only navigation delays (if needed)
- No engagement (read-only)

### **Category 4: Profile Management**
**Location**: `scripts/profiles/` (new directory)
- `follow_user.ts` → `profiles/follow.ts`
- `get_following.ts` → `profiles/get-following.ts`
- `list_profiles.ts` → `profiles/list.ts`
- `list_adspower_profiles.ts` → `profiles/list-adspower.ts`

**Humanization Strategy**: Medium
- Short delays for follows
- Human clicks for buttons
- Mouse wiggle after actions

### **Category 5: Session Management**
**Location**: `scripts/sessions/` (new directory)
- `cron/sessionRunner.ts` → `sessions/runner.ts`
- `cron/smartSessionRunner.ts` → `sessions/smart-runner.ts`
- `cron/rampUpLimits.ts` → `sessions/ramp-up.ts`
- `cron/resetDailyCounters.ts` → `sessions/reset-counters.ts`

**Humanization Strategy**: Warm-up focus
- Warm-up before sessions
- Engagement tracking
- Ramp-up limits

### **Category 6: Testing**
**Location**: `scripts/test/` (keep existing)
- All `test_*.ts` scripts
- `test/` subdirectory scripts

**Humanization Strategy**: As needed
- Test-specific humanization
- Mock delays for speed

### **Category 7: Utilities**
**Location**: `scripts/utils/` (new directory)
- `dashboard.ts` → `utils/dashboard.ts`
- `health_check.ts` → `utils/health.ts`
- `login_screenshot.ts` → `utils/login-screenshot.ts`
- `open_inbox.ts` → `utils/open-inbox.ts`
- `manual_override.ts` → `utils/manual-override.ts`
- `migrate_false_positives.ts` → `utils/migrate.ts`
- `monitoring/costMonitor.ts` → `utils/monitoring/cost.ts`

**Humanization Strategy**: None (utility scripts)

### **Category 8: Deployment**
**Location**: `scripts/deploy/` (keep existing)
- All `deploy/*.sh` scripts

**Humanization Strategy**: None (shell scripts)

---

## 🔄 Distribution Strategy

### **Phase 1: Create Shared Humanization Utilities**

#### **1.1 Core Timing Module** (`functions/timing/`)
- ✅ Already exists: `humanize.ts` (comprehensive)
- ✅ Already exists: `sleep.ts` (basic sleep)
- ✅ Already exists: `warmup.ts` (warm-up)

#### **1.2 Navigation Humanization** (`functions/navigation/`)
- ✅ Already exists: `humanClick/humanClick.ts` (ElementHandle support)
- ✅ Already exists: `dmNavigation.ts` (DM-specific behavior)

#### **1.3 Engagement Module** (`functions/profile/profileActions/`)
- ✅ Already exists: `randomEngagement.ts` (random engagement)
- ✅ Already exists: `engagementTracker.ts` (engagement tracking)

### **Phase 2: Standardize Imports**

#### **Recommended Import Pattern**
```typescript
// Timing & Delays
import {
  delay,
  randomDelay,
  shortDelay,
  mediumDelay,
  longDelay,
  gaussianDelay,
  getDelay,
} from "../functions/timing/humanize/humanize.ts";

// Mouse & Clicks
import {
  humanClickElement,
  humanHoverElement,
  mouseWiggle,
  humanScroll,
} from "../functions/timing/humanize/humanize.ts";

// Typing
import { humanTypeText } from "../functions/timing/humanize/humanize.ts";

// Engagement
import {
  performRandomEngagement,
  shouldEngageOnProfile,
} from "../functions/profile/profileActions/randomEngagement.ts";

// Warm-up
import { warmUpProfile } from "../functions/timing/warmup/warmup.ts";
```

### **Phase 3: Script Categorization**

#### **3.1 Move Scripts to Categories**
1. Create category directories
2. Move scripts to appropriate categories
3. Update imports (relative paths)
4. Update documentation

#### **3.2 Update Script References**
- Update `package.json` scripts
- Update cron jobs
- Update documentation
- Update test files

### **Phase 4: Humanization Guidelines**

#### **4.1 Create Humanization Guidelines Document**
- When to use which delay type
- When to use engagement
- When to use warm-up
- Best practices for each script category

#### **4.2 Standardize by Category**
- **Discovery scripts**: Full humanization suite
- **Messaging scripts**: High-risk delays + natural behavior
- **Analysis scripts**: Minimal (navigation only)
- **Profile management**: Medium (follows + clicks)
- **Session scripts**: Warm-up + engagement tracking

---

## 📝 Next Steps

1. **Review & Approve Plan** - Confirm categorization strategy
2. **Create Category Directories** - Set up new directory structure
3. **Move Scripts** - Migrate scripts to categories
4. **Update Imports** - Fix all import paths
5. **Update Documentation** - Update README, SCRIPTS.md
6. **Create Guidelines** - Humanization best practices doc
7. **Test** - Verify all scripts still work

---

## 🔍 Key Findings

### **Strengths**
- ✅ Comprehensive humanization utilities already exist
- ✅ Well-organized in `functions/timing/` and `functions/navigation/`
- ✅ Context-aware timing (element types)
- ✅ Ghost-cursor integration for realistic movement
- ✅ Engagement tracking and random engagement

### **Opportunities**
- ⚠️ Scripts are flat in `scripts/` - need categorization
- ⚠️ Some scripts duplicate humanization logic
- ⚠️ Inconsistent import patterns
- ⚠️ No clear guidelines for which humanization to use when

### **Recommendations**
1. **Categorize scripts** by function (discovery, messaging, analysis, etc.)
2. **Standardize imports** - use consistent import patterns
3. **Create guidelines** - document when to use which humanization
4. **Consolidate** - remove duplicate humanization logic
5. **Document** - update README with new structure

