# Manual Override System

## Overview

The Manual Override System allows you to manually classify profiles when automated detection is wrong. Manual overrides ALWAYS take precedence over automated detection, even when profiles are re-analyzed.

## When to Use Manual Overrides

Use manual overrides when:
- ✅ You're confident automated detection is wrong
- ✅ You have insider knowledge about a profile
- ✅ Visual inspection of Instagram confirms creator status
- ✅ Profile has subtle indicators the system missed
- ✅ False positive that keeps getting flagged

**Don't override:**
- ❌ Just because confidence is low (system might be right)
- ❌ Without checking the actual Instagram profile
- ❌ Based on assumptions without verification

---

## Commands

### Mark as Creator
```bash
npm run manual:mark-creator -- <username> "<reason>"
```

**Example:**
```bash
npm run manual:mark-creator -- sophiie_xdt "Confirmed via manual review"
```

### Mark as NOT Creator
```bash
npm run manual:mark-not-creator -- <username> "<reason>"
```

**Example:**
```bash
npm run manual:mark-not-creator -- thebiggerbodycoach "Fitness coach, not influencer"
```

### List All Overrides
```bash
npm run manual:list
```

### Clear Override (Return to Automated Detection)
```bash
npm run manual:clear -- <username>
```

---

## How It Works

### Database Schema

New columns added to `profiles` table:

| Column | Type | Description |
|--------|------|-------------|
| `manual_override` | Boolean | Is this profile manually overridden? |
| `manually_marked_creator` | Boolean? | Manual classification (true/false/null) |
| `manual_override_reason` | String? | Why the override was made |
| `manual_override_at` | Timestamp? | When the override was made |

### Override Precedence

```
if (profile.manualOverride) {
    use profile.manuallyMarkedCreator  // Manual decision
} else {
    use automated detection            // AI decision
}
```

**Manual overrides persist forever** until explicitly cleared.

---

## Examples

### Example 1: Correcting a False Negative

**Scenario:** @sophiie_xdt was unmarked (45% confidence) but you know she's a creator.

```bash
# Check current status
npm run manual:list

# Mark as creator
npm run manual:mark-creator -- sophiie_xdt "Confirmed via manual review"

# Verify
npm run manual:list
```

**Result:**
- `isCreator`: ✅ true
- `confidence`: 45% (automated score preserved)
- `manualOverride`: true
- `manuallyMarkedCreator`: true
- Even if re-analyzed, will stay marked as creator

---

### Example 2: Correcting a False Positive

**Scenario:** @fitnessguru was marked as creator (75%) but she's just a fitness coach.

```bash
# Mark as NOT creator
npm run manual:mark-not-creator -- fitnessguru "Fitness coach, confirmed no premium content"

# Verify
npm run manual:list
```

**Result:**
- `isCreator`: ❌ false
- `confidence`: 75% (automated score preserved)
- `manualOverride`: true
- `manuallyMarkedCreator`: false
- Even if re-analyzed, will stay unmarked

---

### Example 3: Clearing an Override

**Scenario:** You marked @username manually, but want to revert to automated detection.

```bash
# Clear override
npm run manual:clear -- username

# Re-analyze to get fresh automated score
npm run reanalyze
```

**Result:**
- Manual override removed
- Profile reverts to automated detection
- Future analysis will update classification

---

## Workflow Recommendations

### Daily Workflow

1. **Run discovery:**
   ```bash
   npm run discover
   ```

2. **Review new creators found:**
   ```bash
   # Check Scout Studio "Creators Found" in runs
   ```

3. **Manually verify suspicious ones:**
   - Visit Instagram profiles
   - Check for actual premium content indicators
   - Look for false positives

4. **Apply overrides as needed:**
   ```bash
   npm run manual:mark-not-creator -- username "reason"
   # or
   npm run manual:mark-creator -- username "reason"
   ```

### Weekly Maintenance

1. **Review all manual overrides:**
   ```bash
   npm run manual:list
   ```

2. **Check if any can be cleared:**
   - Has automated detection improved?
   - Were overrides temporary fixes?

