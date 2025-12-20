# PostgreSQL Database Setup Guide

This guide will help you set up PostgreSQL for the Scout project.

## Quick Setup Options

### Option 1: Local PostgreSQL (Recommended for Development)

#### Installation (macOS)

```bash
# Using Homebrew
brew install postgresql@16
brew services start postgresql@16

# Or install latest version
brew install postgresql
brew services start postgresql
```

#### Create Database and User

```bash
# Connect to PostgreSQL
psql postgres

# In psql prompt, run:
CREATE DATABASE scout;
CREATE USER scout_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE scout TO scout_user;
\q
```

#### Connection URL Format

```bash
# Standard format
DATABASE_URL="postgresql://scout_user:your_secure_password@localhost:5432/scout"

# Or with connection pooling
DATABASE_URL="postgresql://scout_user:your_secure_password@localhost:5432/scout?connection_limit=10"
```

---

### Option 2: Cloud PostgreSQL (Recommended for Production)

#### A. Railway (Easiest - Free tier available)

1. Go to [railway.app](https://railway.app)
2. Create new project → Add PostgreSQL
3. Copy the connection URL from the service settings
4. Format: `postgresql://postgres:password@hostname.railway.app:5432/railway`

#### B. Supabase (Free tier available)

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → Database → Connection string
4. Use the "URI" format
5. Format: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

#### C. Neon (Serverless PostgreSQL - Free tier)

1. Go to [neon.tech](https://neon.tech)
2. Create new project
3. Copy connection string from dashboard
4. Format: `postgresql://user:password@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require`

#### D. Render (Free tier available)

1. Go to [render.com](https://render.com)
2. Create new PostgreSQL database
3. Copy Internal Database URL
4. Format: `postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com/scout_xxxx`

---

## Setup Steps

### 1. Set Environment Variable

Add to your `.env` file:

```bash
DATABASE_URL="postgresql://scout_user:your_secure_password@localhost:5432/scout"
```

**Important**: Replace with your actual credentials!

### 2. Run Prisma Migrations

```bash
# Generate Prisma Client
npx prisma generate

# Apply migrations to create tables
npx prisma migrate deploy

# Or for development (creates migration history)
npx prisma migrate dev
```

### 3. Verify Connection

```bash
# Test database connection
npx prisma db pull

# Or use Prisma Studio to view data
npx prisma studio
```

---

## Migrate Existing SQLite Data (Optional)

If you have existing data in `scout.db`:

```bash
# Install SQLite driver temporarily
npm i -D better-sqlite3

# Run migration script
DATABASE_URL="postgresql://..." npx tsx scripts/migrate_sqlite_to_postgres.ts --sqlite ./scout.db

# Remove SQLite driver after migration
npm uninstall better-sqlite3
```

---

## Connection URL Format Reference

### Standard Format

```
postgresql://[user]:[password]@[host]:[port]/[database]?[parameters]
```

### Components

- **user**: Database username
- **password**: Database password (URL-encode special characters)
- **host**: Database hostname (localhost, or cloud provider hostname)
- **port**: PostgreSQL port (default: 5432)
- **database**: Database name
- **parameters**: Optional query parameters

### Common Parameters

```bash
# Connection pooling
?connection_limit=10

# SSL (required for most cloud providers)
?sslmode=require

# Schema
?schema=public

# Timeout
?connect_timeout=10
```

### Example URLs

```bash
# Local development
DATABASE_URL="postgresql://scout_user:password123@localhost:5432/scout"

# Railway
DATABASE_URL="postgresql://postgres:abc123@containers-us-west-123.railway.app:5432/railway"

# Supabase
DATABASE_URL="postgresql://postgres:password@db.abcdefgh.supabase.co:5432/postgres?sslmode=require"

# Neon
DATABASE_URL="postgresql://user:pass@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

---

## Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use strong passwords** - Generate secure random passwords
3. **Use SSL in production** - Add `?sslmode=require` for cloud databases
4. **Limit database user permissions** - Only grant necessary privileges
5. **Use connection pooling** - For production applications

---

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
brew services list

# Start PostgreSQL
brew services start postgresql@16
```

### Authentication Failed

- Verify username and password are correct
- Check if user has proper permissions
- Ensure database exists

### SSL Required

For cloud providers, add `?sslmode=require` to your connection string.

---

## Next Steps

After setup:

1. ✅ Set `DATABASE_URL` in `.env`
2. ✅ Run `npx prisma migrate deploy`
3. ✅ Test with `npx prisma studio`
4. ✅ (Optional) Migrate SQLite data if needed
5. ✅ Start using the application!
