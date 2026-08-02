FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_CFS_RUNTIME_MODE=local
ARG NEXT_PUBLIC_CFS_DATA_PROVIDER=local_api
ARG NEXT_PUBLIC_CFS_AUTH_MODE=local_dev
ARG NEXT_PUBLIC_CFS_API_BASE_URL=http://localhost:8000
ARG NEXT_PUBLIC_USE_BACKEND_API=true

ENV NEXT_PUBLIC_CFS_RUNTIME_MODE=$NEXT_PUBLIC_CFS_RUNTIME_MODE \
    NEXT_PUBLIC_CFS_DATA_PROVIDER=$NEXT_PUBLIC_CFS_DATA_PROVIDER \
    NEXT_PUBLIC_CFS_AUTH_MODE=$NEXT_PUBLIC_CFS_AUTH_MODE \
    NEXT_PUBLIC_CFS_API_BASE_URL=$NEXT_PUBLIC_CFS_API_BASE_URL \
    NEXT_PUBLIC_USE_BACKEND_API=$NEXT_PUBLIC_USE_BACKEND_API

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV HOSTNAME=0.0.0.0 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN addgroup --system --gid 10001 cfs \
    && adduser --system --uid 10001 --ingroup cfs cfsweb

COPY --from=build --chown=cfsweb:cfs /app/.next/standalone ./
COPY --from=build --chown=cfsweb:cfs /app/.next/static ./.next/static
COPY --from=build --chown=cfsweb:cfs /app/public ./public

USER cfsweb
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