3. **Update overrides if needed:**
   ```bash
   npm run manual:clear -- username
   npm run reanalyze
   ```

---

## Integration with Other Features

### Re-analysis
When running `npm run reanalyze`:
- Manual overrides are **ALWAYS respected**
- `isCreator` will not change for overridden profiles
- `confidence` and other fields still update
- Override reason is preserved

### Discovery
When discovering new profiles:
- Initial automated classification applied
- You can override immediately after discovery
- Override persists for future runs

### DM Sending
When using `npm run discover:dm`:
- Manual overrides are respected
- Profiles manually marked as creators will receive DMs
- Profiles manually marked as NOT creators will NOT receive DMs

### Migration Scripts
When running `npm run migrate:false-positives`:
- Manual overrides are **PRESERVED**
- Migration script skips manually overridden profiles
- Your manual decisions are never overwritten

---

## Real-World Examples

### Case: @sophiie_xdt

**Problem:**
- Automated detection: 45% confidence → Not marked as creator
- Reason: Medium link confidence + medium bio score = insufficient
- Reality: User is confident she IS a creator

**Solution:**
```bash
npm run manual:mark-creator -- sophiie_xdt "User confirmed - confident this is a creator"
```

**Result:**
✅ Now marked as creator
✅ Will receive DMs
✅ Shows in creator lists
✅ Override persists forever

---

### Case: @thebiggerbodycoach

**Problem:**
- Fitness coach with Linktree
- Has "subscribe" buttons (generic)
- No premium content indicators
- Automated detection: Would mark as creator with old logic

**Solution:**
```bash
npm run manual:mark-not-creator -- thebiggerbodycoach "Fitness coach, not influencer"
```

**Result:**
✅ Now explicitly marked as NOT creator
✅ Won't receive DMs
✅ Won't show in creator lists
✅ Override persists forever

---

## Best Practices

### 1. Always Provide Clear Reasons
```bash
# ❌ Bad
npm run manual:mark-creator -- username "idk"

# ✅ Good
npm run manual:mark-creator -- username "Has creator link in Linktree, confirmed via Instagram"
```

### 2. Document Your Decision Making
Keep a log of why you override profiles:
- Link to Instagram profile
- What indicators you saw
- Date of verification

### 3. Regular Reviews
- Review manual overrides monthly
- Check if automated detection has improved
- Clear overrides that are no longer needed

### 4. Trust Your Judgment
- If you're confident, override
- Better to have accurate data than trust automation blindly
- Manual overrides exist for a reason

### 5. Verify Before Overriding
- Always check the actual Instagram profile
- Look for multiple indicators
- Don't override based on username alone

---

## Troubleshooting

### "Profile not found in database"

**Problem:** You're trying to override a profile that hasn't been visited yet.

**Solution:**
1. First discover/visit the profile:
   ```bash
   npm run analyze -- @username
   ```
2. Then apply override:
   ```bash
   npm run manual:mark-creator -- username "reason"
   ```

---

### Override Not Working

**Problem:** Profile classification not changing after override.

**Solution:**
1. Check if override was applied:
   ```bash
   npm run manual:list
   ```
2. Verify the username is correct (case-sensitive)
3. Re-run the override command

---

### Want to Bulk Override

**Problem:** Need to override many profiles at once.

**Solution:**
Create a simple script:
```bash
#!/bin/bash
while IFS= read -r username; do
  npm run manual:mark-creator -- "$username" "Bulk override"
done < usernames.txt
```

---

## Summary

| Feature | Status | Command |
|---------|--------|---------|
| Mark as creator | ✅ | `npm run manual:mark-creator` |
| Mark as NOT creator | ✅ | `npm run manual:mark-not-creator` |
| List overrides | ✅ | `npm run manual:list` |
| Clear override | ✅ | `npm run manual:clear` |
| Persists on re-analysis | ✅ | Automatic |
| Respected by DM system | ✅ | Automatic |
| Respected by migrations | ✅ | Automatic |

**Manual overrides give you complete control over creator classification!** 🎯

