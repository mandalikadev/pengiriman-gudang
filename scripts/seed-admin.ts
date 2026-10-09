// Membuat admin pertama dari ADMIN_AWAL_NAMA, ADMIN_AWAL_EMAIL, ADMIN_AWAL_SANDI (lihat .env.example).
// Jalankan: pnpm db:seed-admin
import "dotenv/config";

const { seedAdminPertama } = await import("../src/server/auth/seed-admin");

const hasil = await seedAdminPertama(process.env);
console.log(hasil === "dibuat" ? "Admin pertama dibuat." : "Email admin pertama sudah terdaftar; tidak ada yang diubah.");
process.exit(0);
