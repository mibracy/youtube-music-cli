FROM oven/bun:1-alpine

RUN apk add --no-cache ffmpeg libsodium mpv

WORKDIR /app

COPY package.json bun.lock ./
COPY patches patches/
COPY discord-bot/package.json discord-bot/
COPY web/package.json web/
RUN bun install

COPY source source/
COPY discord-bot/source discord-bot/source/
COPY discord-bot/diagnostic.ts discord-bot/diagnostic.ts
COPY tsconfig.json ./

RUN bun build discord-bot/source/index.ts --outdir discord-bot/dist --target bun \
    --external ffmpeg-static --external sodium --external @snazzah/davey

VOLUME ["/data"]

ENV STATE_DIR=/data
ENV NODE_ENV=production

CMD ["bun", "run", "discord-bot/dist/index.js"]
