#!/usr/bin/env bash
# Deploy satu commit ke VPS (T130, docs/DEPLOY.md). Dipanggil workflow Deploy lewat SSH:
#   /opt/drp/repo/deploy/deploy.sh <sha-commit>
# Langkah: checkout commit itu di /opt/drp/repo, pasang berkas situs di proxy bersama lalu `caddy reload` jika berubah
# (proxy tidak di-restart), bangun dan nyalakan deploy/compose.prod.yml, tunggu `app` sehat (maks. 3 menit), dan
# `docker image prune -f`. Keluar non-nol jika ada langkah yang gagal.
# Situs dipasang lebih dulu agar Caddy sudah melayani domain (dan sertifikatnya) saat app dan worker menyala; keduanya
# memanggil storage lewat https://drp.mandalika.web.id.
set -euo pipefail

DIR_DRP=/opt/drp
DIR_REPO="$DIR_DRP/repo"
BERKAS_ENV="$DIR_DRP/.env"
DIR_PROXY=/opt/proxy
BATAS_TUNGGU_DETIK=180

SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Pemakaian: $0 <sha-commit-40-karakter>" >&2
  exit 2
fi

cd "$DIR_REPO"

# Tahap 1: checkout commit, lalu jalankan ulang deploy.sh versi commit itu agar perubahan pada skrip ini ikut berlaku.
if [[ "${DRP_DEPLOY_SESUDAH_CHECKOUT:-}" != "$SHA" ]]; then
  echo "==> Mengambil commit $SHA"
  git fetch --quiet origin
  git checkout --quiet --detach "$SHA"
  DRP_DEPLOY_SESUDAH_CHECKOUT="$SHA" exec bash "$DIR_REPO/deploy/deploy.sh" "$SHA"
fi

if [[ ! -f "$BERKAS_ENV" ]]; then
  echo "Berkas $BERKAS_ENV belum ada. Jalankan deploy/bootstrap-vps.sh lebih dulu." >&2
  exit 1
fi

BUCKET=$(sed -n 's/^S3_BUCKET=//p' "$BERKAS_ENV" | tail -n 1)
if ! grep -Eq "^[[:space:]]*@storage path /${BUCKET} /${BUCKET}/\*$" deploy/drp.caddy; then
  echo "S3_BUCKET di $BERKAS_ENV ($BUCKET) tidak sama dengan path bucket di deploy/drp.caddy." >&2
  exit 1
fi

compose() {
  docker compose -f deploy/compose.prod.yml --env-file "$BERKAS_ENV" "$@"
}

echo "==> Memasang situs drp di proxy bersama"
SITUS="$DIR_PROXY/sites/drp.caddy"
if cmp -s deploy/drp.caddy "$SITUS"; then
  echo "Situs drp tidak berubah."
else
  CADANGAN=""
  if [[ -f "$SITUS" ]]; then
    CADANGAN=$(mktemp)
    cp "$SITUS" "$CADANGAN"
  fi
  cp deploy/drp.caddy "$SITUS"
  if ! docker compose -f "$DIR_PROXY/compose.yml" exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
    # Caddy tetap memakai konfigurasi lama. Kembalikan berkas lama agar reload aplikasi lain tidak ikut gagal.
    if [[ -n "$CADANGAN" ]]; then cp "$CADANGAN" "$SITUS"; else rm -f "$SITUS"; fi
    echo "caddy reload gagal; berkas situs drp dikembalikan ke versi sebelumnya." >&2
    exit 1
  fi
  [[ -n "$CADANGAN" ]] && rm -f "$CADANGAN"
  echo "Situs drp diperbarui dan Caddy dimuat ulang."
fi

echo "==> Membangun dan menyalakan stack drp"
compose up -d --build --remove-orphans

echo "==> Menunggu app sehat (maks. $BATAS_TUNGGU_DETIK detik)"
BATAS=$((SECONDS + BATAS_TUNGGU_DETIK))
while :; do
  ID_APP=$(compose ps -q app)
  STATUS=$( [[ -n "$ID_APP" ]] && docker inspect --format '{{.State.Health.Status}}' "$ID_APP" || echo "belum-ada")
  if [[ "$STATUS" == "healthy" ]]; then
    break
  fi
  if (( SECONDS >= BATAS )); then
    echo "app tidak sehat setelah $BATAS_TUNGGU_DETIK detik (status: $STATUS). Log terakhir:" >&2
    compose logs --tail 50 app >&2 || true
    exit 1
  fi
  sleep 5
done
echo "app sehat."

echo "==> Membersihkan image yang tidak terpakai"
docker image prune -f

echo "Deploy $SHA selesai."
