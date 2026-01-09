# Scout Instagram Automation - Production Dockerfile
# ================================================
#
# Build: docker build -t scout:latest .
# Run:   docker run -d --name scout -p 4000:4000 --env-file .env scout:latest
#
# For headless Chrome support, this image includes all necessary dependencies.

FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies for Chromium/Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
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
    dumb-init \
    curl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium

# Create non-root user for security
RUN groupadd -r scout && useradd -r -g scout scout

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Install tsx for runtime TypeScript support
RUN npm install tsx

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p logs screenshots tmp data runs \
    && chown -R scout:scout /app

# Switch to non-root user
USER scout

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command: start the scheduler and API server
CMD ["node", "--import", "tsx/esm", "scripts/deploy/start.ts"]