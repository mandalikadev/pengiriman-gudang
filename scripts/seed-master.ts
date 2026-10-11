// Mengisi lima gudang dan 25 toko master (T21), lalu hubungan toko–gudang dan jadwal aktif awal untuk Gudang Cibubur,
// Bali, dan Bandung dari lampiran pemilik (T84, PRD A3 dan A5 ▶ Keputusan 2026-10-12). Aman dijalankan berulang.
// Membutuhkan admin pertama (pnpm db:seed-admin). PMS, PMJ, QUEEN, MKS, DPM tetap tanpa hubungan (OD-12).
// Jalankan: pnpm db:seed-master
import "dotenv/config";

const { seedMasterGudangToko } = await import("../src/server/gudang/seed-master");
const { seedHubunganJadwalAwal } = await import("../src/server/gudang/seed-hubungan-jadwal");

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
process.exit(0);
