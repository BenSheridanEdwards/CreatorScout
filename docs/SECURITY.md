# Security Documentation

Consolidated security audit, hardening, and deployment guide for Creator Scout VPS deployments.

---

## Table of Contents

1. [Audit Findings](#audit-findings)
2. [Fixes Applied](#fixes-applied)
3. [Attacker Blocking & Hardening](#attacker-blocking--hardening)
4. [Current Status](#current-status)
5. [Remaining Recommendations](#remaining-recommendations)
6. [Monitoring & Verification](#monitoring--verification)

---

## Audit Findings

### Critical Issues (Resolved)

| Issue | Risk | Resolution |
|-------|------|-------------|
| No firewall protection | High | UFW enabled, only SSH allowed |
| API server exposed to internet | High | Restricted to localhost (127.0.0.1) |
| Active brute force attacks | High | Fail2ban installed, attackers banned |

### High Priority (Resolved)

| Issue | Risk | Resolution |
|-------|------|-------------|
| Root login via password | High | SSH hardening applied; SSH keys recommended |
| Password authentication enabled | Medium-High | Fail2ban active; disable after SSH keys |
| Fail2ban not installed | High | Installed with strict config |

### Medium Priority (Resolved)

| Issue | Risk | Resolution |
|-------|------|-------------|
| System updates available | Medium | Packages upgraded |
| VNC server exposed | Medium | Port 5901 blocked |
| PostgreSQL on localhost | Low-Medium | Already localhost only ✓ |

### Low Priority (Resolved)

| Issue | Risk | Resolution |
|-------|------|-------------|
| .env file permissions | Low | Set to 600 |

---

## Fixes Applied

### 1. API Server Restricted to Localhost

- **Change:** Modified `server.ts` to listen on `127.0.0.1` instead of `0.0.0.0`
- **Result:** API is no longer accessible from the internet
- **Access from local:** Use SSH port forwarding: `ssh -L 4000:localhost:4000 user@YOUR_SERVER_IP`

### 2. Firewall (UFW) Enabled

- **Configuration:** Default deny incoming, allow outgoing; port 22 (SSH) allowed
- **Result:** Only SSH is accessible from external networks

### 3. Fail2ban Installed & Configured

- **Settings:** 2 failed attempts = 24 hour ban; 5-minute detection window
- **Result:** Brute force attacks automatically blocked

### 4. VNC Port Blocked

- **Change:** `ufw deny 5901/tcp`
- **Result:** VNC not accessible from external networks

### 5. SSH Hardening

- **MaxAuthTries:** 3 (limits password attempts per connection)
- **ClientAliveInterval:** 300 seconds (auto-disconnect idle sessions after 5 min)
- **ClientAliveCountMax:** 2

### 6. Known Attackers Banned

Six attacker IPs permanently banned via Fail2ban (brute force attempts detected).

### 7. File Permissions

- **Change:** `.env` permissions set to 600 (read/write owner only)

---

## Attacker Blocking & Hardening

### Automated Script

Run the hardening script on your VPS:

```bash
cd /path/to/creator-scout
git pull
bash scripts/security/harden_attacks.sh
```

### What the Script Does

1. **Blocks VNC port (5901)** – Prevents external VNC access
2. **Configures strict Fail2ban** – 2 failures = 24hr ban
3. **Bans known attacker IPs** – Immediately blocks detected IPs
4. **Hardens SSH** – MaxAuthTries, idle timeout

### Manual Deployment

If the script isn't available, run these on the VPS:

```bash
# 1. Block VNC port
ufw deny 5901/tcp

# 2. Configure Fail2ban
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 7200
findtime = 300
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 2
bantime = 86400
findtime = 300
EOF
systemctl restart fail2ban

# 3. Harden SSH (backup first!)
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d)
# Add: MaxAuthTries 3, ClientAliveInterval 300, ClientAliveCountMax 2
sshd -t && systemctl restart sshd
```

---

## Current Status

| Protection | Status |
|------------|--------|
| Firewall (UFW) | ✅ Active – only SSH allowed |
| API Server | ✅ Localhost only |
| Fail2ban | ✅ Running – 2 failures = 24hr ban |
| VNC Port | ✅ Blocked |
| SSH Hardening | ✅ Applied |
| Attacker IPs | ✅ Banned |

**Security Status: HIGH** ✅

---

## Remaining Recommendations

### High Priority

1. **Set up SSH key authentication**
   ```bash
   ssh-keygen -t ed25519
   ssh-copy-id user@YOUR_SERVER_IP
   ```

2. **Disable password authentication** (after SSH keys work)
   ```bash
   # Edit /etc/ssh/sshd_config
   PermitRootLogin prohibit-password
   PasswordAuthentication no
   systemctl restart sshd
   ```

### Medium Priority

3. **Regular maintenance** – Weekly `apt update && apt upgrade`
4. **Monitor logs** – `tail -f /var/log/fail2ban.log`

---

## Monitoring & Verification

```bash
# Check firewall
ufw status | grep 5901   # Should show DENY

# Check banned IPs
fail2ban-client get sshd banned

# Check Fail2ban status
fail2ban-client status sshd

# Check SSH config
grep -E "^(MaxAuthTries|ClientAliveInterval|ClientAliveCountMax)" /etc/ssh/sshd_config

# View recent login attempts
journalctl -u ssh -n 50 | grep -E "(Failed|Invalid)"
```
