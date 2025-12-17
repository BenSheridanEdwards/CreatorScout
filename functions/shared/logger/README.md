# Enhanced Logging System

A comprehensive logging system for Scout that provides cycle tracking, error aggregation, file persistence, and detailed analytics.

## Features

- ✅ **File-based logging** - All logs persisted to daily log files
- ✅ **Cycle lifecycle tracking** - Track scraping cycles from start to finish
- ✅ **Error aggregation** - Categorize and count errors by type and severity
- ✅ **Performance monitoring** - Time operations and track cycle duration
- ✅ **Backwards compatible** - Works with existing Logger interface

## Quick Start

### Basic Usage

```typescript
import { createLoggerWithCycleTracking } from "../functions/shared/logger/logger.ts";

const { logger, cycleManager, startCycle, endCycle, recordError, shouldContinue } = createLoggerWithCycleTracking(true);

// Start a cycle
const cycleId = startCycle("seed_user", 100);

// Process profiles...
cycleManager.recordProfileProcessed("user1", true); // true = is creator
cycleManager.recordDMSent("user1");
cycleManager.recordFollowCompleted("user1");

// Record errors
recordError(new Error("Network timeout"), "profile_load", "user2");

// End cycle
endCycle("COMPLETED");
```

### Integration with Existing Code

Replace your existing logger creation:

```typescript
// Old way
const logger = createLogger(debug);

// New way - enhanced logging
const { logger, cycleManager, startCycle, endCycle, recordError } = createLoggerWithCycleTracking(debug);
```

## Components

### EnhancedLogger

Extends the base Logger with:
- File persistence (`logs/scout-YYYY-MM-DD.log`)
- Cycle-aware logging with cycle IDs
- Performance timing utilities
- Error aggregation

### CycleManager

Tracks scraping cycles with:
- Automatic cycle ID generation
- Profile processing counters
- Error tracking by severity (LOW/MEDIUM/HIGH/CRITICAL)
- Success rate calculations
- Cycle interruption detection

### LoggingIntegration

Easy-to-use wrapper that combines everything:
- One-line setup
- Automatic error type detection
- Cycle continuation logic based on error thresholds

## Log Files

Logs are automatically saved to:
```
logs/scout-2024-12-11.log
logs/scout-2024-12-12.log
...
```

Format:
```json
{"timestamp":"2024-12-11T10:30:00.000Z","level":"INFO","prefix":"CYCLE","message":"Started cycle cycle_abc123_def456","data":{"cycleId":"cycle_abc123_def456","context":"seed:user1"}}
{"timestamp":"2024-12-11T10:30:15.000Z","level":"ERROR","prefix":"ERROR","message":"Network timeout","data":{"type":"NETWORK","context":"profile_load","profile":"user2","cycleId":"cycle_abc123_def456"}}
```

## Error Types

Automatically detected error types:
- `NETWORK` - Connection issues, timeouts
- `AUTHENTICATION` - Login failures, session issues
- `RATE_LIMIT` - Instagram rate limiting
- `ELEMENT_NOT_FOUND` - DOM selectors failing
- `TIMEOUT` - Operation timeouts
- `UNKNOWN` - Other errors

## Severity Levels

- `LOW` - Profile not found, private profiles
- `MEDIUM` - Network timeouts, element issues
- `HIGH` - Rate limits, authentication issues
- `CRITICAL` - Complete system failures

## Cycle Status

Cycles can end with:
- `COMPLETED` - Successful completion
- `FAILED` - Terminated due to errors
- `INTERRUPTED` - Stopped by another cycle starting

## Configuration

```typescript
const config: LoggingConfig = {
    debug: true,                    // Enable console logging
    enableFileLogging: true,        // Save to files
    enableCycleTracking: true,      // Track cycles
    errorThresholds: {
        maxCriticalErrors: 3,       // Stop after 3 critical errors
        maxHighErrors: 10,          // Stop after 10 high errors
        maxTotalErrors: 50,         // Stop after 50 total errors
    },
};
```

## Example Integration

See `scripts/scrapeWithLogging.ts` for a complete example of how to integrate the enhanced logging system into your scraping workflow.

## Migration Guide

1. Import the enhanced logger:
   ```typescript
   import { createLoggerWithCycleTracking } from "../functions/shared/logger/logger.ts";
   ```

2. Replace logger creation:
   ```typescript
   // Before
   const logger = createLogger(debug);

   // After
   const { logger, cycleManager, startCycle, endCycle, recordError } = createLoggerWithCycleTracking(debug);
   ```

3. Add cycle management:
   ```typescript
   // At start of scraping
   const cycleId = startCycle(seedUsername);

   // At end of scraping
   endCycle("COMPLETED");
   ```

4. Record errors:
   ```typescript
   // Instead of just logging
   logger.error("ERROR", "Something failed");

   // Also record for cycle tracking
   recordError(error, "context", username);
   ```

## Benefits

- **Complete visibility** - Know exactly what happens during each cycle
- **Error analysis** - Understand failure patterns and root causes
- **Performance tracking** - Monitor cycle duration and success rates
- **Historical data** - File logs provide audit trail
- **Automated insights** - Error aggregation helps identify issues
- **Backwards compatible** - Works with existing code




