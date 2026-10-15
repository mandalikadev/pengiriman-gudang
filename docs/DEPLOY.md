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
  rahasia/                   chmod 700; google-drive-token.json (token OAuth rclone untuk backup luar, T132)
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
| `backup-luar` | rclone: salinan harian dump dan bucket ke Google Drive (lihat [Backup ke Google Drive](#backup-ke-google-drive)) | internal |

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
drp logs --tail 20 backup-luar  # hasil backup ke Google Drive
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

Backup ini hanya mencakup database dan hilang jika VPS rusak. Salinan di luar VPS, termasuk workbook di MinIO, ada di Google Drive (bagian berikut).

## Backup ke Google Drive

Layanan `backup-luar` (image `rclone/rclone`, skrip `deploy/backup-luar.sh`) menyalin backup ke **My Drive** sebuah akun Google biasa milik perusahaan, di folder **`Backup DRP`** pada root My Drive. Folder itu dibuat otomatis oleh rclone. Setiap hari, **1 jam setelah** `pg_dump` layanan `backup`:

- dump terbaru disalin ke `Backup DRP/drp/database/`;
- isi bucket MinIO (`S3_BUCKET`, workbook yang diunggah) disalin (`rclone copy`) ke `Backup DRP/drp/workbook/`. Workbook di Drive tidak pernah dihapus, baik karena umur maupun karena hilang dari bucket. Bucket kosong (mis. di VPS baru) tidak mengosongkan Drive;
- dump di `Backup DRP/drp/database/` yang lebih tua dari 30 hari dihapus (masuk sampah Google Drive).

Autentikasinya token OAuth rclone (login Google sekali) dengan scope `drive.file`: rclone hanya bisa melihat dan mengubah berkas yang ia buat sendiri, bukan isi Drive lainnya. Token disimpan di `/opt/drp/rahasia/google-drive-token.json`, tidak di repo dan tidak di `.env`. Setiap putaran, token dibaca dari berkas itu. Access token berlaku sekitar 1 jam, jadi rclone memperbaruinya dengan refresh token di dalam token itu. Hasil pembaruan hanya ditulis ke konfigurasi sementara di dalam container; berkas token tidak diubah.

Jika satu langkah gagal, log mencatat `GAGAL ...` dan container keluar dengan kode 1. Docker menyalakannya lagi, dan percobaan berikutnya pada jadwal hari berikutnya. `app` dan `worker` tidak terpengaruh. Selama berkas token belum ada, `backup-luar` hanya mencatat `Backup luar belum dikonfigurasi: /opt/drp/rahasia/google-drive-token.json belum ada ...` dan tidak menyalin apa pun.

### Persiapan sekali (pemilik)

1. **Buat token di laptop Linux** dengan Docker (image yang sama dengan VPS). Login memakai **akun Google yang dipegang perusahaan**, bukan akun pribadi:
   ```bash
   umask 077
   docker run --rm --network host -e RCLONE_DRIVE_SCOPE=drive.file \
     rclone/rclone:1.75.1 authorize "drive" --auth-no-open-browser \
     | grep '^{' > google-drive-token.json
   ```
   Terminal mencetak `Please go to the following link: http://127.0.0.1:53682/auth?state=...`. Buka alamat itu di browser laptop yang sama, login, lalu pilih *Allow* (Izinkan). Browser menampilkan `Success!` dan perintah selesai. Periksa bahwa token tersimpan (tanpa menampilkan isinya):
   ```bash
   test -s google-drive-token.json && echo "Token tersimpan."
   ```
   `--network host` diperlukan agar browser bisa menjangkau rclone di `127.0.0.1:53682`. Di Docker Desktop, aktifkan dulu *Settings > Resources > Network > Enable host networking*.
2. **Salin token ke VPS**, lalu hapus salinan di laptop:
   ```bash
   scp google-drive-token.json <user-deploy>@<vps>:/opt/drp/rahasia/google-drive-token.json
   rm google-drive-token.json
   ```
3. **Batasi aksesnya**:
   ```bash
   ssh <user-deploy>@<vps> chmod 600 /opt/drp/rahasia/google-drive-token.json
   ```
4. **Terapkan dan periksa akses** di VPS:
   ```bash
   cd /opt/drp/repo
   drp restart backup-luar
   drp run --rm --no-deps backup-luar rclone lsd gdrive:   # tanpa galat = akses benar
   drp logs --tail 5 backup-luar                          # jadwal putaran berikutnya
   ```
   Sebelum putaran pertama, `lsd` belum menampilkan apa pun karena rclone baru melihat folder yang ia buat sendiri. Jangan membuat folder `Backup DRP` secara manual: rclone tidak melihatnya dan akan membuat folder baru dengan nama yang sama.

### Memeriksa backup terakhir

```bash
cd /opt/drp/repo
drp logs --tail 20 backup-luar                                                   # "Backup luar selesai." atau "GAGAL ..."
drp run --rm --no-deps backup-luar rclone lsl "gdrive:Backup DRP/drp/database/"  # dump yang tersimpan, dengan tanggal
drp run --rm --no-deps backup-luar rclone size "gdrive:Backup DRP/drp/workbook/" # jumlah dan ukuran workbook
```

Isi yang sama terlihat di Google Drive akun itu, folder `Backup DRP` > `drp` > `database` dan `workbook`.

### Memulihkan dari Google Drive

**Ke VPS baru** (VPS lama rusak):

1. Siapkan VPS baru seperti [Persiapan sekali](#persiapan-sekali) dan deploy pertama, lalu buat token baru dan pasang dengan langkah 1–3 [persiapan backup](#persiapan-sekali-pemilik), memakai akun Google yang sama. Token baru tetap bisa membaca folder `Backup DRP` yang dibuat token lama.
2. Hentikan `backup-luar` selama pemulihan. Layanan `backup` di VPS baru langsung membuat dump database yang masih kosong. Jika `backup-luar` berjalan, dump itu bisa menimpa dump bertanggal sama di Drive:
   ```bash
   cd /opt/drp/repo
   drp stop backup-luar
   ```
3. Unduh dump yang dipilih ke `/opt/drp/backup`:
   ```bash
   drp run --rm --no-deps backup-luar rclone lsl "gdrive:Backup DRP/drp/database/"
   drp run --rm --no-deps -v /opt/drp/backup:/pulih backup-luar rclone copy "gdrive:Backup DRP/drp/database/drp-2026-10-14.sql.gz" /pulih/
   ```
4. Pulihkan database dengan perintah di [Memulihkan dari backup](#memulihkan-dari-backup) memakai berkas itu.
5. Pulihkan workbook ke bucket, lalu nyalakan lagi `backup-luar`:
   ```bash
   drp run --rm backup-luar rclone copy "gdrive:Backup DRP/drp/workbook/" "minio:$(sed -n 's/^S3_BUCKET=//p' /opt/drp/.env)"
   drp start backup-luar
   ```

**Ke laptop** (memeriksa data lama), memakai stack pengembangan (`docker compose up -d`, PostgreSQL di port 55432):

1. Unduh dump dari Google Drive di browser (folder `Backup DRP` > `drp` > `database`), mis. `drp-2026-10-14.sql.gz`.
2. Pulihkan ke database baru `drp_pulih`, sehingga database pengembangan `mandalika` tidak tersentuh, lalu jalankan aplikasi dengan database itu:
   ```bash
   docker compose exec -T postgres createdb -U mandalika drp_pulih
   gunzip -c drp-2026-10-14.sql.gz | docker compose exec -T postgres psql -q -v ON_ERROR_STOP=1 -U mandalika -d drp_pulih
   DATABASE_URL=postgres://mandalika:mandalika@localhost:55432/drp_pulih pnpm dev
   ```
   Masuk dengan akun produksi. Untuk mengulang, hapus dulu: `docker compose exec -T postgres dropdb -U mandalika --force drp_pulih`.
3. Workbook (jika perlu): unduh folder `Backup DRP` > `drp` > `workbook` dari Google Drive, ekstrak ke `./workbook`, lalu salin ke MinIO lokal:
   ```bash
   docker run --rm -v "$PWD/workbook:/workbook:ro" --add-host host.docker.internal:host-gateway \
     -e RCLONE_CONFIG_LOKAL_TYPE=s3 -e RCLONE_CONFIG_LOKAL_PROVIDER=Minio \
     -e RCLONE_CONFIG_LOKAL_ENDPOINT=http://host.docker.internal:59000 \
     -e RCLONE_CONFIG_LOKAL_ACCESS_KEY_ID=minioadmin -e RCLONE_CONFIG_LOKAL_SECRET_ACCESS_KEY=minioadmin \
     rclone/rclone:1.75.1 copy /workbook lokal:mandalika
   ```

### Mencabut atau mengganti token

1. Login ke [myaccount.google.com](https://myaccount.google.com/) dengan akun backup > *Security* (Keamanan) > *Third-party apps & services* (Aplikasi dan layanan pihak ketiga) > **rclone** > *Remove access* (Hapus akses). Token di VPS langsung tidak berlaku; putaran berikutnya mencatat `GAGAL`.
2. Untuk melanjutkan backup, buat token baru dan pasang dengan langkah 1–4 [persiapan backup](#persiapan-sekali-pemilik). Berkas lama di VPS ditimpa.

### Batasan

- Backup terikat ke satu akun Google. Jika akun itu dihapus, aksesnya dicabut, atau kuota Drive-nya penuh, log mencatat `GAGAL` dan tidak ada salinan baru sampai token baru dipasang (atau kuota dikosongkan). Periksa log secara berkala ([Memeriksa backup terakhir](#memeriksa-backup-terakhir)); tidak ada notifikasi otomatis.
- Dump yang dihapus masuk sampah Google Drive dan tetap memakai kuota sampai sampah dikosongkan (otomatis oleh Google setelah 30 hari).
- Token memakai client ID bawaan rclone. rclone 1.75.1 mencatat `NOTICE` bahwa client ID bersama ini sedang dipensiunkan. Jika Google berhenti menerimanya, putaran mencatat `GAGAL`.

## Uji lokal

Lihat deskripsi PR T130 untuk cara uji asap `compose.prod.yml` dan proxy di laptop (Docker-in-Docker sebagai tiruan VPS, tanpa menyentuh port 80/443 laptop), dan PR T131 serta T132 untuk uji asap `backup-luar` dengan remote rclone `local` sebagai pengganti Google Drive.
