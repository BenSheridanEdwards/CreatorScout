# VPS Provider Comparison

Side-by-side comparison to help you choose.

---

## 💰 Pricing

| Provider | Plan | Monthly | RAM | CPU | Storage | Transfer |
|----------|------|---------|-----|-----|---------|----------|
| **Hetzner** | CX11 | **$4.15** | 2 GB | 1 vCPU | 20 GB | 20 TB |
| **DigitalOcean** | Basic | **$6.00** | 1 GB | 1 vCPU | 25 GB | 1 TB |
| **Vultr** | Regular | $6.00 | 1 GB | 1 vCPU | 25 GB | 1 TB |
| **Linode** | Nanode | $5.00 | 1 GB | 1 vCPU | 25 GB | 1 TB |
| **Contabo** | VPS S | $3.99 | 4 GB | 4 vCPU | 50 GB | 32 TB |

**Winner: Hetzner** - Best price/performance for automation (2GB RAM crucial for browser automation)

---

## 🎯 For Instagram Automation

| Feature | Hetzner | DigitalOcean | Winner |
|---------|---------|--------------|---------|
| **RAM** | 2GB | 1GB | 🥇 Hetzner |
| **Price** | $4/mo | $6/mo | 🥇 Hetzner |
| **ToS Leniency** | High | Medium | 🥇 Hetzner |
| **Setup Speed** | 30 sec | 1 min | 🥇 Hetzner |
| **Documentation** | Good | Excellent | 🥇 DigitalOcean |
| **Support** | Email | Ticket/Chat | 🥇 DigitalOcean |
| **Global Reach** | EU-focused | Worldwide | 🥇 DigitalOcean |
| **Managed DB** | No | Yes ($15/mo) | 🥇 DigitalOcean |

**Overall: Hetzner** for automation workloads.

---

## 🌍 Data Center Locations

### Hetzner
- 🇩🇪 Falkenstein, Germany (FSN1)
- 🇩🇪 Nuremberg, Germany (NBG1)
- 🇫🇮 Helsinki, Finland (HEL1)
- 🇺🇸 Ashburn, USA (ASH)

**Best for:** EU operations, privacy-focused

### DigitalOcean
- 🇺🇸 New York, San Francisco
- 🇬🇧 London
- 🇳🇱 Amsterdam
- 🇩🇪 Frankfurt
- 🇸🇬 Singapore
- 🇮🇳 Bangalore
- 🇦🇺 Sydney
- 🇨🇦 Toronto

**Best for:** Global reach, low latency worldwide

---

## 📋 Use Case Recommendations

### Choose **Hetzner** if:
- ✅ You want best price/performance ($4 for 2GB!)
- ✅ You're comfortable with Linux
- ✅ You value privacy (EU jurisdiction)
- ✅ You need 2GB RAM for browser automation
- ✅ You don't need managed services

### Choose **DigitalOcean** if:
- ✅ You want better documentation/tutorials
- ✅ You prefer polished UI/dashboard
- ✅ You might use managed services later
- ✅ You want faster support response
- ✅ You're in US and want local servers
- ✅ $24/year extra is worth peace of mind

---

## 🚨 Automation-Friendly Rating

| Provider | Rating | Notes |
|----------|--------|-------|
| **Hetzner** | ⭐⭐⭐⭐⭐ | Very lenient, popular with scrapers |
| **DigitalOcean** | ⭐⭐⭐⭐ | Generally okay, some ToS enforcement |
| **Vultr** | ⭐⭐⭐⭐⭐ | Very lenient |
| **Linode** | ⭐⭐⭐⭐ | Good, now owned by Akamai |
| **Contabo** | ⭐⭐⭐⭐⭐ | Very cheap, mixed performance |
| **AWS/GCP/Azure** | ⭐⭐ | Not recommended - expensive, strict |
| **Railway/Heroku** | ⭐ | Prohibited in ToS |

---

## 💡 My Recommendation

**For Scout Instagram automation:**

### 🥇 First Choice: Hetzner CX11 ($4/mo)
**Why:**
- Perfect specs (2GB RAM for browser automation)
- Cheapest option
- EU-based (better privacy)
- Automation-friendly
- Fast provisioning

**Cons:**
- EU-focused data centers only
- Less polished dashboard

### 🥈 Second Choice: DigitalOcean Basic ($6/mo)
**Why:**
- Better ecosystem/docs
- Global data centers
- Polished experience
- Good for beginners

**Cons:**
- Only 1GB RAM (might be tight)
- $24/year more expensive

---

## 🔧 Setup Difficulty

Both are equally easy:

```bash
1. Create account (2 min)
2. Create server (1 min)
3. SSH in
4. Run setup script (5 min)
5. Configure .env
6. Start app

Total: ~15 minutes
```

Our setup scripts work on **both** providers identically.

---

## 📊 Real Performance

**Tested with Scout running:**

| Metric | Hetzner CX11 | DO Basic | Notes |
|--------|-------------|----------|-------|
| **Puppeteer launches** | Fast | Slower | 2GB vs 1GB RAM |
| **Concurrent profiles** | 2-3 | 1-2 | RAM limited |
| **PM2 stability** | Excellent | Good | Both solid |
| **Prisma queries** | Fast | Fast | Both NVMe SSD |

---

## 🎯 Bottom Line

**Can't decide?**

### Go with Hetzner if:
- You care about price ($4 vs $6)
- You need 2GB RAM
- You're doing automation

### Go with DigitalOcean if:
- You want better docs/support
- You prefer polished UI
- $2/month doesn't matter

**Both will work great.** You literally can't make a wrong choice here.

---

## 🚀 Ready to Start?

Follow the setup guide:
- **Quick (15 min):** [QUICKSTART_VPS.md](QUICKSTART_VPS.md)
- **Detailed:** [VPS_SETUP.md](VPS_SETUP.md)

Both guides work for **Hetzner** and **DigitalOcean**!

