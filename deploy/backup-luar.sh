#!/bin/sh
# Backup luar VPS ke My Drive akun Google biasa dengan rclone (T131, T132, docs/DEPLOY.md). Dijalankan layanan
# `backup-luar` di deploy/compose.prod.yml (image rclone/rclone, shell busybox).
#
# Satu putaran per nyala container:
# 1. Menunggu sampai 1 jam setelah jam dump harian layanan `backup` (dari waktu ubah dump terbaru di /backup; jika
#    belum ada dump, 1 jam dari sekarang).
# 2. Menyalin token OAuth dari /rahasia/google-drive-token.json ke berkas konfigurasi rclone sementara (RCLONE_CONFIG
#    di tmpfs). Access token yang diperbarui rclone ditulis ke berkas sementara itu, bukan ke berkas token.
# 3. Menyalin dump terbaru ke gdrive:Backup DRP/drp/database/.
# 4. `rclone copy` bucket S3_BUCKET di MinIO ke gdrive:Backup DRP/drp/workbook/. Workbook di Drive tidak pernah
#    dihapus, juga jika hilang dari bucket.
# 5. Menghapus dump di gdrive:Backup DRP/drp/database/ yang lebih tua dari 30 hari.
# Lalu keluar: 0 jika semua langkah berhasil, 1 jika ada yang gagal. Docker (restart: unless-stopped) menyalakannya
# lagi dan putaran berikutnya menunggu jadwal hari berikutnya. Kegagalan tidak memengaruhi layanan lain.
#
# Remote `gdrive` (tipe dan scope) dan `minio` dikonfigurasi lewat variabel RCLONE_CONFIG_* di compose.prod.yml.
# Tanpa berkas token, hanya mencatat bahwa backup luar belum dikonfigurasi.
#
# Dengan argumen, skrip menjalankan perintah itu dengan token sudah dimuat (untuk docs/DEPLOY.md), mis.
#   backup-luar.sh rclone lsd gdrive:
set -u

BERKAS_TOKEN=/rahasia/google-drive-token.json
TUJUAN="gdrive:Backup DRP/drp"

log() {
  echo "[backup-luar] $(date '+%F %T %Z') $*"
}

# Token JSON hasil `rclone authorize "drive"` (satu baris; baris baru dibuang jika JSON-nya disalin terlipat).
muat_token() {
  token=$(tr -d '\r\n' < "$BERKAS_TOKEN") && [ -n "$token" ] || return 1
  printf '[gdrive]\ntoken = %s\n' "$token" > "${RCLONE_CONFIG:?}"
}

if [ ! -f "$BERKAS_TOKEN" ]; then
  log "Backup luar belum dikonfigurasi: /opt/drp/rahasia/google-drive-token.json belum ada. Tidak ada yang disalin. Lihat docs/DEPLOY.md bagian \"Backup ke Google Drive\"."
  [ "$#" -eq 0 ] || exit 1
  exec sleep infinity
fi

if [ "$#" -gt 0 ]; then
  muat_token || {
    log "GAGAL membaca token /opt/drp/rahasia/google-drive-token.json (kosong atau tidak terbaca)." >&2
    exit 1
  }
  exec "$@"
fi

dump_terbaru() {
  ls -1t /backup/drp-*.sql.gz 2> /dev/null | head -n 1
}

# Jadwal: 1 jam setelah jam dump harian, putaran berikutnya yang masih di masa depan.
sekarang=$(date +%s)
terbaru=$(dump_terbaru)
if [ -n "$terbaru" ]; then
  target=$(($(stat -c %Y "$terbaru") + 3600))
  while [ "$target" -le "$sekarang" ]; do
    target=$((target + 86400))
  done
else
  target=$((sekarang + 3600))
fi
log "Putaran berikutnya: $(date -d "@$target" '+%F %T %Z')."
sleep $((target - sekarang))

if ! muat_token; then
  log "GAGAL membaca token /opt/drp/rahasia/google-drive-token.json (kosong atau tidak terbaca)." >&2
  log "Backup luar GAGAL (kode keluar 1). Dicoba lagi pada jadwal berikutnya." >&2
  exit 1
fi

gagal=0

terbaru=$(dump_terbaru)
if [ -z "$terbaru" ]; then
  log "GAGAL: tidak ada dump drp-*.sql.gz di /opt/drp/backup. Periksa layanan backup." >&2
  gagal=1
elif rclone copy "$terbaru" "$TUJUAN/database/"; then
  log "Dump disalin: $(basename "$terbaru") -> Backup DRP/drp/database/"
else
  log "GAGAL menyalin dump $(basename "$terbaru") ke Google Drive." >&2
  gagal=1
fi

if rclone copy "minio:${S3_BUCKET:?}" "$TUJUAN/workbook/"; then
  log "Bucket ${S3_BUCKET} disalin -> Backup DRP/drp/workbook/"
else
  log "GAGAL menyalin bucket ${S3_BUCKET} ke Google Drive." >&2
  gagal=1
fi

if rclone delete "$TUJUAN/database/" --min-age 30d --include 'drp-*.sql.gz'; then
  log "Dump di Backup DRP/drp/database/ yang lebih tua dari 30 hari dihapus."
else
  log "GAGAL menghapus dump lama di Google Drive." >&2
  gagal=1
fi

if [ "$gagal" -ne 0 ]; then
  log "Backup luar GAGAL (kode keluar 1). Dicoba lagi pada jadwal berikutnya." >&2
  exit 1
fi
log "Backup luar selesai."
