// Mengisi lima gudang dan 25 toko master (T21), lalu hubungan toko–gudang dan jadwal aktif awal untuk Gudang Cibubur,
// Bali, dan Bandung dari lampiran pemilik (T84, PRD A3 dan A5 ▶ Keputusan 2026-10-12). Aman dijalankan berulang.
// Membutuhkan admin pertama (pnpm db:seed-admin). PMS, PMJ, QUEEN, MKS, DPM tetap tanpa hubungan (OD-12).
// Setelah itu data master dari src/server/data-awal (T88, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua): master produk,
// keluarga aroma (alias + segmen kode), pemetaan produk, dan alias nama stok. Hanya mengisi yang belum ada.
// Jalankan: pnpm db:seed-master
import "dotenv/config";

const { seedMasterGudangToko } = await import("../src/server/gudang/seed-master");
const { seedHubunganJadwalAwal } = await import("../src/server/gudang/seed-hubungan-jadwal");
const { seedDataMaster } = await import("../src/server/data-awal/seed-data-master");

await seedMasterGudangToko();
console.log("Master gudang dan toko sudah terisi.");

const hasil = await seedHubunganJadwalAwal();
if (hasil.keadaan === "gagal") {
  console.error(hasil.pesan);
  process.exit(1);
}
console.log(
  `Hubungan toko–gudang dan jadwal awal Cibubur, Bali, Bandung sudah terisi (${hasil.hubunganDibuat} hubungan dan ${hasil.jadwalDibuat} jadwal baru).`,
);

const master = await seedDataMaster();
if (master.keadaan === "gagal") {
  console.error(master.pesan);
  process.exit(1);
}
console.log(
  [
    "Data master sudah terisi. Baru ditambahkan:",
    `- ${master.produkDitambahkan} produk`,
    `- ${master.keluargaDitambahkan} keluarga aroma, ${master.aliasKeluargaDitambahkan} alias, ${master.segmenKodeDitambahkan} segmen kode`,
    `- ${master.pemetaanDiterapkan} pemetaan produk`,
    `- ${master.aliasStokDitambahkan} alias nama stok`,
  ].join("\n"),
);
process.exit(0);
