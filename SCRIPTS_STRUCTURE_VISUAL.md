# Scripts Structure - Visual Comparison

## 📊 Current Structure (Flat)

```
scripts/
├── analyze_profile.ts          # Analysis
├── check_profile.ts            # Analysis
├── dashboard.ts                # Utility
├── discover.ts                 # Discovery
├── dm_batch.ts                 # Messaging
├── dm_user.ts                  # Messaging
├── eval_batch.ts               # Analysis
├── eval_profile.ts             # Analysis
├── follow_user.ts              # Profile management
├── get_following.ts            # Profile management
├── health_check.ts             # Utility
├── list_adspower_profiles.ts   # Profile management
├── list_profiles.ts            # Profile management
├── login_screenshot.ts        # Utility
├── manual_override.ts         # Utility
├── migrate_false_positives.ts  # Utility
├── open_inbox.ts               # Utility
├── process_profiles.ts         # Discovery
├── reanalyze_profiles.ts       # Analysis
├── scrape.ts                   # Discovery (main)
├── scrapeWithLogging.ts       # Discovery
├── send_dms_to_known_creators.ts # Messaging
├── test_*.ts                   # Testing (many files)
├── cron/
│   ├── sessionRunner.ts        # Sessions
│   ├── smartSessionRunner.ts   # Sessions
│   ├── rampUpLimits.ts         # Sessions
│   └── resetDailyCounters.ts   # Sessions
├── deploy/
│   └── *.sh                    # Deployment
├── monitoring/
│   └── costMonitor.ts         # Utility
└── test/
    └── *.ts                    # Testing
```

**Issues:**
- ❌ Flat structure - hard to find scripts
- ❌ No clear categorization
- ❌ Mixed concerns (discovery + analysis + messaging)
- ❌ Inconsistent humanization usage

---

## 🎯 Proposed Structure (Categorized)

```
scripts/
├── core/                       # Core discovery & processing
│   ├── discovery.ts            # Main discovery loop (was scrape.ts)
│   ├── discovery-logged.ts     # Logged version (was scrapeWithLogging.ts)
│   ├── discover.ts             # Discovery focused (was discover.ts)
│   └── process-batch.ts        # Batch processing (was process_profiles.ts)
│
├── messaging/                  # DM & messaging
│   ├── batch.ts                # Batch DMs (was dm_batch.ts)
│   ├── single.ts               # Single DM (was dm_user.ts)
│   └── known-creators.ts       # DM known creators (was send_dms_to_known_creators.ts)
│
├── analysis/                   # Profile analysis & evaluation
│   ├── batch.ts                # Batch evaluation (was eval_batch.ts)
│   ├── single.ts               # Single evaluation (was eval_profile.ts)
│   ├── analyze.ts              # Profile analysis (was analyze_profile.ts)
│   ├── check.ts                # Quick check (was check_profile.ts)
│   └── reanalyze.ts            # Re-analyze (was reanalyze_profiles.ts)
│
├── profiles/                   # Profile management
│   ├── follow.ts               # Follow user (was follow_user.ts)
│   ├── get-following.ts        # Get following list (was get_following.ts)
│   ├── list.ts                 # List profiles (was list_profiles.ts)
│   └── list-adspower.ts        # List AdsPower (was list_adspower_profiles.ts)
│
├── sessions/                   # Session & scheduling
│   ├── runner.ts               # Session runner (was cron/sessionRunner.ts)
│   ├── smart-runner.ts         # Smart runner (was cron/smartSessionRunner.ts)
│   ├── ramp-up.ts              # Ramp-up limits (was cron/rampUpLimits.ts)
│   └── reset-counters.ts       # Reset counters (was cron/resetDailyCounters.ts)
│
├── utils/                      # Utility scripts
│   ├── dashboard.ts            # Dashboard (was dashboard.ts)
│   ├── health.ts               # Health check (was health_check.ts)
│   ├── login-screenshot.ts     # Login screenshot (was login_screenshot.ts)
│   ├── open-inbox.ts           # Open inbox (was open_inbox.ts)
│   ├── manual-override.ts      # Manual override (was manual_override.ts)
│   ├── migrate.ts              # Migration (was migrate_false_positives.ts)
│   └── monitoring/
│       └── cost.ts             # Cost monitor (was monitoring/costMonitor.ts)
│
├── test/                       # Testing scripts (keep existing)
│   ├── test_profile.ts
│   ├── test_random_engagement.ts
│   ├── ramp_up_test.ts
│   └── ...
│
└── deploy/                     # Deployment scripts (keep existing)
    ├── app-setup.sh
    ├── vps-initial-setup.sh
    └── vps-setup.sh
```

