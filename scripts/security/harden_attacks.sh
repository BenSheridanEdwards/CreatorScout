#!/bin/bash
# Immediate Security Hardening - Block Active Attackers
# Run this on the VPS to block current attackers and harden SSH

set -e

echo "🔒 Immediate Security Hardening"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root"
    exit 1
fi

echo "🛡️  Step 1: Blocking VNC Port (5901)"
ufw deny 5901/tcp
echo "✅ VNC port blocked"

echo ""
echo "🚫 Step 2: Configuring Stricter Fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 7200
findtime = 300
maxretry = 3
destemail = root@localhost
sendername = Fail2Ban
action = %(action_)s

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
sleep 2
echo "✅ Fail2ban configured with strict settings (2 failures = 24hr ban)"

echo ""
echo "🔨 Step 3: Manually Banning Known Attackers"
ATTACKER_IPS=(
    "193.24.211.200"
    "45.80.184.188"
    "204.76.203.233"
    "45.148.10.121"
    "213.209.159.159"
    "179.33.210.213"
)

for ip in "${ATTACKER_IPS[@]}"; do
    if fail2ban-client set sshd banip "$ip" 2>/dev/null; then
        echo "  ✅ Banned: $ip"
    else
        echo "  ⚠️  Could not ban: $ip (may already be banned)"
    fi
done

echo ""
echo "🔐 Step 4: Hardening SSH Configuration"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d_%H%M%S)

# Set MaxAuthTries to 3
if grep -q "^MaxAuthTries" /etc/ssh/sshd_config; then
    sed -i 's/^MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
else
    sed -i '/^#MaxAuthTries/a MaxAuthTries 3' /etc/ssh/sshd_config
fi

# Set ClientAliveInterval to 300 seconds (5 minutes)
if grep -q "^ClientAliveInterval" /etc/ssh/sshd_config; then
    sed -i 's/^ClientAliveInterval.*/ClientAliveInterval 300/' /etc/ssh/sshd_config
else
    sed -i '/^#ClientAliveInterval/a ClientAliveInterval 300' /etc/ssh/sshd_config
fi

# Set ClientAliveCountMax to 2
if grep -q "^ClientAliveCountMax" /etc/ssh/sshd_config; then
    sed -i 's/^ClientAliveCountMax.*/ClientAliveCountMax 2/' /etc/ssh/sshd_config
else
    sed -i '/^#ClientAliveCountMax/a ClientAliveCountMax 2' /etc/ssh/sshd_config
fi

# Validate SSH config
if sshd -t; then
    systemctl restart sshd
    echo "✅ SSH hardened and restarted"
else
    echo "❌ SSH config validation failed - restoring backup"
    cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    exit 1
fi

echo ""
echo "📊 Step 5: Security Status"
echo "---------------------------"
echo "Firewall Status:"
ufw status | head -5
echo ""
echo "Fail2ban Status:"
fail2ban-client status sshd | head -8
echo ""
echo "Currently Banned IPs:"
fail2ban-client get sshd banned
echo ""

echo "✅ Security Hardening Complete!"
echo "=============================="
echo ""
echo "📝 Summary:"
echo "  - VNC port (5901) blocked"
echo "  - Fail2ban: 2 failures = 24hr ban"
echo "  - SSH: Max 3 auth attempts, 5min timeout"
echo "  - ${#ATTACKER_IPS[@]} attacker IPs manually banned"
echo ""
echo "⚠️  Note: Attackers are now blocked. Future attempts will be auto-banned."
