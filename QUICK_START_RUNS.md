# 🚀 Quick Start: Runs Tracking System

## What You Get

A complete execution tracking system that shows you:
- ✅ **Every script run** with status (running/completed/error)
- 📸 **All screenshots** taken during execution
- 📊 **Live metrics**: profiles processed, creators found, errors
- ⏱️ **Performance data**: duration, success rate
- 🐛 **Error details** for debugging
- 🖼️ **Visual timeline** of every execution

## How to Test It

### Step 1: Start the Services

In **Terminal 1** - Start the API server:
```bash
cd /Users/bense/Coding/Experiments/scout
npm run dev:server
```

In **Terminal 2** - Start the frontend:
```bash
cd /Users/bense/Coding/Experiments/scout
npm run dev:frontend
```

### Step 2: Open Scout Studio

Open in your browser: **http://localhost:5173**

### Step 3: Start a Script

In Scout Studio, click any script button (e.g., **"REANALYZE"**).

The system will:
1. Create a unique run ID
2. Start tracking metrics
3. Associate all screenshots with the run
4. Update status in real-time

### Step 4: View the Run

1. Click **"Load runs"** button in the "Recent Runs" section
2. You'll see your run with:
   - 🟢 Green badge = Completed
   - 🔵 Blue pulsing = Currently running
   - 🔴 Red badge = Error occurred
3. Click on the run to open the **detail modal**

### Step 5: Explore Run Details

In the modal, you'll see:
- **4 Metric Cards**: Profiles, Creators, Errors, Duration
- **Screenshot Gallery**: Every screenshot from the run
- **Error Details**: Full error messages if any failed
- **Performance Stats**: Success rate, avg processing time

## What You'll See

### Runs List
```
┌─────────────────────────────────────────────────────┐
│ REANALYZE                        🟢 completed 📸 23│
│ Profiles: 62  Creators: 5  Errors: 0  Duration: 8m │
│ Started: 12/24/2025, 9:27:35 PM                    │
└─────────────────────────────────────────────────────┘
```

### Run Detail Modal
```
┌─────────────────────────────────────────────────────┐
│ REANALYZE                        🟢 completed       │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐│
│ │ Profiles │ │ Creators │ │  Errors  │ │Duration ││
│ │    62    │ │     5    │ │     0    │ │   8m    ││
│ └──────────┘ └──────────┘ └──────────┘ └─────────┘│
├─────────────────────────────────────────────────────┤
│ Screenshots (23)                                    │
│ [🖼️][🖼️][🖼️][🖼️][🖼️][🖼️][🖼️][🖼️][🖼️][🖼️][🖼️]...│
└─────────────────────────────────────────────────────┘
```

## Current Reanalysis

Your background reanalysis is **currently running** (16/62 profiles complete).

Once it finishes:
1. Click "Load runs" in Scout Studio
2. Find the "reanalyze_profiles" run
3. Click to see full results with all screenshots

## Debugging with Runs

### Find Failed Profiles
1. Open failed run (red badge)
2. Look at error message
3. Check screenshots to see what happened
4. Look at which profile # it failed on

### Compare Performance
1. Run same script multiple times
2. Compare durations
3. Check success rates
4. See if changes improved results

### Visual Debugging
1. Click any screenshot in the gallery
2. Opens full-size in new tab
3. See exactly what the bot saw
4. Identify issues visually

## Tips

- **Refresh runs**: Click "Load runs" to see latest
- **Real-time updates**: Runs update as scripts progress
- **Screenshot clicking**: Click any screenshot to view full-size
- **Sort order**: Newest runs appear first
- **Error tracking**: Red badge = check error details immediately

## File Locations

```
/runs/
  ├── index.json          # List of all runs
  └── {runId}.json        # Individual run data

/screenshots/
  └── YYYY-MM-DD/
      └── *.png           # Daily screenshots
```

## Next Steps

After testing:
1. ✅ View your first run in the UI
2. ✅ Click to see full details
3. ✅ Browse screenshots
4. ✅ Check metrics
5. ✅ Compare multiple runs

Your reanalysis should finish soon - perfect timing to see the full system in action! 🎉

