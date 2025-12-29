# Humanization Distribution Plan

## 🎯 Goal
Categorize scripts by function and standardize humanization usage across the codebase.

---

## 📋 Implementation Plan

### **Phase 1: Create Directory Structure**

```bash
scripts/
├── core/              # Core discovery & processing
├── messaging/         # DM & messaging scripts
├── analysis/          # Profile analysis & evaluation
├── profiles/          # Profile management
├── sessions/          # Session & scheduling
├── test/              # Testing scripts (existing)
├── utils/             # Utility scripts
└── deploy/            # Deployment scripts (existing)
```

### **Phase 2: Script Migration Map**

#### **Core Discovery** → `scripts/core/`
- `scrape.ts` → `core/discovery.ts`
- `scrapeWithLogging.ts` → `core/discovery-logged.ts`
- `discover.ts` → `core/discover.ts`
- `process_profiles.ts` → `core/process-batch.ts`

**Humanization Requirements:**
- ✅ `delay()` - Named delays from config
- ✅ `randomDelay()` - Custom delays
- ✅ `mouseWiggle()` - After profile loads
- ✅ `humanScroll()` - Natural scrolling
- ✅ `performRandomEngagement()` - Break bot patterns
- ✅ `humanClickElement()` - All clicks

#### **Messaging** → `scripts/messaging/`
- `dm_batch.ts` → `messaging/batch.ts`
- `dm_user.ts` → `messaging/single.ts`
- `send_dms_to_known_creators.ts` → `messaging/known-creators.ts`

**Humanization Requirements:**
- ✅ `longDelay()` or `gaussianDelay()` - 10-30s between DMs
- ✅ `humanTypeText()` - Realistic typing (mistakeRate: 0 for DMs)
- ✅ `simulateNaturalBehavior()` - Before DM actions
- ✅ `humanClickElement()` - Message button clicks

#### **Analysis** → `scripts/analysis/`
- `eval_batch.ts` → `analysis/batch.ts`
- `eval_profile.ts` → `analysis/single.ts`
- `analyze_profile.ts` → `analysis/analyze.ts`
- `check_profile.ts` → `analysis/check.ts`
- `reanalyze_profiles.ts` → `analysis/reanalyze.ts`

**Humanization Requirements:**
- ⚠️ `delay("after_navigate")` - Only navigation delays
- ❌ No engagement (read-only operations)

#### **Profiles** → `scripts/profiles/`
- `follow_user.ts` → `profiles/follow.ts`
- `get_following.ts` → `profiles/get-following.ts`
- `list_profiles.ts` → `profiles/list.ts`
- `list_adspower_profiles.ts` → `profiles/list-adspower.ts`

**Humanization Requirements:**
- ✅ `shortDelay()` - 1-5s after follows
- ✅ `humanClickElement()` - Follow button clicks
- ✅ `mouseWiggle()` - After actions

#### **Sessions** → `scripts/sessions/`
- `cron/sessionRunner.ts` → `sessions/runner.ts`
- `cron/smartSessionRunner.ts` → `sessions/smart-runner.ts`
- `cron/rampUpLimits.ts` → `sessions/ramp-up.ts`
- `cron/resetDailyCounters.ts` → `sessions/reset-counters.ts`

**Humanization Requirements:**
- ✅ `warmUpProfile()` - Before sessions
- ✅ `EngagementTracker` - Track engagement ratios
- ✅ `batchEngagements()` - Quick engagement batches

#### **Utils** → `scripts/utils/`
- `dashboard.ts` → `utils/dashboard.ts`
- `health_check.ts` → `utils/health.ts`
- `login_screenshot.ts` → `utils/login-screenshot.ts`
- `open_inbox.ts` → `utils/open-inbox.ts`
- `manual_override.ts` → `utils/manual-override.ts`
- `migrate_false_positives.ts` → `utils/migrate.ts`
- `monitoring/costMonitor.ts` → `utils/monitoring/cost.ts`

**Humanization Requirements:**
- ❌ None (utility scripts)

---

## 🔧 Standard Import Templates

### **Template 1: Core Discovery Script**
```typescript
// Timing & Delays
import {
  delay,
  randomDelay,
  shortDelay,
  getDelay,
} from "../../functions/timing/humanize/humanize.ts";

// Mouse & Interaction
import {
  humanClickElement,
  mouseWiggle,
  humanScroll,
} from "../../functions/timing/humanize/humanize.ts";

// Engagement
import {
  performRandomEngagement,
  shouldEngageOnProfile,
} from "../../functions/profile/profileActions/randomEngagement.ts";

// Basic utilities
import { sleep } from "../../functions/timing/sleep/sleep.ts";
```

### **Template 2: Messaging Script**
```typescript
// High-risk delays
import {
  longDelay,
  gaussianDelay,
  randomDelay,
} from "../../functions/timing/humanize/humanize.ts";

// Typing (no typos for DMs)
import { humanTypeText } from "../../functions/timing/humanize/humanize.ts";

// Natural behavior
import { simulateNaturalBehavior } from "../../functions/navigation/profileNavigation/dmNavigation.ts";

// Mouse clicks
import { humanClickElement } from "../../functions/timing/humanize/humanize.ts";
```

### **Template 3: Analysis Script**
```typescript
// Minimal - only navigation delays
import { delay } from "../../functions/timing/humanize/humanize.ts";
// No engagement, no mouse movement
```

### **Template 4: Profile Management Script**
```typescript
// Short delays for follows
import {
  shortDelay,
  humanClickElement,
  mouseWiggle,
} from "../../functions/timing/humanize/humanize.ts";
```

