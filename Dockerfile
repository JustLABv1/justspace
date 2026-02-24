FROM node:22-alpine AS base
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

# Install dependencies only when needed
FROM base AS deps
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm and dependencies
COPY package.json ./
RUN corepack enable pnpm && pnpm install

# Rebuild the source code only when needed
FROM base AS builder
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# BUILD TIME: No environment variables needed anymore!
# The app will read them at runtime from the container environment.
RUN corepack enable pnpm && pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Optional: Add volume for persistent config if needed
RUN mkdir -p /etc/justspace && chown -R nextjs:nodejs /etc/justspace
VOLUME [ "/etc/justspace" ]

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
