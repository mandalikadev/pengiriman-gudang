#!/usr/bin/env bash
# Persiapan sekali di VPS bersama (T130, docs/DEPLOY.md). Dijalankan pemilik sebagai user deploy (anggota grup
# docker), bukan root. Aman dijalankan berulang:
# - /opt/proxy (proxy HTTPS bersama): jika belum ada, dipasang dari deploy/proxy/ dan Caddy dinyalakan; jika sudah
#   ada, tidak diubah. Network Docker `proxy` dibuat jika belum ada.
# - /opt/drp (milik user yang menjalankan): clone repo publik ke /opt/drp/repo jika belum ada, folder backup, dan
#   /opt/drp/.env dari deploy/.env.produksi.example dengan rahasia acak, HANYA jika .env belum ada.
# Tidak menyentuh firewall (ufw/iptables), user sistem, paket, atau layanan sistem.
#
# Pemakaian (di VPS):
#   curl -fsSL https://raw.githubusercontent.com/mandalikadev/pengiriman-gudang/main/deploy/bootstrap-vps.sh -o bootstrap-vps.sh
#   bash bootstrap-vps.sh
set -euo pipefail

URL_REPO=https://github.com/mandalikadev/pengiriman-gudang.git
DIR_DRP=/opt/drp
DIR_REPO="$DIR_DRP/repo"
BERKAS_ENV="$DIR_DRP/.env"
DIR_PROXY=/opt/proxy

for perintah in docker git openssl; do
  if ! command -v "$perintah" > /dev/null; then
    echo "Perintah '$perintah' tidak ditemukan. Pasang dulu (skrip ini tidak memasang paket)." >&2
    exit 1
  fi
done
if ! docker compose version > /dev/null 2>&1; then
  echo "Docker Compose v2 (docker compose) tidak tersedia." >&2
  exit 1
fi
if ! docker info > /dev/null 2>&1; then
  echo "User $(id -un) tidak bisa menjalankan docker. Jalankan sebagai user anggota grup docker." >&2
  exit 1
fi

# Membuat folder di /opt milik user ini. sudo hanya dipakai jika /opt tidak bisa ditulis langsung.
buat_folder_milik_saya() {
  local folder="$1"
  [[ -d "$folder" ]] && return 0
  if mkdir -p "$folder" 2> /dev/null; then return 0; fi
  sudo install -d -o "$(id -un)" -g "$(id -gn)" "$folder"
}

echo "==> Folder aplikasi $DIR_DRP"
buat_folder_milik_saya "$DIR_DRP"
mkdir -p "$DIR_DRP/backup"
if [[ -d "$DIR_REPO/.git" ]]; then
  echo "Repo sudah ada di $DIR_REPO; tidak diubah (deploy.sh yang memperbaruinya)."
else
  git clone --quiet "$URL_REPO" "$DIR_REPO"
  echo "Repo di-clone ke $DIR_REPO."
fi
chmod +x "$DIR_REPO/deploy/deploy.sh"

echo "==> Berkas lingkungan $BERKAS_ENV"
if [[ -f "$BERKAS_ENV" ]]; then
  echo "$BERKAS_ENV sudah ada; tidak ditimpa."
else
  isi_env() {
    local nama="$1" nilai="$2"
    sed -i "s|^${nama}=.*$|${nama}=${nilai}|" "$BERKAS_ENV.baru"
  }
  cp "$DIR_REPO/deploy/.env.produksi.example" "$BERKAS_ENV.baru"
  chmod 600 "$BERKAS_ENV.baru"
  isi_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  isi_env BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
  isi_env S3_ACCESS_KEY_ID "drp$(openssl rand -hex 8)"
  isi_env S3_SECRET_ACCESS_KEY "$(openssl rand -hex 24)"
  mv "$BERKAS_ENV.baru" "$BERKAS_ENV"
  echo "$BERKAS_ENV dibuat dengan rahasia acak (sandi PostgreSQL, BETTER_AUTH_SECRET, kredensial MinIO)."
fi

echo "==> Network Docker bersama 'proxy'"
if docker network inspect proxy > /dev/null 2>&1; then
  echo "Network proxy sudah ada."
else
  docker network create proxy > /dev/null
  echo "Network proxy dibuat."
fi

echo "==> Proxy bersama $DIR_PROXY"
if [[ -e "$DIR_PROXY" ]]; then
  echo "$DIR_PROXY sudah ada; tidak diubah."
else
  buat_folder_milik_saya "$DIR_PROXY"
  mkdir -p "$DIR_PROXY/sites"
  cp "$DIR_REPO/deploy/proxy/compose.yml" "$DIR_REPO/deploy/proxy/Caddyfile" "$DIR_PROXY/"
  docker compose -f "$DIR_PROXY/compose.yml" up -d
  echo "Caddy menyala di port 80/443."
fi

cat << SELESAI

Persiapan selesai. Sisa langkah (lihat docs/DEPLOY.md):
1. Isi ADMIN_AWAL_NAMA, ADMIN_AWAL_EMAIL, ADMIN_AWAL_SANDI di $BERKAS_ENV.
2. Pastikan DNS A record drp.mandalika.web.id mengarah ke IP VPS ini.
3. Tambahkan public key deploy ke ~/.ssh/authorized_keys user $(id -un).
4. Isi secrets GitHub repo: VPS_HOST, VPS_USER ($(id -un)), VPS_SSH_KEY (private key deploy).
5. Jalankan workflow Deploy (Actions > Deploy > Run workflow), atau tunggu merge berikutnya ke main.
SELESAI