**Benefits:**
- ✅ Clear categorization by function
- ✅ Easy to find scripts
- ✅ Consistent naming (kebab-case)
- ✅ Logical grouping

---

## 🎭 Humanization Usage by Category

### **Core Discovery** (`scripts/core/`)
```
Humanization Level: ⭐⭐⭐⭐⭐ (Full Suite)

Required:
✅ delay() - Named delays
✅ randomDelay() - Custom delays
✅ mouseWiggle() - After profile loads
✅ humanScroll() - Natural scrolling
✅ performRandomEngagement() - Break patterns
✅ humanClickElement() - All clicks
```

### **Messaging** (`scripts/messaging/`)
```
Humanization Level: ⭐⭐⭐⭐⭐ (High-Risk Focus)

Required:
✅ longDelay() / gaussianDelay() - 10-30s between DMs
✅ humanTypeText() - Realistic typing (no typos)
✅ simulateNaturalBehavior() - Before DMs
✅ humanClickElement() - Message buttons
```

### **Analysis** (`scripts/analysis/`)
```
Humanization Level: ⭐ (Minimal)

Required:
⚠️ delay("after_navigate") - Navigation only
❌ No engagement (read-only)
```

### **Profiles** (`scripts/profiles/`)
```
Humanization Level: ⭐⭐⭐ (Medium)

Required:
✅ shortDelay() - 1-5s after follows
✅ humanClickElement() - Follow buttons
✅ mouseWiggle() - After actions
```

### **Sessions** (`scripts/sessions/`)
```
Humanization Level: ⭐⭐⭐⭐ (Warm-up Focus)

Required:
✅ warmUpProfile() - Before sessions
✅ EngagementTracker - Track ratios
✅ batchEngagements() - Quick batches
```

### **Utils** (`scripts/utils/`)
```
Humanization Level: ⭐ (None)

Required:
❌ No humanization (utility scripts)
```

---

## 📦 Humanization Module Map

```
functions/
├── timing/
│   ├── humanize/
│   │   └── humanize.ts         # ⭐⭐⭐⭐⭐ Core humanization
│   │       ├── Delays (delay, randomDelay, microDelay, etc.)
│   │       ├── Mouse (humanClickElement, mouseWiggle, humanScroll)
│   │       └── Typing (humanTypeText)
│   ├── sleep/
│   │   └── sleep.ts            # Basic sleep utility
│   └── warmup/
│       └── warmup.ts           # Profile warm-up
│
├── navigation/
│   └── humanClick/
│       └── humanClick.ts       # ElementHandle support
│
├── profile/
│   └── profileActions/
│       └── randomEngagement.ts # Random engagement patterns
│
└── shared/
    └── engagement/
        └── engagementTracker.ts # Engagement ratio tracking
```

---

## 🔄 Import Path Changes

### **Before (Flat Structure)**
```typescript
// From scripts/scrape.ts
import { delay } from "../functions/timing/humanize/humanize.ts";
```

### **After (Categorized)**
```typescript
// From scripts/core/discovery.ts
import { delay } from "../../functions/timing/humanize/humanize.ts";
```

