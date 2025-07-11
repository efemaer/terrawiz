# Use Node.js 22 Alpine for smaller image size
FROM node:22-alpine AS base

# Create non-root user for security
RUN addgroup -g 1001 -S terrawiz && \
    adduser -S terrawiz -u 1001 -G terrawiz

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM base AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R terrawiz:terrawiz /app

# Switch to non-root user
USER terrawiz

# Create a volume for scanning local directories
VOLUME ["/workspace"]

# Expose the CLI as entrypoint
ENTRYPOINT ["node", "dist/src/index.js"]

# Default command shows help
CMD ["--help"]