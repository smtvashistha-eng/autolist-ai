# AutoList AI — production image (Node 22 for built-in node:sqlite)
FROM node:22-slim
WORKDIR /app

# install prod deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# app source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# private data (SQLite DB + uploaded files) must persist — mount a volume here
VOLUME ["/app/data"]

# simple healthcheck against the built-in endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-sqlite", "src/server.js"]
