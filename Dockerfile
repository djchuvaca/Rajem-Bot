FROM node:20-bullseye-slim

# Dependencias del sistema para Chromium (requeridas por whatsapp-web.js)
RUN apt-get update && apt-get install -y \
    chromium \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    ca-certificates \
    fonts-liberation \
    build-essential \
    python3 \
    tzdata \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Usar Chromium del sistema en vez del que descarga Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p data/backups logs

EXPOSE 3000

CMD ["sh", "-c", "rm -f /app/.wwebjs_auth/session-carnitas-bot/SingletonLock && node index.js"]
