# Static ffmpeg: one self-contained binary (~tens of MB) instead of apt's ffmpeg +
# shared libs (~100+MB compressed, which pushed the image past the DOCR quota).
# Version pinned to match what the filtergraph was validated against (8.1.1).
FROM mwader/static-ffmpeg:8.1.1 AS ffmpeg

# BNancy bot — single long-running Bun process (HTTP server + deposit watcher).
# Built for ElizaCloud containers, DigitalOcean App Platform, and any linux/amd64 host.
FROM oven/bun:1.3.13

WORKDIR /app

# Only ffmpeg is needed at runtime (voiceVideoService.render). ffprobe is test-only,
# so it stays out of the production image. Copied early so the layer caches.
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg

# Install deps first for layer caching. --frozen-lockfile fails if bun.lock drifts.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# App source (includes src/, db/, assets/, and certs/supabase-root-2021-ca.crt which
# Postgres TLS reads at runtime). .dockerignore keeps .env and cruft out.
COPY . .

RUN chmod +x docker-entrypoint.sh \
  && chown -R bun:bun /app

# App Platform / ElizaCloud route to this port; config reads HTTP_PORT. Override via env.
ENV HTTP_PORT=8080
ENV RUN_MIGRATE_ON_START=true

EXPOSE 8080

# Run a single instance — the in-process pool mutex serializes money mutations
# in ONE process; do not scale this service horizontally without DB-level locks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD bun -e "const p=process.env.HTTP_PORT||8080;const r=await fetch('http://127.0.0.1:'+p+'/health');process.exit(r.ok?0:1)"

USER bun

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "src/index.ts"]
