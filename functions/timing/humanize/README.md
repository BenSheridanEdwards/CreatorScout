# Human Mouse Movement Guide

This module provides advanced, human-like mouse interactions for Puppeteer automation.

## Basic Usage

### Move Mouse to Any UI Element
```typescript
import { moveMouseToElement, humanClickElement } from './humanize.js';

// Move mouse to a button smoothly
await moveMouseToElement(page, 'button.submit-btn');

// Click with human-like behavior
await humanClickElement(page, 'button.submit-btn');
```

### Click Form Elements
```typescript
// Click a form input
await humanClickElement(page, 'input[name="username"]', {
  offsetX: 10,  // Click 10px from center
  offsetY: 5,   // Click 5px from center
});

// Click with different buttons
await humanClickElement(page, '.dropdown', {
  button: 'right',  // Right-click
});
```

### Type Text Human-like
```typescript
import { humanTypeText } from './humanize.js';

// Type into a form field
await humanTypeText(page, 'input[name="email"]', 'user@example.com', {
  typeDelay: 120,   // 120ms between characters
  wordPause: 400,   // 400ms between words
});
```

### Hover Effects
```typescript
import { humanHoverElement } from './humanize.js';

// Hover over an element (like reading a tooltip)
await humanHoverElement(page, '.help-icon', 1500); // Hover for 1.5 seconds
```

## Advanced Features

### Custom Movement Curves
The mouse follows realistic Bezier curves instead of straight lines:
- Starts from current position
- Uses a control point for natural curves
- Adds micro-randomization per step
- Variable timing between movements

### Element Detection
Automatically finds element centers:
```typescript
// Gets the exact center of any element
const center = await getElementCenter(page, '.my-button');
// Returns: { x: 450, y: 300 }
```

### Realistic Timing
- Variable delays between mouse steps
- Human-like click durations (50-150ms)
- Reading pauses before actions
- Word-by-word typing with pauses

## Integration with Existing Code

Replace direct Puppeteer calls:
```typescript
// Before
await page.click('button.submit');

// After
await humanClickElement(page, 'button.submit');
```

```typescript
// Before
await page.type('input[name="email"]', 'user@example.com');

// After
await humanTypeText(page, 'input[name="email"]', 'user@example.com');
```

## Configuration

All timing is automatically scaled by your `DELAY_SCALE` setting:
- `FAST_MODE` = quicker movements
- `DELAY_SCALE = 2.0` = slower, more cautious movements

## Benefits

- ✅ **Stealth**: Mouse movements look human, not robotic
- ✅ **Reliability**: Better element interaction success rates
- ✅ **Flexibility**: Works with any CSS selector
- ✅ **Realism**: Includes human-like pauses and variations