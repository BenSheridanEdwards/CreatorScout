# Creator Scout - Scripts Reference

## Individual Testing Scripts

For development and manual operations:

```bash
npm run analyze <username>     # Analyze profile for creator indicators
npm run follow <username>     # Follow a specific user
npm run dm <username>         # Send DM to a specific user
npm run following <username>  # Extract following list from profile
npm run process <users> [opts] # Batch process multiple profiles
```

## Full Automation Scripts

```bash
# Discovery (no DMs - safe for testing)
npm run discover              # Find and follow creators (no DMs)
npm run discover:debug        # Same with debug logging

# Discovery with DMs (full automation)
npm run discover:dm           # Find, follow, AND send DMs to creators
npm run discover:dm:debug     # Same with debug logging

# Legacy full automation
npm run scrape                # Full automation with DMs
```

## Testing Workflows

```bash
# Run all unit tests (505 tests)
npm test

# Run specific test suites
npm run test:e2e              # All E2E tests
npm run test:e2e:scrape       # E2E scrape tests
npm run test:e2e:check-profile # E2E profile checking

# Test coverage
npm run test:coverage
```

## Database & Profiles

```bash
npm run studio                # Open Prisma Studio
npm run profiles:list         # List profiles
npm run profiles:sync         # Sync profiles from config
npm run manual:list           # List manual overrides
```

## Development

```bash
npm run dev:frontend          # Start frontend dev server
npm run dev:server            # Start API server
npm run scrape -- --debug     # Run with debug logging
```
