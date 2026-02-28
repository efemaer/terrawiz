# Dependency stage
FROM node:24-alpine AS deps

WORKDIR /opt/terrawiz
COPY package*.json ./
RUN npm install

# Build stage
FROM deps AS builder

WORKDIR /opt/terrawiz
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:24-alpine AS production

ENV NODE_ENV=production
WORKDIR /opt/terrawiz

# Create non-root user for security
RUN addgroup -g 1001 -S terrawiz && \
    adduser -S terrawiz -u 1001 -G terrawiz

# Copy only runtime artifacts
COPY --from=builder /opt/terrawiz/package*.json ./
COPY --from=builder /opt/terrawiz/node_modules ./node_modules
COPY --from=builder /opt/terrawiz/dist ./dist

# Dedicated workspace for user mounts and exports
RUN mkdir -p /workspace && \
    chown -R terrawiz:terrawiz /opt/terrawiz /workspace

USER terrawiz
WORKDIR /workspace
VOLUME ["/workspace"]

# Keep application path outside mounted workspace
ENTRYPOINT ["node", "/opt/terrawiz/dist/src/index.js"]
CMD ["--help"]
