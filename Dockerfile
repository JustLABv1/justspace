FROM node:22-alpine AS base
LABEL org.opencontainers.image.source = "https://github.com/JustLabV1/justspace"

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm and dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Add build arguments for Next.js public environment variables
# These must be provided at build time (e.g. --build-arg NEXT_PUBLIC_APPWRITE_ENDPOINT=...)
ARG NEXT_PUBLIC_APPWRITE_ENDPOINT
ARG NEXT_PUBLIC_APPWRITE_PROJECT_ID
ARG NEXT_PUBLIC_APPWRITE_DATABASE_ID
ARG NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID
ARG NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID
ARG NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID
ARG NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID
ARG NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID
ARG NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID

# Set environment variables for build time so they are baked into the frontend
ENV NEXT_PUBLIC_APPWRITE_ENDPOINT=$NEXT_PUBLIC_APPWRITE_ENDPOINT
ENV NEXT_PUBLIC_APPWRITE_PROJECT_ID=$NEXT_PUBLIC_APPWRITE_PROJECT_ID
ENV NEXT_PUBLIC_APPWRITE_DATABASE_ID=$NEXT_PUBLIC_APPWRITE_DATABASE_ID
ENV NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_PROJECTS_COLLECTION_ID
ENV NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_TASKS_COLLECTION_ID
ENV NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_GUIDES_COLLECTION_ID
ENV NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_INSTALLATIONS_COLLECTION_ID
ENV NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_ACTIVITY_COLLECTION_ID
ENV NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID=$NEXT_PUBLIC_APPWRITE_SNIPPETS_COLLECTION_ID

RUN corepack enable pnpm && pnpm run build

# Production image, copy all the files and run next
FROM base AS runner
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
# https://nextjs.org/docs/advanced-features/output-file-tracing
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
