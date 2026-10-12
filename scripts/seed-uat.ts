// Seed UAT (T89, PRD A3 ▶ Keputusan 2026-10-12, UAT kedua): periode sumber Juni–Agustus 2026 untuk Gudang Cibubur,
// Bali, Bandung, dan akun Operator Cibubur, Bali, Bandung (viewer, kelima hak tindakan di gudangnya) dengan kata sandi
// UAT_SANDI_OPERATOR. Hanya dipanggil pnpm uat, bukan instalasi produksi. Aman dijalankan berulang.
// Membutuhkan admin pertama dan master gudang (pnpm db:seed-admin, pnpm db:seed-master).
// Jalankan: pnpm db:seed-uat
import "dotenv/config";

const { seedUat } = await import("../src/server/gudang/seed-uat");

const hasil = await seedUat(process.env);
if (hasil.keadaan === "gagal") {
  console.error(hasil.pesan);
  process.exit(1);
}
console.log(
  [
    "Data UAT sudah terisi. Baru ditambahkan:",
    `- ${hasil.periodeDibuat} periode sumber (Juni–Agustus 2026)`,
    `- ${hasil.akunDibuat} akun operator, ${hasil.penugasanDibuat} penugasan`,
  ].join("\n"),
);
if (hasil.peringatan !== null) console.warn(`Peringatan: ${hasil.peringatan}`);
process.exit(0);
