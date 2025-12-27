# Package.json Scripts Audit - Quick Summary

## 🎯 Key Findings

**Total Scripts:** 53
**Critical Issues:** 3 (must fix)
**Optional Improvements:** 2

---

## 🚨 Critical Issues (Must Fix)

### 1. **Missing `.ts` Extension**
```json
// ❌ Current (broken)
"inspect": "tsx scripts/test_instagram_loads"

// ✅ Should be
"inspect": "tsx scripts/test_instagram_loads.ts"
```

### 2. **Missing Main Scripts**
The primary automation scripts exist but aren't in package.json:

```json
// ❌ Missing - Main scraping script
"scrape": "tsx scripts/scrape.ts --profile test-account"

// ❌ Missing - Logged version
"scrape:logged": "tsx scripts/scrapeWithLogging.ts --profile test-account"

// ❌ Missing - Batch DM script
"dm:batch": "tsx scripts/dm_batch.ts"
```

---

## ⚠️ Optional Improvements

### 3. **Naming Clarity**
Two test profile scripts with similar names (they're different, but naming could be clearer):

```json
// Current
"test:profile": "tsx scripts/test/test_profile.ts"        // Comprehensive test
"test:single-profile": "tsx scripts/test_profile.ts"     // Simple test

// Suggested (clearer)
"test:profile": "tsx scripts/test/test_profile.ts"        // Comprehensive
"test:profile:simple": "tsx scripts/test_profile.ts"     // Simple
```

---

## ✅ All Other Scripts - Justified

### **Keep All** (45 scripts)
- ✅ All Jest test scripts (8) - Essential
- ✅ All discovery scripts (4) - Core functionality  
- ✅ All analysis scripts (6) - Core functionality
- ✅ All database/migration scripts (5) - Data management
- ✅ All action scripts (4) - Manual operations
- ✅ All utility scripts (4) - Debug/tools
- ✅ All development scripts (3) - Dev workflow
- ✅ All monitoring/cron scripts (4) - Production
- ✅ All profile management scripts (2) - Configuration
- ✅ All testing scripts (5) - Testing

---

## 📋 Recommended Actions

### **Immediate (Critical)**
1. Fix `inspect` path (add `.ts`)
2. Add `scrape` script
3. Add `scrape:logged` script  
4. Add `dm:batch` script

### **Optional (Nice to Have)**
5. Rename `test:single-profile` → `test:profile:simple` for clarity

---

## 📊 Impact

**Before:** 53 scripts, 3 broken/missing
**After:** 56 scripts (add 3), 0 broken

**Files to Update:**
- `package.json` - Add 3 scripts, fix 1 path

---

## 🔍 Full Details

See `PACKAGE_JSON_SCRIPTS_AUDIT.md` for complete analysis of all 53 scripts.

