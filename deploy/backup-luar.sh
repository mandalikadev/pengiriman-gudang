#!/bin/sh
# Backup luar VPS ke Google Drive (Shared Drive) dengan rclone (T131, docs/DEPLOY.md). Dijalankan layanan
# `backup-luar` di deploy/compose.prod.yml (image rclone/rclone, shell busybox).
#
# Satu putaran per nyala container:
# 1. Menunggu sampai 1 jam setelah jam dump harian layanan `backup` (dari waktu ubah dump terbaru di /backup; jika
#    belum ada dump, 1 jam dari sekarang).
# 2. Menyalin dump terbaru ke gdrive:drp/database/.
# 3. `rclone sync` bucket S3_BUCKET di MinIO ke gdrive:drp/workbook/ (workbook tidak dihapus berdasarkan umur).
# 4. Menghapus dump di gdrive:drp/database/ yang lebih tua dari 30 hari.
# Lalu keluar: 0 jika semua langkah berhasil, 1 jika ada yang gagal. Docker (restart: unless-stopped) menyalakannya
# lagi dan putaran berikutnya menunggu jadwal hari berikutnya. Kegagalan tidak memengaruhi layanan lain.
#
# Remote `gdrive` dan `minio` dikonfigurasi lewat variabel RCLONE_CONFIG_* di compose.prod.yml.
# Tanpa BACKUP_GDRIVE_DRIVE_ID dan BACKUP_GDRIVE_FOLDER_ID, hanya mencatat bahwa backup luar belum dikonfigurasi.
set -u

log() {
  echo "[backup-luar] $(date '+%F %T %Z') $*"
}

if [ -z "${BACKUP_GDRIVE_DRIVE_ID:-}" ] && [ -z "${BACKUP_GDRIVE_FOLDER_ID:-}" ]; then
  log "Backup luar belum dikonfigurasi: BACKUP_GDRIVE_DRIVE_ID dan BACKUP_GDRIVE_FOLDER_ID kosong di /opt/drp/.env. Tidak ada yang disalin."
  exec sleep infinity
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

gagal=0

terbaru=$(dump_terbaru)
if [ -z "$terbaru" ]; then
  log "GAGAL: tidak ada dump drp-*.sql.gz di /opt/drp/backup. Periksa layanan backup." >&2
  gagal=1
elif rclone copy "$terbaru" gdrive:drp/database/; then
  log "Dump disalin: $(basename "$terbaru") -> drp/database/"
else
  log "GAGAL menyalin dump $(basename "$terbaru") ke Google Drive." >&2
  gagal=1
fi

if rclone sync "minio:${S3_BUCKET:?}" gdrive:drp/workbook/; then
  log "Bucket ${S3_BUCKET} disinkronkan -> drp/workbook/"
else
  log "GAGAL menyinkronkan bucket ${S3_BUCKET} ke Google Drive." >&2
  gagal=1
fi

if rclone delete gdrive:drp/database/ --min-age 30d --include 'drp-*.sql.gz'; then
  log "Dump di drp/database/ yang lebih tua dari 30 hari dihapus."
else
  log "GAGAL menghapus dump lama di Google Drive." >&2
  gagal=1
fi

if [ "$gagal" -ne 0 ]; then
  log "Backup luar GAGAL (kode keluar 1). Dicoba lagi pada jadwal berikutnya." >&2
  exit 1
fi
log "Backup luar selesai."
