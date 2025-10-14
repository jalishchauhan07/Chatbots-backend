# Use node base image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json + lock first to leverage layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all code
COPY . .

# Build step
RUN npm run build

# Final stage
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Expose port and start
EXPOSE 3000
CMD ["node", "dist/index.js"]
