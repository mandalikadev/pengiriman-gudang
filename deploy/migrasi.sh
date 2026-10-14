#!/bin/sh
# Langkah `migrasi` di deploy/compose.prod.yml (T130). Berjalan di image target `alat` setiap deploy:
# 1. migrasi skema (drizzle-kit migrate);
# 2. admin pertama dari ADMIN_AWAL_* (idempoten);
# 3. data master (db:seed-master) HANYA pada instalasi pertama, yaitu saat tabel `gudang` masih kosong. Seed hubungan
#    dan jadwal mengisi ulang toko yang tidak punya hubungan atau jadwal aktif, jadi menjalankannya setiap deploy akan
#    menyambungkan lagi toko yang sudah dilepas admin di produksi.
# Seed UAT (db:seed-uat) tidak pernah dijalankan di produksi.
set -eu

BIN=node_modules/.bin

echo "Migrasi skema database..."
"$BIN/drizzle-kit" migrate

JUMLAH_GUDANG=$(node --input-type=module -e "
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const [{ jumlah }] = await sql\`select count(*)::int as jumlah from gudang\`;
await sql.end();
console.log(jumlah);
")

echo "Admin pertama..."
"$BIN/tsx" scripts/seed-admin.ts

if [ "$JUMLAH_GUDANG" -eq 0 ]; then
  echo "Instalasi pertama (tabel gudang kosong): mengisi data master..."
  "$BIN/tsx" scripts/seed-master.ts
else
  echo "Data master sudah ada ($JUMLAH_GUDANG gudang); seed master dilewati."
fi
