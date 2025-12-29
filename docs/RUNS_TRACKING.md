# Runs Tracking System

## Overview

Every script execution is now tracked as a "run" with complete visibility into:
- **Screenshots** taken during execution
- **Metrics** (profiles processed, creators found, errors)
- **Status** (running, completed, error)
- **Duration** and performance stats
- **Error messages** for debugging

## How It Works

### 1. Automatic Tracking
When you start any script from Scout Studio, the system:
- Creates a unique run ID
- Passes it to the script via `SCOUT_RUN_ID` environment variable
- Associates all screenshots with that run
- Tracks metrics in real-time

### 2. View Runs in UI
1. Open Scout Studio: `http://localhost:5173`
2. Start a script (e.g., "REANALYZE")
3. Click "Load runs" to see execution history
4. Click any run to see:
   - Full metrics dashboard
   - All screenshots taken
   - Error details if failed
   - Duration and performance

### 3. Runs Storage
Runs are stored in `/runs/` directory:
- `runs/index.json` - List of all runs (last 100)
- `runs/{runId}.json` - Individual run metadata

## UI Features

### Runs List View
Shows at-a-glance:
- ✅ Script name & status badge
- 📊 Key metrics (profiles, creators, errors)
- ⏱️ Duration
- 📸 Screenshot count
- 🖼️ Final screenshot thumbnail

### Run Details Modal
Click any run to see:
- **Metrics Cards**: Profiles, creators, errors, duration
- **Screenshot Gallery**: All screenshots from the run
- **Error Details**: Full error message if failed
- **Success Rate**: Percentage of profiles processed successfully

## Debugging Benefits

### 1. Visual Debugging
See exactly what the browser saw at each step with screenshots

### 2. Error Tracking
Every error is captured with:
- Error message
- Which profile caused it
- Total error count

### 3. Performance Monitoring
Track:
- How long runs take
- Processing speed per profile
- Success rates over time

### 4. Historical Comparison
Compare runs to see:
- What changed between executions
- Whether fixes improved success rates
- Performance trends

## Example Usage

### Starting a Run
```bash
# From Scout Studio UI
Click "DISCOVER" → Run starts automatically with tracking

# From terminal (also works)
npm run reanalyze:no-vision
# Still creates a run, but without UI visibility
```

### Viewing Results
1. Click "Load runs" in Scout Studio
2. Find your run (sorted newest first)
3. See status badge:
   - 🟢 Green = Completed successfully
   - 🔵 Blue pulsing = Currently running
   - 🔴 Red = Failed with errors
4. Click to see full details

### Debugging Failed Runs
1. Open failed run (red status badge)
2. Check error message at top
3. Review screenshots to see where it failed
4. Look at error count vs profiles processed
5. Fix issue and rerun

## Screenshot Association

Every screenshot is automatically linked to its run:
- Profile screenshots
- Link analysis screenshots
- DM screenshots
- Error screenshots

View all screenshots for a run in the modal's gallery view.

## API Endpoints

For custom integrations:

```bash
# Get all runs
GET /api/runs

# Get specific run
GET /api/runs/{runId}

# Screenshots are still available
GET /api/screenshots
```

## Tips

1. **Run often**: Each run gives you visibility into what's working
2. **Check errors**: Even successful runs may have partial errors
3. **Compare runs**: Look at metrics trends over time
4. **Use screenshots**: They're your best debugging tool
5. **Monitor duration**: Spot performance issues early

## Future Enhancements

Potential additions:
- Live updates while run is in progress
- Run comparison view
- Export run data as JSON
- Screenshot annotations
- Performance graphs over time

