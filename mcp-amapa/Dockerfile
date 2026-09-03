# syntax=docker/dockerfile:1
# Build context = raiz do repo (Easypanel)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
COPY mcp-amapa/package.json ./
RUN npm install --omit=dev
COPY mcp-amapa/src ./src
EXPOSE 3100
CMD ["node", "src/index.js"]
