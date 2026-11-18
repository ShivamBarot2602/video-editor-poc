# API server image (used by Render, see render.yaml). Build from the repo root:
#   docker build -f app/server/Dockerfile .
# The root context is needed because the server loads app/shared (the ASS
# builder and the fonts ffmpeg burns with).
FROM node:22-bookworm-slim

# ffmpeg/ffprobe for audio extraction, burning, clip cuts and frames
# (Debian's build includes libass for the subtitles filter).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app/server/package.json app/server/yarn.lock app/server/
RUN cd app/server && yarn install --frozen-lockfile --production && yarn cache clean

COPY app/shared app/shared
COPY app/server app/server

WORKDIR /app/app/server
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["node", "index.js"]
