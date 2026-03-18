#!/bin/bash
# VPS Security Hardening Script
# Run this script to implement critical security fixes

set -e

echo "🔒 VPS Security Hardening Script"
echo "=================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root"
    exit 1
fi

echo "📋 This script will:"
echo "   1. Enable and configure UFW firewall"
echo "   2. Install and configure Fail2ban"
echo "   3. Secure SSH configuration"
echo "   4. Update system packages"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "🛡️  Step 1: Configuring Firewall (UFW)"
echo "----------------------------------------"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
# Only allow port 4000 from localhost - you'll need to SSH tunnel to access
# If you need external access, use: ufw allow from YOUR_IP to any port 4000
echo "✅ Firewall configured (port 4000 will be restricted to localhost)"
ufw --force enable
ufw status verbose

echo ""
echo "🚫 Step 2: Installing Fail2ban"
echo "--------------------------------"
apt update
apt install -y fail2ban

# Create local fail2ban config
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = root@localhost
sendername = Fail2Ban
action = %(action_)s

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
bantime = 7200
EOF

systemctl enable fail2ban
systemctl restart fail2ban
systemctl status fail2ban --no-pager | head -5

echo ""
echo "🔐 Step 3: Securing SSH (Backup created)"
echo "-----------------------------------------"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%Y%m%d)

echo ""
echo "⚠️  SSH Configuration Recommendations:"
echo "   Current: PermitRootLogin yes"
echo "   Recommended: PermitRootLogin prohibit-password (after SSH keys are set up)"
echo ""
echo "   To secure SSH:"
echo "   1. Set up SSH keys on your local machine"
echo "   2. Copy public key to server: ssh-copy-id user@YOUR_SERVER_IP"
echo "   3. Then edit /etc/ssh/sshd_config:"
echo "      - PermitRootLogin prohibit-password"
echo "      - PasswordAuthentication no"
echo "   4. Restart SSH: systemctl restart sshd"
echo ""

echo ""
echo "📦 Step 4: Updating System Packages"
echo "------------------------------------"
apt update
apt upgrade -y

echo ""
echo "✅ Security Hardening Complete!"
echo "=============================="
echo ""
echo "📝 Next Steps:"
echo "   1. Set up SSH key authentication"
echo "   2. Restrict API server to localhost (see server.ts)"
echo "   3. Review Fail2ban status: fail2ban-client status sshd"
echo "   4. Check firewall: ufw status verbose"
echo ""
echo "⚠️  IMPORTANT: Test SSH access before disabling password auth!"
echo ""
