# AdsPower Setup Guide

This project uses AdsPower for anti-detect browser management. AdsPower handles fingerprinting, cookies, and browser isolation automatically.

## Prerequisites

1. **AdsPower Account**: Sign up at [adspower.com](https://www.adspower.com/)
2. **AdsPower Desktop App**: Download and install from [adspower.com/download](https://www.adspower.com/download)

## Step 1: Enable Local API

1. Open AdsPower desktop app
2. Go to **Settings** → **API**
3. Verify **Connection** shows **Success** (green)
4. Note the API URL (default: `http://127.0.0.1:50325`)
5. (Optional) Generate an **API Key** if you want to enable API verification

## Step 2: Create Browser Profiles

1. In AdsPower, click **New Profile** or **Batch Create**
2. Configure each profile:
   - **Name**: Descriptive name (e.g., "IG-Burner-1")
   - **Proxy**: Set up proxy (recommended for Instagram)
   - **Fingerprint**: Use default settings (AdsPower handles this)
3. Save the profile

## Step 3: Get Profile IDs

Run the profile listing script:

```bash
npx tsx scripts/list_adspower_profiles.ts
```

This will show all your profiles with their `user_id` values.

## Step 4: Configure profiles.config.json

Create or update `profiles.config.json` with your AdsPower profile IDs:

```json
{
  "profiles": [
    {
      "id": "burner-1",
      "username": "your_instagram_username",
      "password": "your_instagram_password",
      "type": "burner",
      "adsPowerProfileId": "abc123xyz",
      "limits": {
        "followsPerDay": 80,
        "dmsPerDay": 10,
        "discoveriesPerDay": 2000
      },
      "sessions": {
        "morning": { "enabled": true, "time": "08:00", "durationMinutes": 18, "dmWeight": 0.3 },
        "afternoon": { "enabled": true, "time": "15:00", "durationMinutes": 18, "dmWeight": 0.4 },
        "evening": { "enabled": true, "time": "21:00", "durationMinutes": 18, "dmWeight": 0.3 }
      }
    }
  ]
}
```

## Step 5: Environment Variables (Optional)

Add to your `.env` file if needed:

```bash
# AdsPower API URL (default: http://127.0.0.1:50325)
ADSPOWER_API_BASE=http://127.0.0.1:50325

# AdsPower API Key (only if API verification is enabled)
ADSPOWER_API_KEY=your_api_key_here
```

## Usage

The system will automatically:
1. Start the AdsPower profile via Local API
2. Connect Puppeteer to the browser
3. Run automation tasks
4. (Optionally) Stop the profile when done

### Test a Profile

```bash
npx tsx scripts/test_profile.ts burner-1
```

### List All Profiles

```bash
npx tsx scripts/list_adspower_profiles.ts
```

## Transferring from GoLogin

AdsPower supports importing profiles from GoLogin:

1. In AdsPower, go to **Settings** → **API** → **Transfer Profiles**
2. Select **GoLogin** tab
3. Enter your GoLogin token
4. Click **Start transfer**

This will import your existing GoLogin profiles with their cookies and fingerprints.

## Troubleshooting

### Cannot connect to AdsPower API

1. Make sure AdsPower desktop app is running
2. Check that Local API is enabled (Settings → API → Connection: Success)
3. Verify the API URL in your `.env` matches AdsPower settings
4. If using API Key, ensure `ADSPOWER_API_KEY` is set correctly

### Profile fails to start

1. Check the profile isn't already running in AdsPower
2. Verify the profile exists: `npx tsx scripts/list_adspower_profiles.ts`
3. Check AdsPower logs for errors

### Browser disconnects unexpectedly

1. Increase timeout values in the connector
2. Check your internet connection
3. Ensure proxy settings are correct in AdsPower

## API Reference

The AdsPower Local API documentation is available at:
https://localapi-doc-en.adspower.com/docs/K4IsTq

### Key Endpoints Used

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/browser/start?user_id=X` | Start a profile |
| `GET /api/v1/browser/stop?user_id=X` | Stop a profile |
| `GET /api/v1/browser/active?user_id=X` | Check if profile is running |
| `GET /api/v1/user/list` | List all profiles |

