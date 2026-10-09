// Mengisi lima gudang dan 25 toko master (T21). Aman dijalankan berulang.
// Hubungan toko–gudang tidak diisi: datanya menyusul dari pemilik (OD-12).
// Jalankan: pnpm db:seed-master
import "dotenv/config";

const { seedMasterGudangToko } = await import("../src/server/gudang/seed-master");

await seedMasterGudangToko();
console.log("Master gudang dan toko sudah terisi.");
process.exit(0);