### **Template 5: Session Script**
```typescript
// Warm-up
import { warmUpProfile } from "../../functions/timing/warmup/warmup.ts";

// Engagement tracking
import {
  EngagementTracker,
  batchEngagements,
} from "../../functions/shared/engagement/engagementTracker.ts";

// Quick delays
import { microDelay } from "../../functions/timing/humanize/humanize.ts";
```

---

## 📊 Humanization Decision Matrix

| Action Type | Delay Function | Duration | Use Case |
|------------|----------------|----------|----------|
| **Rapid actions** | `microDelay()` | 0.5-2s | Between quick clicks, after typing |
| **Routine actions** | `shortDelay()` | 1-5s | Follows, discovery, scrolling |
| **Engagement** | `mediumDelay()` | 3-8s | Watching reels, viewing stories |
| **High-risk** | `longDelay()` | 10-30s | Between DMs |
| **Critical DMs** | `gaussianDelay()` | 10-30s | DM actions (more natural distribution) |
| **Named delays** | `delay("name")` | Config-based | Standardized timing from config |

| Interaction Type | Function | Element Type | Notes |
|-----------------|----------|--------------|-------|
| **Button click** | `humanClickElement()` | `"button"` | Quick (80-230ms hover) |
| **Link click** | `humanClickElement()` | `"link"` | Very quick (50-170ms hover) |
| **Input click** | `humanClickElement()` | `"input"` | Careful (120-320ms hover) |
| **ElementHandle** | `humanLikeClickHandle()` | Any | For elements from `page.$$()` |
| **Coordinates** | `humanLikeClickAt()` | N/A | Direct coordinate click |

| Text Input | Function | Options | Use Case |
|-----------|----------|---------|----------|
| **Normal** | `humanTypeText()` | Default (2% typos) | Search, general input |
| **Sensitive** | `humanTypeText()` | `mistakeRate: 0` | Passwords, DMs |
| **Custom** | `humanTypeText()` | Custom delays | Special requirements |

---

## ✅ Implementation Checklist

### **Step 1: Preparation**
- [ ] Review and approve categorization plan
- [ ] Backup current scripts directory
- [ ] Create new directory structure

### **Step 2: Core Discovery Scripts**
- [ ] Move `scrape.ts` → `core/discovery.ts`
- [ ] Move `scrapeWithLogging.ts` → `core/discovery-logged.ts`
- [ ] Move `discover.ts` → `core/discover.ts`
- [ ] Move `process_profiles.ts` → `core/process-batch.ts`
- [ ] Update imports in all moved files
- [ ] Verify humanization usage matches template

### **Step 3: Messaging Scripts**
- [ ] Move `dm_batch.ts` → `messaging/batch.ts`
- [ ] Move `dm_user.ts` → `messaging/single.ts`
- [ ] Move `send_dms_to_known_creators.ts` → `messaging/known-creators.ts`
- [ ] Update imports
- [ ] Verify high-risk delays are used

### **Step 4: Analysis Scripts**
- [ ] Move all eval/analyze scripts → `analysis/`
- [ ] Update imports
- [ ] Remove unnecessary humanization

### **Step 5: Profile Management**
- [ ] Move profile scripts → `profiles/`
- [ ] Update imports
- [ ] Verify medium humanization

### **Step 6: Session Management**
- [ ] Move cron scripts → `sessions/`
- [ ] Update imports
- [ ] Verify warm-up usage

### **Step 7: Utilities**
- [ ] Move utility scripts → `utils/`
- [ ] Update imports
- [ ] Remove humanization (if any)

### **Step 8: Update References**
- [ ] Update `package.json` scripts
- [ ] Update cron job paths
- [ ] Update documentation (README, SCRIPTS.md)
- [ ] Update test files

### **Step 9: Testing**
- [ ] Test core discovery scripts
- [ ] Test messaging scripts
- [ ] Test analysis scripts
- [ ] Test profile management
- [ ] Test session scripts

### **Step 10: Documentation**
- [ ] Update README with new structure
- [ ] Create humanization guidelines doc
- [ ] Update SCRIPTS.md
- [ ] Document import patterns

---

## 🎓 Humanization Best Practices

### **DO:**
✅ Use named delays (`delay("after_follow")`) for standardized timing
✅ Use `gaussianDelay()` for high-risk actions (DMs)
✅ Use `humanClickElement()` with `elementType` for context-aware timing
✅ Use `humanTypeText()` with `mistakeRate: 0` for DMs
✅ Use `performRandomEngagement()` to break bot patterns
✅ Use `warmUpProfile()` before sessions

### **DON'T:**
❌ Use uniform delays everywhere (detectable pattern)
❌ Skip delays on high-risk actions (DMs)
❌ Use `humanTypeText()` with typos for DMs
❌ Use engagement on read-only scripts (analysis)
❌ Hardcode delay values (use config or named delays)

---

## 📈 Success Metrics

After implementation, we should have:
- ✅ All scripts categorized by function
- ✅ Consistent import patterns
- ✅ Appropriate humanization for each category
- ✅ No duplicate humanization logic
- ✅ Clear guidelines for future scripts
- ✅ All tests passing
- ✅ Documentation updated

---

## 🚀 Quick Start

To start implementing:

1. **Create directories:**
   ```bash
   mkdir -p scripts/{core,messaging,analysis,profiles,sessions,utils}
   ```

2. **Move first script (example):**
   ```bash
   git mv scripts/scrape.ts scripts/core/discovery.ts
   ```

3. **Update imports:**
   - Change relative paths (e.g., `../functions/` → `../../functions/`)
   - Use standard import templates

4. **Test:**
   ```bash
   npm test
   tsx scripts/core/discovery.ts
   ```

5. **Repeat for all scripts**


