FROM node:22.11.0-slim

ENV NODE_ENV=production

# Install Redis CLI
RUN apt-get update && apt-get install -y --no-install-recommends redis-tools && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/docknockbackend

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE ${PORT}
CMD ["node", "bin/start.js"]
