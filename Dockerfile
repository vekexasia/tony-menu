FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json backend/
COPY web/package*.json web/
COPY packages/schemas/package.json packages/schemas/
RUN npm ci

COPY web/workers/chat/package*.json web/workers/chat/
RUN cd web/workers/chat && npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_CHAT_WORKER_URL=/chat
ARG NEXT_PUBLIC_DEFAULT_LOCALE=en
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CHAT_WORKER_URL=$NEXT_PUBLIC_CHAT_WORKER_URL \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE
RUN NEXT_IGNORE_INCORRECT_LOCKFILE=1 npm --workspace web run build

EXPOSE 3000 8787 8788
CMD ["node", "scripts/serve-static.mjs", "web/out", "3000"]
