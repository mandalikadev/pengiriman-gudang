// globalSetup Playwright: migrasi database test, master gudang/toko, bucket storage, dan admin e2e.
export const EMAIL_ADMIN_E2E = "admin-e2e@uji.mandalika.test";
export const SANDI_ADMIN_E2E = "sandi-e2e-12345";

export default async function siapkan() {
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
