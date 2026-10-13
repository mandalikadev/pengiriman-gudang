import { resolve } from "node:path";

/**
 * Persiapan e2e: database test dibuat ulang + migrasi, master gudang/toko, bucket storage, dan admin e2e.
 *
 * Dijalankan sebagai skrip (`tsx tests/e2e/siapkan.ts`) di awal perintah webServer pertama, bukan sebagai
 * `globalSetup`: Playwright menyalakan semua webServer lebih dulu baru menjalankan globalSetup, sehingga
 * `drop database ... with (force)` dulu memutus koneksi worker dan menghapus skema pg-boss di tengah run.
 * Spec hanya mengimpor konstanta akun admin dari berkas ini.
 */
export const EMAIL_ADMIN_E2E = "admin-e2e@uji.mandalika.test";
export const SANDI_ADMIN_E2E = "sandi-e2e-12345";

async function siapkan() {
  const { default: siapkanDatabase } = await import("../siapkan-database");
  await siapkanDatabase();
  const { seedMasterGudangToko } = await import("../../src/server/gudang/seed-master");
  await seedMasterGudangToko();
  const { pastikanBucket } = await import("../../src/server/impor/penyimpanan");
  await pastikanBucket();

  const { eq } = await import("drizzle-orm");
  const { db } = await import("../../src/server/db");
  const { user } = await import("../../src/server/db/schema");
  const ada = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL_ADMIN_E2E));
  if (ada.length === 0) {
    const { auth } = await import("../../src/server/auth/auth");
    await auth.api.createUser({
      body: { email: EMAIL_ADMIN_E2E, password: SANDI_ADMIN_E2E, name: "Admin E2E", role: "admin" },
    });
  } else {
    await db.update(user).set({ banned: false, role: "admin" }).where(eq(user.email, EMAIL_ADMIN_E2E));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  // Pool koneksi database aplikasi tetap terbuka; skrip diakhiri eksplisit.
  siapkan().then(
    () => {
      console.log("Persiapan e2e selesai.");
      process.exit(0);
    },
    (galat: unknown) => {
      console.error("Persiapan e2e gagal:", galat);
      process.exit(1);
    },
  );
}