**Path Depth:**
- `scripts/*.ts` → `../functions/` (1 level up)
- `scripts/core/*.ts` → `../../functions/` (2 levels up)
- `scripts/messaging/*.ts` → `../../functions/` (2 levels up)
- etc.

---

## 📋 Migration Checklist

### **Phase 1: Core Discovery** (4 scripts)
- [ ] `scrape.ts` → `core/discovery.ts`
- [ ] `scrapeWithLogging.ts` → `core/discovery-logged.ts`
- [ ] `discover.ts` → `core/discover.ts`
- [ ] `process_profiles.ts` → `core/process-batch.ts`

### **Phase 2: Messaging** (3 scripts)
- [ ] `dm_batch.ts` → `messaging/batch.ts`
- [ ] `dm_user.ts` → `messaging/single.ts`
- [ ] `send_dms_to_known_creators.ts` → `messaging/known-creators.ts`

### **Phase 3: Analysis** (5 scripts)
- [ ] `eval_batch.ts` → `analysis/batch.ts`
- [ ] `eval_profile.ts` → `analysis/single.ts`
- [ ] `analyze_profile.ts` → `analysis/analyze.ts`
- [ ] `check_profile.ts` → `analysis/check.ts`
- [ ] `reanalyze_profiles.ts` → `analysis/reanalyze.ts`

### **Phase 4: Profiles** (4 scripts)
- [ ] `follow_user.ts` → `profiles/follow.ts`
- [ ] `get_following.ts` → `profiles/get-following.ts`
- [ ] `list_profiles.ts` → `profiles/list.ts`
- [ ] `list_adspower_profiles.ts` → `profiles/list-adspower.ts`

### **Phase 5: Sessions** (4 scripts)
- [ ] `cron/sessionRunner.ts` → `sessions/runner.ts`
- [ ] `cron/smartSessionRunner.ts` → `sessions/smart-runner.ts`
- [ ] `cron/rampUpLimits.ts` → `sessions/ramp-up.ts`
- [ ] `cron/resetDailyCounters.ts` → `sessions/reset-counters.ts`

### **Phase 6: Utils** (7 scripts)
- [ ] `dashboard.ts` → `utils/dashboard.ts`
- [ ] `health_check.ts` → `utils/health.ts`
- [ ] `login_screenshot.ts` → `utils/login-screenshot.ts`
- [ ] `open_inbox.ts` → `utils/open-inbox.ts`
- [ ] `manual_override.ts` → `utils/manual-override.ts`
- [ ] `migrate_false_positives.ts` → `utils/migrate.ts`
- [ ] `monitoring/costMonitor.ts` → `utils/monitoring/cost.ts`

---

## 🎯 Quick Reference: Which Humanization When?

| Script Type | Delay | Mouse | Typing | Engagement | Warm-up |
|------------|-------|-------|--------|------------|---------|
| **Core Discovery** | ✅ Full | ✅ Yes | ⚠️ If needed | ✅ Yes | ❌ No |
| **Messaging** | ✅ Long | ✅ Yes | ✅ Yes (no typos) | ❌ No | ❌ No |
| **Analysis** | ⚠️ Nav only | ❌ No | ❌ No | ❌ No | ❌ No |
| **Profiles** | ✅ Short | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Sessions** | ✅ Micro | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| **Utils** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

---

## 📚 Documentation Files Created

1. **`SCRIPTS_AND_HUMANIZATION_ANALYSIS.md`** - Comprehensive analysis
2. **`HUMANIZATION_DISTRIBUTION_PLAN.md`** - Implementation plan
3. **`SCRIPTS_STRUCTURE_VISUAL.md`** - This file (visual comparison)

---

## 🚀 Next Steps

1. **Review** the analysis and plan
2. **Approve** the categorization strategy
3. **Start** with Phase 1 (Core Discovery) as a pilot
4. **Test** after each phase
5. **Iterate** based on feedback

