# Profile Detection Enhancements

## Summary

Enhanced the profile detection system to identify influencers with monetization links even when they don't have direct links in their bio. The system now analyzes multiple signals including username keywords, bio patterns, story highlights, and follower ratios.

## Clues Identified from `mistress_nancyparker` Profile

1. **Username Keyword**: "mistress" - strong indicator
2. **Bio Pattern**: "Check my highlight 🔗" - directs to highlights for links
3. **Story Highlights**:
   - "My 🔗" - link image with link emoji
   - "Bali 🖤" - lingerie/swimwear image
   - "OFF ACCOU..." (Official Accounts) - multiple accounts mentioned
4. **Follower Ratio**: 110K followers vs 194 following (high ratio = 567x)
5. **Category**: "Blogger" - often used by creators

## Implementation Details

### 1. Username Keyword Detection (`functions/bioMatcher.ts`)

**Added:**

- `USERNAME_KEYWORDS` array with terms like "mistress", "goddess", "princess", etc.
- Username keyword scoring (up to 20 points)
- Updated `calculateScore()` to accept `username` parameter
- Updated `isLikelyCreator()` to accept `username` parameter

**Usage:**

```typescript
const [isLikely, bioScore] = isLikelyCreator(bio, 40, username);
```

### 2. Bio Pattern Detection (`functions/bioMatcher.ts`)

**Added:**

- "check my highlight" pattern detection
- Link emoji (🔗) detection combined with highlight hints
- Highlight hint scoring (up to 15 points)

**Keywords added:**

- `check my highlight`
- `check highlight`
- `see highlight`
- `highlight`

### 3. Story Highlights Extraction (`functions/getStoryHighlights.ts`)

**New file:**

- `getStoryHighlights(page)` - extracts highlight titles and cover image URLs
- `isLinkInBioHighlight(title)` - checks if highlight title suggests premium content

**Features:**

- Extracts highlight titles from profile page
- Gets cover image URLs for vision analysis
- Identifies link highlights (e.g., "My 🔗", "Official Accounts")

### 4. Profile Statistics (`functions/getProfileStats.ts`)

**New file:**

- `getProfileStats(page)` - extracts follower/following counts and calculates ratio
- Handles Instagram's number formats (K, M, B)
- Calculates follower/following ratio

**Usage:**

```typescript
const stats = await getProfileStats(page);
if (stats.ratio && stats.ratio > 100) {
  // High ratio indicates creator
}
```

### 5. Enhanced Profile Check (`scripts/check_profile.ts`)

**New steps added:**

- **Step 6**: Bio analysis with username keywords
- **Step 7**: Profile statistics (follower ratio)
- **Step 8**: Story highlights extraction and analysis
  - Extracts highlights
  - Identifies link ones
  - Analyzes highlight cover images with vision AI
- **Step 9**: Direct creator link check (moved from Step 6)
- **Step 10**: Link aggregator check (moved from Step 7)
- **Step 11**: Final decision based on combined signals

**Vision Analysis of Highlights:**

- Downloads highlight cover images
- Sends to vision AI for analysis
- Flags profiles if highlight covers contain link content

### 6. Main Script Update (`scripts/scrape.ts`)

**Updated:**

- `processProfile()` now passes `username` to `isLikelyCreator()`

## Scoring System

The enhanced system uses a multi-signal approach:

1. **Username Keywords**: +20 points (e.g., "mistress", "goddess")
2. **Highlight Hints**: +15 points (e.g., "Check my highlight 🔗")
3. **Emojis**: +5 to +25 points (based on count)
4. **Keywords**: +10 to +50 points (based on type)
5. **Follower Ratio**: +30 points if ratio > 100
6. **Story Highlights**: Vision analysis can flag creator
7. **Direct Links**: +25 to +50 points

**Threshold**: Profiles with combined score ≥ 50 are flagged as creators.

## Example: `mistress_nancyparker` Detection

With the new system, this profile would be detected because:

1. ✅ Username contains "mistress" → +20 points
2. ✅ Bio says "Check my highlight 🔗" → +15 points
3. ✅ Has link highlights ("My 🔗", "Bali 🖤") → Vision analysis
4. ✅ High follower ratio (110K/194 = 567x) → +30 points
5. ✅ Highlight cover images analyzed → Vision confirms creator

**Total Score**: ~65+ points → **Flagged as Creator** ✅

## Testing

To test the enhancements:

```bash
# Test with a profile that has highlights
TEST_USERNAME=mistress_nancyparker npm run test:profile

# Or use the check_profile script directly
node scripts/check_profile.ts --user mistress_nancyparker
```

## Future Enhancements

1. **Category Detection**: Analyze profile category ("Blogger", "Creator", etc.)
2. **Post Content Analysis**: Analyze recent post images for link content
3. **Hashtag Analysis**: Check for adult-content related hashtags
4. **Story Content**: Analyze actual story content (not just highlights)
5. **Multiple Account Detection**: Better detection of "Official Accounts" highlights
