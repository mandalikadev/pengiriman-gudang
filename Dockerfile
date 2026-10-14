# syntax=docker/dockerfile:1
# Image produksi (T130, docs/DEPLOY.md). Dibangun di VPS oleh deploy/compose.prod.yml dari commit yang lulus CI.
# Dua target akhir:
# - `app`: server Next.js mandiri (`output: "standalone"`), tanpa node_modules penuh.
# - `alat`: kode sumber + seluruh dependency untuk worker (`src/worker/index.ts`) dan langkah migrasi
#   (`drizzle-kit migrate`, seed admin, seed master), yang dijalankan dengan tsx seperti di pengembangan.
# Keduanya berjalan sebagai user non-root `node` bawaan image Node.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS dasar
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack memasang pnpm sesuai `packageManager` di package.json.
RUN corepack enable
WORKDIR /app

FROM dasar AS dependensi
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependensi AS bangun
COPY . .
# Modul database dan auth membaca DATABASE_URL dan BETTER_AUTH_SECRET saat dimuat. Saat build tidak ada koneksi yang
# dibuka, jadi cukup nilai tiruan yang hanya berlaku untuk perintah ini (tidak tersimpan di image; nilai asli dibaca
# saat runtime dari /opt/drp/.env). next/font mengunduh Google Font saat build dan kadang gagal karena jaringan, jadi
# build dicoba sampai tiga kali.
RUN export DATABASE_URL=postgres://bangun:bangun@localhost:5432/bangun \
      BETTER_AUTH_SECRET=nilai-tiruan-khusus-build-bukan-rahasia-0123456789; \
    for percobaan in 1 2 3; do \
      pnpm build && exit 0; \
      echo "Build gagal (percobaan $percobaan), mencoba lagi..."; sleep 10; \
    done; \
    exit 1

FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=bangun --chown=node:node /app/.next/standalone ./
COPY --from=bangun --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM dependensi AS alat
ENV NODE_ENV=production
COPY . .
USER node
CMD ["node_modules/.bin/tsx", "src/worker/index.ts"]
