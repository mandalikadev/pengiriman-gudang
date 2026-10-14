# Deploy produksi (VPS drp.mandalika.web.id)

Setiap commit di `main` yang CI-nya hijau otomatis terpasang di VPS lewat workflow `Deploy` (`.github/workflows/deploy.yml`). Image dibangun di VPS dari commit itu; tidak ada container registry. Selain persiapan sekali di awal, tidak ada langkah manual.

## Susunan VPS bersama

VPS juga dipakai aplikasi lain milik pemilik (mis. HRIS). Setiap aplikasi punya folder dan compose project sendiri. Proxy HTTPS dipakai bersama.

```
/opt/proxy/                  proxy HTTPS bersama (dari deploy/proxy/), satu-satunya pemegang port 80/443
  compose.yml                compose project `proxy`: satu container Caddy, network eksternal `proxy`
  Caddyfile                  hanya `import /etc/caddy/sites/*.caddy`
  sites/drp.caddy            situs aplikasi ini (disalin deploy.sh dari deploy/drp.caddy)
  sites/<aplikasi-lain>.caddy
/opt/drp/                    aplikasi ini, milik user deploy
  .env                       variabel produksi (dari deploy/.env.produksi.example), chmod 600, tidak di-commit
  repo/                      clone repo publik; deploy.sh checkout commit yang di-deploy
  backup/                    pg_dump harian drp-YYYY-MM-DD.sql.gz, 14 hari terakhir
```

Stack aplikasi (`deploy/compose.prod.yml`, compose project `drp`):

| Layanan | Isi | Network |
|---|---|---|
| `postgres` | PostgreSQL 16, volume `drp_postgres-data` | internal (`drp_default`) |
| `minio` | storage S3, volume `drp_minio-data`, konsol dimatikan | internal + `proxy` (alias `drp-minio`) |
| `migrasi` | sekali jalan setiap deploy: `drizzle-kit migrate`, admin pertama, data master hanya pada instalasi pertama | internal |
| `app` | Next.js (`node server.js`), healthcheck `/masuk` | internal + `proxy` (alias `drp-app`) |
| `worker` | worker impor pg-boss | internal |
| `backup` | `pg_dump` harian ke `/opt/drp/backup` | internal |

Tidak ada layanan stack `drp` yang memublikasikan port ke host. Caddy meneruskan `https://drp.mandalika.web.id/mandalika/*` (bucket `S3_BUCKET`) ke MinIO dengan header Host asli, sehingga presigned URL unggahan tetap sah, dan sisanya ke aplikasi. Sertifikat Let's Encrypt diurus Caddy.

`app` dan `worker` memanggil storage lewat `S3_ENDPOINT=https://drp.mandalika.web.id`. Di dalam container, nama domain itu diarahkan ke host (`extra_hosts: host-gateway`), yaitu ke Caddy di port 443.

### Menyambungkan aplikasi lain ke proxy

1. Sambungkan layanan web aplikasi itu ke network eksternal `proxy` dengan alias yang unik di VPS, tanpa port host:
   ```yaml
   services:
     web:
       networks:
         default:
         proxy:
           aliases: [hris-web]
   networks:
     proxy:
       external: true
   ```
2. Taruh satu berkas situs, mis. `/opt/proxy/sites/hris.caddy`:
   ```
   hris.mandalika.web.id {
   	reverse_proxy hris-web:8000
   }
   ```
3. Muat ulang Caddy (situs lain tidak terganggu, proxy tidak di-restart):
   ```bash
   docker compose -f /opt/proxy/compose.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile
   ```

Jangan mengubah `/opt/proxy/Caddyfile` atau berkas situs milik aplikasi lain.

## Persiapan sekali

1. **DNS**: A record `drp.mandalika.web.id` ke IP VPS. Port 80 dan 443 harus terbuka dari internet agar Let's Encrypt bisa menerbitkan sertifikat.
2. **Bootstrap** di VPS, sebagai user deploy (anggota grup `docker`, bukan root):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/mandalikadev/pengiriman-gudang/main/deploy/bootstrap-vps.sh -o bootstrap-vps.sh
   bash bootstrap-vps.sh
   ```
   Skrip ini membuat `/opt/drp` (clone repo, folder backup, `.env` dengan rahasia acak) dan, jika belum ada, `/opt/proxy` beserta network `proxy` dan container Caddy. Aman dijalankan ulang: `.env`, repo, dan `/opt/proxy` yang sudah ada tidak ditimpa. Firewall, user sistem, dan paket tidak disentuh. `sudo` hanya dipakai untuk membuat folder di `/opt` jika `/opt` tidak bisa ditulis.
3. **Admin pertama**: isi `ADMIN_AWAL_NAMA`, `ADMIN_AWAL_EMAIL`, `ADMIN_AWAL_SANDI` di `/opt/drp/.env`. Nilai lain sudah terisi.
4. **Kunci SSH deploy**: buat pasangan kunci khusus deploy (di laptop):
   ```bash
   ssh-keygen -t ed25519 -N "" -C deploy-drp -f kunci-deploy-drp
   ```
   Tambahkan isi `kunci-deploy-drp.pub` ke `~/.ssh/authorized_keys` user deploy di VPS.
5. **Secrets GitHub** (Settings > Secrets and variables > Actions): `VPS_HOST` (IP atau nama host VPS), `VPS_USER` (user deploy), `VPS_SSH_KEY` (isi berkas `kunci-deploy-drp`). Lalu hapus private key dari laptop.
6. **Deploy pertama**: Actions > Deploy > Run workflow (branch `main`). Langkah `migrasi` mengisi admin pertama dan data master `db:seed-master` (gudang, toko, hubungan, jadwal tetap Cibubur/Bali/Bandung, produk, keluarga aroma, pemetaan, alias stok). Data UAT tidak pernah diisi di produksi.

## Cara kerja deploy

Workflow `Deploy` berjalan saat workflow `CI` selesai **hijau** untuk push ke `main`. PR dan CI merah tidak memicu deploy. Hanya satu deploy berjalan sekaligus; deploy berikutnya menunggu, tidak membatalkan yang sedang berjalan. Workflow itu menjalankan lewat SSH:

```bash
bash /opt/drp/repo/deploy/deploy.sh <sha-commit>
```

`deploy.sh` mengambil dan checkout commit itu, memasang `deploy/drp.caddy` ke `/opt/proxy/sites/drp.caddy` lalu `caddy reload` jika berkas itu berubah (jika reload gagal, berkas lama dikembalikan), menjalankan `docker compose -f deploy/compose.prod.yml --env-file /opt/drp/.env up -d --build --remove-orphans`, menunggu `app` sehat (maks. 3 menit), dan `docker image prune -f`. Jika satu langkah gagal (build, migrasi, app tidak sehat, reload Caddy), workflow merah dan container lama yang belum diganti tetap berjalan.

Langkah `migrasi` berjalan setiap deploy, sebelum `app` dan `worker` menyala:
- `drizzle-kit migrate`;
- admin pertama (`db:seed-admin`, idempoten);
- `db:seed-master` **hanya jika tabel `gudang` kosong** (instalasi pertama). Toko yang dilepas admin di produksi tidak tersambung lagi saat deploy berikutnya. Jika seed master pertama gagal di tengah jalan, jalankan ulang manual (lihat di bawah).

### Deploy ulang manual

Actions > Deploy > Run workflow (branch `main`) memasang ulang commit terakhir `main`. Langsung di VPS:

```bash
bash /opt/drp/repo/deploy/deploy.sh "$(git -C /opt/drp/repo rev-parse origin/main)"
```

## Operasional

Semua perintah compose dijalankan dari `/opt/drp/repo`:

```bash
cd /opt/drp/repo
alias drp='docker compose -f deploy/compose.prod.yml --env-file /opt/drp/.env'
drp ps                          # status layanan
drp logs -f --tail 100 app      # log aplikasi
drp logs -f --tail 100 worker   # log worker impor
drp logs migrasi                # hasil migrasi deploy terakhir
drp logs backup                 # hasil backup
docker compose -f /opt/proxy/compose.yml logs -f --tail 100 caddy   # log proxy dan sertifikat
```

Menjalankan seed master secara manual (hanya jika seed instalasi pertama gagal):

```bash
drp run --rm migrasi node_modules/.bin/tsx scripts/seed-master.ts
```

### Memulihkan dari backup

Backup berupa SQL biasa (`pg_dump --no-owner`) di `/opt/drp/backup/drp-YYYY-MM-DD.sql.gz`. Pemulihan membuat ulang database lalu mengisinya dari backup, jadi semua perubahan setelah backup itu hilang:

```bash
cd /opt/drp/repo
drp stop app worker
drp exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c /opt/drp/backup/drp-2026-10-14.sql.gz | drp exec -T postgres sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
drp start app worker
```

Backup hanya mencakup database. Workbook di MinIO (volume `drp_minio-data`) dan salinan backup ke luar VPS belum termasuk (T131).

## Uji lokal

Lihat deskripsi PR T130 untuk cara uji asap `compose.prod.yml` dan proxy di laptop (Docker-in-Docker sebagai tiruan VPS, tanpa menyentuh port 80/443 laptop).
