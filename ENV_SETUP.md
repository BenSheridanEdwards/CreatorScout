# Environment Variables Setup Guide

Quick reference for setting up your `.env` file.

## Create .env File

```bash
# Copy this template to .env and fill in your values
```

## Required Variables

### SmartProxy (Residential Proxies)

Get these from [smartproxy.com](https://smartproxy.com) dashboard:

```bash
SMARTPROXY_USERNAME=sp1234567              # Your SmartProxy username
SMARTPROXY_PASSWORD=your_smartproxy_pass   # Your SmartProxy password
SMARTPROXY_HOST=gate.smartproxy.com        # Default endpoint
SMARTPROXY_PORT=7000                       # Default port
```

**How to get:**
1. Sign up at smartproxy.com
2. Go to Dashboard → Residential Proxies → Endpoints
3. Copy username and password

### GoLogin (Browser Fingerprinting)

Get profile tokens from [gologin.com](https://gologin.com) dashboard:

```bash
GOLOGIN_API_TOKEN=your-default-gologin-profile-token
```

**How to get:**
1. Sign up at gologin.com
2. Create a browser profile
3. Go to Profile Settings → API
4. Copy the profile token

**Note:** Individual profile tokens go in `profiles.config.json`, this is just the default.

### Instagram Credentials

```bash
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
```

### OpenRouter (Vision AI)

Get from [openrouter.ai](https://openrouter.ai):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

**How to get:**
1. Sign up at openrouter.ai
2. Add credits ($5-10 to start)
3. Go to Keys → Create Key
4. Copy the API key

### Database (Postgres)

```bash
DATABASE_URL=postgresql://user:password@host:5432/scout
```

**Options:**
- **Railway**: Auto-provided when you add Postgres plugin (don't set manually)
- **Supabase**: Get from Project Settings → Database → Connection String
- **Local**: `postgresql://postgres:postgres@localhost:5432/scout`

## Optional Variables

### Development Flags

```bash
# Use local browser (skip GoLogin/proxy for testing)
LOCAL_BROWSER=false

# Enable verbose debug logging
DEBUG_LOGS=false

# Fast mode (reduced delays, skip vision - for testing only)
FAST_MODE=false

# Skip vision API calls entirely
SKIP_VISION=false
```

### GoLogin Advanced

```bash
# Use local Orbita browser instead of remote GoLogin
GOLOGIN_USE_LOCAL=false

# VPS IP for local Orbita (only if GOLOGIN_USE_LOCAL=true)
GOLOGIN_VPS_IP=localhost

# Orbita port (only if using local)
GOLOGIN_LOCAL_PORT=9222
```

## Complete .env Template

```bash
# ===========================================
# SMARTPROXY CONFIGURATION
# ===========================================
SMARTPROXY_USERNAME=sp1234567
SMARTPROXY_PASSWORD=your_smartproxy_password
SMARTPROXY_HOST=gate.smartproxy.com
SMARTPROXY_PORT=7000

# ===========================================
# GOLOGIN CONFIGURATION
# ===========================================
GOLOGIN_API_TOKEN=your-gologin-profile-token-here
GOLOGIN_USE_LOCAL=false
GOLOGIN_VPS_IP=localhost

# ===========================================
# INSTAGRAM CREDENTIALS
# ===========================================
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password

# ===========================================
# AI & VISION API
# ===========================================
OPENROUTER_API_KEY=your_openrouter_api_key

# ===========================================
# DATABASE
# ===========================================
DATABASE_URL=postgresql://user:password@host:5432/scout

# ===========================================
# DEVELOPMENT FLAGS
# ===========================================
LOCAL_BROWSER=false
DEBUG_LOGS=false
FAST_MODE=false
SKIP_VISION=false
```

## Validation

Test your setup:

```bash
# Test database connection
npx prisma db push

# Test profile configuration
npm run test:profile main1

# Test Instagram connection
npm run login:screenshot

# Run health check
npm run health
```

## Security Notes

1. **Never commit .env to git** - it's in .gitignore
2. **Use different passwords** - don't reuse Instagram password for other services
3. **Rotate credentials** - if compromised, regenerate all API keys
4. **Railway/Render secrets** - use their UI to set env vars, not .env file in repo

## Troubleshooting

### "Cannot find .env file"
```bash
# Make sure you're in the project root
pwd  # Should show /path/to/scout

# Create .env if missing
touch .env
# Then add variables above
```

### "Invalid credentials"
```bash
# Test SmartProxy
curl -x gate.smartproxy.com:7000 \
  -U "user-YOUR_USERNAME-session-test:YOUR_PASSWORD" \
  https://ip.smartproxy.com

# Test GoLogin (check token is valid)
# Run: npm run test:profile your-profile-id

# Test Instagram (try logging in manually first)
```

### "Database connection failed"
```bash
# Test connection
psql $DATABASE_URL

# Check format is correct
# Should be: postgresql://user:pass@host:5432/dbname
```

---

**Need help?** See [DEPLOYMENT.md](DEPLOYMENT.md) for full setup guide.

