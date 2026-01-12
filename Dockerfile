# Scout Instagram Automation - Production Dockerfile
# ================================================
#
# Build: docker build -t scout:latest .
# Run:   docker run -d --name scout -p 4000:4000 -p 5901:5901 --env-file .env scout:latest
#
# Includes: VNC Server + AdsPower + Scout

FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Node.js
    curl \
    ca-certificates \
    gnupg \
    # VNC and display
    tigervnc-standalone-server \
    tigervnc-common \
    dbus-x11 \
    xfce4 \
    xfce4-terminal \
    # Chrome/Electron dependencies
    libxss1 \
    libgbm1 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libgtk-3-0 \
    # Fonts
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    # Utils
    wget \
    unzip \
    supervisor \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Download and install AdsPower
RUN wget -q "https://version.adspower.net/software/linux-x64-global/AdsPower-Global-7.12.29-x64.deb" -O /tmp/adspower.deb \
    && dpkg -i /tmp/adspower.deb || apt-get install -f -y \
    && rm /tmp/adspower.deb

# Set up VNC
RUN mkdir -p /root/.vnc \
    && echo "scoutpass" | vncpasswd -f > /root/.vnc/passwd \
    && chmod 600 /root/.vnc/passwd

# Create xstartup for VNC
RUN echo '#!/bin/bash\nstartxfce4 &' > /root/.vnc/xstartup \
    && chmod +x /root/.vnc/xstartup

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force \
    && npm install tsx

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs screenshots tmp data runs

# Create supervisor config to manage all processes
RUN cat > /etc/supervisor/conf.d/scout.conf << 'EOF'
[supervisord]
nodaemon=true
user=root

[program:vnc]
command=/usr/bin/vncserver :1 -geometry 1920x1080 -depth 24 -fg
autorestart=true
priority=10

[program:adspower]
command=/opt/AdsPower Global/adspower_global --no-sandbox
environment=DISPLAY=":1"
autorestart=true
priority=20
startsecs=10

[program:scout]
command=node --import tsx/esm scripts/deploy/start.ts
directory=/app
autorestart=true
priority=30
startsecs=15
stdout_logfile=/app/logs/scout-stdout.log
stderr_logfile=/app/logs/scout-stderr.log
EOF

# Environment
ENV DISPLAY=:1

# Expose ports
EXPOSE 4000 5901

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:4000/api/health || exit 1

# Start everything via supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]